/**
 * Loaded via next/script with strategy="beforeInteractive" in
 * src/app/layout.tsx, right alongside theme-init.js. Runs before
 * hydration/first paint, for the same reason: something client-only
 * has to be known before the rest of the app (here, server-side code on
 * this and every later request) can rely on it.
 *
 * Writes the `vantrix-surface` cookie ("pwa" | "web"). This is what
 * src/lib/supabase/middleware.ts and src/lib/supabase/server.ts read to
 * choose between the "vantrix-auth-pwa" and "vantrix-auth-web" session
 * storage keys (see src/lib/supabase/client.ts for why the split
 * exists: an installed/home-screen launch and a normal browser tab
 * need isolated sessions on the same origin).
 *
 * BUG THIS FIXES: whether a request is running as an installed
 * home-screen app is something only the browser can tell us — there is
 * no reliable server-observable signal for it — so the server-side
 * checks above depend entirely on this cookie already being present.
 * Nothing in the app ever set it before this file existed, so those
 * checks always fell through to their "web" default regardless of
 * which surface the user was actually on. For anyone using the
 * installed app, that meant: middleware never found their real session
 * (filed under the "pwa" key), never forwarded x-verified-user-id, and
 * any route using getAuthedUser() 401'd a genuinely signed-in user —
 * concretely, /api/characters/mine, which is what Studio's "Couldn't
 * load your characters" state was showing.
 *
 * Must be a plain, dependency-free, same-origin static file (not an
 * inline <script>) — same CSP + static-root-layout reasoning as
 * theme-init.js; see that file's header comment for the full
 * explanation. That reasoning applies here unchanged.
 *
 * This re-implements the same standalone-detection check already
 * duplicated between isStandalonePwa() in src/lib/supabase/client.ts
 * and isStandalone() in src/lib/pwa/use-install-prompt.ts. This file
 * can't import TS, so — same caveat theme-init.js already makes about
 * its own constants — keep this in sync with those by hand if the
 * check ever changes.
 *
 * Coverage note: this only runs on a full page load, not on client-side
 * route transitions (those don't re-run beforeInteractive scripts), so
 * it can't retroactively fix the very first server-rendered response of
 * a brand-new browser session, before this has ever executed once. It
 * does guarantee the cookie is correct and current for every request
 * from that point forward — every client-side navigation, every full
 * reload, and every later app launch — which covers the actual
 * reported bug: a session is essentially never just one single
 * server-rendered page.
 */
(function () {
  try {
    var standalone =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches === true) ||
      window.navigator.standalone === true;

    var ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
    document.cookie =
      "vantrix-surface=" + (standalone ? "pwa" : "web") +
      "; path=/; max-age=" + ONE_YEAR_SECONDS + "; SameSite=Lax";
  } catch (e) {
    // matchMedia missing, navigator access blocked, cookies disabled,
    // etc. — worst case the server-side checks keep defaulting to
    // "web" for this load, same as every load before this file existed.
  }
})();
