/**
 * Loaded via next/script with strategy="beforeInteractive" in
 * src/app/layout.tsx, right alongside theme-init.js and surface-init.js.
 *
 * Decides — before <body> exists, so before anything can paint — whether
 * this page load should show the branded launch animation
 * (src/components/shell/boot-splash.tsx + src/app/boot-splash.css), and if
 * so sets data-boot="play" on <html>. The splash is `display: none` by
 * default in CSS, so a plain browser visit, a crawler, or a no-JS client
 * never sees it and never downloads its image (this is deliberate: the
 * marketing pages are Lighthouse/LCP-audited and must stay untouched).
 *
 * WHEN IT PLAYS: once per app launch, and only where the user is "opening
 * an app" rather than visiting a website:
 *   - installed PWA / home-screen launch (display-mode: standalone etc.)
 *   - the Capacitor / Tauri / Android-WebView shells
 *   - any page opened with ?splash=1 (forces it, for design review in a
 *     desktop browser — ignores the once-per-session flag)
 * Flip ALWAYS_ON_WEB to true to also play it for regular browser tabs.
 *
 * WHY THIS EXISTS: the very first screen a launched PWA shows (heart icon +
 * name on the dark background) is drawn by Android from manifest.webmanifest
 * and cannot be animated. Everything after it — network, JS download,
 * hydration — used to be a static wait. This picks up exactly where that OS
 * splash leaves off (same background, heart at the same centre point) and
 * turns the wait into the animation.
 *
 * Same constraints as theme-init.js: plain dependency-free same-origin
 * static file (the CSP only allows nonce'd inline scripts, and the root
 * layout deliberately isn't dynamic), so it can't import TS. Keep
 * BOOT_STORAGE_KEY and HEART_URL in sync with boot-splash.tsx /
 * boot-splash.css by hand (arch-boot-splash.test.ts guards this).
 */
(function () {
  try {
    var BOOT_STORAGE_KEY = "vantrix-boot-seen";
    var HEART_URL = "/icons/splash-heart-v1.webp";
    var ALWAYS_ON_WEB = false;

    var nav = window.navigator;
    var mm = window.matchMedia
      ? function (q) { return window.matchMedia(q).matches === true; }
      : function () { return false; };

    var standalone =
      mm("(display-mode: standalone)") ||
      mm("(display-mode: fullscreen)") ||
      mm("(display-mode: minimal-ui)") ||
      nav.standalone === true;

    var nativeShell =
      !!(window.Capacitor || window.__TAURI__ || window.__TAURI_INTERNALS__) ||
      /; wv\)/.test(nav.userAgent || "");

    var forced = /[?&]splash=1(&|$)/.test(window.location.search);

    var seen = false;
    try {
      seen = window.sessionStorage.getItem(BOOT_STORAGE_KEY) === "1";
    } catch (e) {
      // sessionStorage blocked — treat as "not seen"; worst case the
      // splash replays on a full reload, which is harmless.
    }

    var eligible = forced || ((standalone || nativeShell || ALWAYS_ON_WEB) && !seen);
    if (!eligible) return;

    var root = document.documentElement;
    root.setAttribute("data-boot", "play");

    // boot-splash.tsx subtracts this from performance.now() so time the
    // page already spent loading counts toward the animation's minimum
    // length instead of being added on top of it.
    window.__vxBootT0 = window.performance && performance.now ? performance.now() : 0;

    try {
      window.sessionStorage.setItem(BOOT_STORAGE_KEY, "1");
    } catch (e) {}

    // Start fetching the heart now, during <head> parsing, instead of
    // whenever the stylesheet gets around to needing it.
    var link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = HEART_URL;
    document.head.appendChild(link);
  } catch (e) {
    // Any failure = no splash for this load. Never block the app on it.
  }
})();
