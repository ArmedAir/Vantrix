/**
 * Vantrix service worker.
 *
 * Scope is deliberately narrow: this exists to satisfy
 * `navigator.serviceWorker.ready` for Web Push (use-push-subscription.ts
 * calls `pushManager.subscribe()` off the active registration — without a
 * registered worker that call has nothing to attach to) and to display
 * incoming push notifications. It is NOT an offline-first asset cache —
 * this app is a dynamic, auth-gated Supabase-backed shell, and caching
 * HTML/API responses here would risk serving stale/wrong-user data. If
 * true offline support is wanted later, add a narrowly-scoped
 * runtime cache for static assets only (fonts, icons), not routes.
 *
 * v2 adds exactly one narrowly-scoped exception to that "not routes"
 * rule: a single static offline.html, precached at install time and
 * served ONLY when a navigation request fails with no network at all
 * (see the fetch handler below). It is never used as a stand-in for an
 * actual page — a real HTTP error (4xx/5xx) still reaches the browser
 * normally, this only fires on a network failure — and it holds no
 * user/session data, so the "risk serving stale/wrong-user data"
 * concern above doesn't apply to it.
 *
 * CACHE_VERSION exists only so clear-caches.ts (src/lib/pwa/clear-caches.ts)
 * has something deterministic to delete when the app wants to force a
 * clean slate (e.g. after a logout, or a breaking client update).
 */

const CACHE_VERSION = "vantrix-sw-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_VERSION);
        await cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]);
      } catch {
        // Best-effort — a failed precache just means no offline fallback
        // until the next successful install, not a broken SW.
      }
    })()
  );
  // Activate immediately rather than waiting for all tabs to close.
  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  // Only ever intercept top-level navigations (actual page loads), and
  // only to supply the offline fallback on a hard network failure.
  // Everything else (API calls, assets, RSC fetches) passes straight
  // through untouched, exactly as before this addition.
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request);
      } catch {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(OFFLINE_URL);
        return cached || Response.error();
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

/**
 * Push payloads are JSON-encoded by lib/push/* server-side (see
 * push/subscribe route + whatever calls web-push's sendNotification) as
 * { title, body, url, icon? }. Falls back to a generic notification if
 * the payload is missing or malformed rather than dropping the push
 * silently — a push with no visible notification can get the origin's
 * push permission revoked by the browser.
 */
self.addEventListener("push", (event) => {
  let payload = { title: "Vantrix", body: "You have a new notification.", url: "/notifications" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Non-JSON push data — keep the fallback payload above.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || "/icons/icon-192.png",
      badge: "/icons/icon-128.png",
      data: { url: payload.url || "/notifications" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/notifications";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = allClients.find((c) => new URL(c.url).pathname === targetUrl);
      if (existing) {
        existing.focus();
        return;
      }
      const matchingOrigin = allClients.find((c) => c.url.startsWith(self.location.origin));
      if (matchingOrigin) {
        matchingOrigin.focus();
        matchingOrigin.navigate(targetUrl);
        return;
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});
