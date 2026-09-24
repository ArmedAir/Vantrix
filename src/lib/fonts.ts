import localFont from "next/font/local";

/**
 * Shared display face for every "premium surface" — auth, the emotional-peak
 * paywall, onboarding. Import this one instance everywhere rather than
 * declaring a font loader again per-file: same variable, same subset, one
 * font, and it guarantees every surface actually matches instead of
 * drifting to slightly different weights over time.
 *
 * Loaded via next/font/local (self-hosted files in ./src/fonts) rather than
 * next/font/google. The Google loader fetches font files from Google's
 * servers during `next build`/`next dev`; on a network-restricted build
 * host (sandboxed CI, offline dev containers, egress firewalls that don't
 * allow fonts.gstatic.com) that fetch fails and — because it happens inside
 * the Next.js font SWC transform, not app code — takes the whole build down.
 * Self-hosting removes the network dependency entirely, in every
 * environment, with no env var or branching needed.
 *
 * Fraunces is a variable font, so one file covers the whole weight range
 * (100-900) instead of needing a separate file per static weight.
 *
 * WOFF2 (not the original TTF): a real Lighthouse run on the marketing
 * homepage measured LCP = 5.8s (mobile, "poor" — under 2.5s is "good"),
 * with the LCP element being the hero <h1>, set in this exact face. The
 * source TTFs were raw/uncompressed — Fraunces alone was 352 KiB — so on
 * the "Slow 4G" profile Lighthouse tests with, just downloading the font
 * this heading needs plausibly accounts for most of that gap on its own.
 * Converted with `fonttools ttLib.woff2 compress` (lossless container
 * change, not a re-render — verified identical glyph count and variable
 * axes before/after): -46% for Fraunces, -43% for Fraunces-Italic, -68%
 * for Manrope below. WOFF2 has been universal across evergreen browsers
 * since 2016, so this has no compatibility downside.
 */
export const display = localFont({
  src: [
    {
      path: "../fonts/Fraunces.woff2",
      style: "normal",
      weight: "100 900",
    },
    {
      path: "../fonts/Fraunces-Italic.woff2",
      style: "italic",
      weight: "100 900",
    },
  ],
  variable: "--font-display",
  // Serif fallback so text doesn't reflow/jump while Fraunces loads.
  fallback: ["Georgia", "Cambria", "Times New Roman", "serif"],
});

/**
 * Body / UI face for the black & gold theme (FRONTEND_DIRECTIVE §1, §8).
 * Manrope is a geometric grotesque with a wide weight range in one
 * variable file — used for nav, buttons, body copy, and numeric stats
 * (its tabular-leaning figures keep stat strips from jittering in width).
 * Self-hosted for the same reason as `display` above: no network
 * dependency at build time.
 */
export const sans = localFont({
  src: "../fonts/Manrope.woff2",
  variable: "--font-sans",
  weight: "200 800",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
