import { THEME_STORAGE_KEY, THEME_META_COLOR, THEMES } from "./constants";

/**
 * GOLD-FLASH-FIX (2026-09-25): this used to be a hand-maintained duplicate
 * copy living at public/theme-init.js, loaded via
 * `<Script src="/theme-init.js" strategy="beforeInteractive">`. That file's
 * own header comment explained why it had to be an external file rather
 * than an inline one: the CSP in middleware.ts only allows inline scripts
 * carrying a per-request nonce, and the root layout deliberately doesn't
 * read headers()/cookies() to get one (that would force every route,
 * including static marketing pages, into dynamic rendering just to paint
 * the right theme).
 *
 * That reasoning missed a real cost of the external-file approach: even a
 * `beforeInteractive`, same-origin, cached script still requires a network
 * fetch to complete before it can execute — and the browser can (and, per
 * a real bug report, does) paint the server-rendered HTML using :root's
 * default gold CSS variables *before* that fetch resolves, then repaint
 * once it does. On an ordinary page that's a sub-perceptible flash; on the
 * boot splash added this same week — full-screen, brand-colored, and
 * specifically designed to be the very first thing visible — that gap
 * became a real, visible "gold, then the real theme" flash for anyone who
 * had actually picked nova/velvet/aurora.
 *
 * Fix: inline this script's *content* directly into the HTML (zero fetch,
 * runs the instant the parser reaches it, before the browser can paint
 * anything after it) and satisfy CSP with a hash-based source instead of a
 * nonce — `'sha256-<digest>'` is CSP's purpose-built allowance for exactly
 * this case (static, unchanging inline script content that doesn't need a
 * per-request value), and unlike a nonce it costs nothing to keep fully
 * static. See middleware.ts's CSP_THEME_INIT_SCRIPT_HASH for the other
 * half of this, and arch-theme-init-csp-hash.test.ts, which recomputes
 * that hash from this exact string and fails the build if the two ever
 * drift apart.
 *
 * Generated from the real theme constants (rather than hand-duplicated,
 * which is what public/theme-init.js's own comment warned future editors
 * to keep in sync "by hand") — this can't drift from THEMES/
 * THEME_STORAGE_KEY/THEME_META_COLOR the way that file could.
 */
export const THEME_INIT_SCRIPT = `(function () {
  try {
    var STORAGE_KEY = ${JSON.stringify(THEME_STORAGE_KEY)};
    var VALID_THEMES = ${JSON.stringify(THEMES.filter((t) => t !== "gold"))};
    var META_COLORS = ${JSON.stringify(
      Object.fromEntries(THEMES.filter((t) => t !== "gold").map((t) => [t, THEME_META_COLOR[t]])),
    )};

    var value = window.localStorage.getItem(STORAGE_KEY);
    if (VALID_THEMES.indexOf(value) !== -1) {
      document.documentElement.setAttribute("data-theme", value);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", META_COLORS[value]);
    }
  } catch (e) {}
})();`;

/**
 * CSP allowance for the exact script above, consumed by middleware.ts's
 * script-src directive. A static string literal, not computed at runtime
 * from THEME_INIT_SCRIPT — this file is imported by middleware.ts, which
 * runs on the Edge Runtime, and Edge doesn't have Node's `crypto` module
 * (only the async Web Crypto `crypto.subtle`, awkward to use for a value
 * needed synchronously at module scope). Kept honest by
 * arch-theme-init-csp-hash.test.ts, which runs in Node (Vitest, not Edge),
 * independently recomputes this hash from THEME_INIT_SCRIPT with Node's
 * real `crypto` module, and fails if the two ever disagree — so an edit to
 * the script above that forgets to update this hash breaks CI rather than
 * silently shipping a CSP violation that blocks the script in production.
 */
export const THEME_INIT_SCRIPT_CSP_HASH = "sha256-ugOMaJLWfZ3zr0YtYknwX1+7pRdn2KA+J36nEtgNlZA=";

