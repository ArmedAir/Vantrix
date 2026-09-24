import type { Metadata } from "next";
import Link from "next/link";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { Logo } from "@/components/shell/logo";

/**
 * /enter — the "First Chapter" pre-signup onboarding flow.
 * See docs/vantrix-onboarding-conversion-build.md for the full spec.
 *
 * Deliberately no PublicHeader/nav chrome on this route (per build doc
 * §1.1 — "no explanation of the platform, make the user curious").
 *
 * ROUTING CHANGE (2026-09-18): middleware.ts no longer auto-redirects
 * first-time signed-out visitors here from "/" — that redirect (and the
 * vx_seen cookie it depended on) was removed per explicit request, so
 * "/" now shows the real marketing homepage to every anon visitor,
 * first-time or returning, same as it already did for crawlers. This
 * page itself is untouched and still fully reachable at /enter directly
 * (e.g. for a future A/B test, an ad-specific landing link, or simply
 * choosing to bring the redirect back later) — only the automatic
 * routing into it was disabled.
 *
 * force-dynamic: nothing here is user-specific server-side (the flow
 * itself is entirely client-state), but the character pool it fetches
 * client-side changes continuously — same reasoning the (seo)/companions
 * page uses for its own force-dynamic.
 */
export const dynamic = "force-dynamic";

// BRAND-DISAMBIGUATION FIX: this used to be a flat `title: "Vantrix"` —
// bare "Vantrix" with no AI/companion context. The root layout's title
// template (`%s — Vantrix AI Companions`) now appends the disambiguator
// automatically, so this only needs the page-specific part.
export const metadata: Metadata = {
  title: "Someone Has Been Trying to Figure You Out",
  description:
    "Vantrix — AI companions with persistent memory who remember you, always. Someone has been trying to figure you out.",
};

export default function EnterPage() {
  return (
    <div className="min-h-screen bg-base flex flex-col">
      {/* WORDMARK-REMOVED FIX: was a bare "VANTRIX" text span with no
          Logo component at all — swapped for the same logo mark every
          other header uses (TopBar, PublicHeader), so the brand mark is
          visually consistent across the whole app instead of this one
          route being the only place with a plain-text version of it.
          LOGO-ANIMATION FIX: wordmark restored via withWordmark
          (animated + theme-reactive, see logo.tsx). */}
      {/* ONE-CLICK-LOGIN FIX: this page previously had zero login entry
          point — middleware.ts force-routes every first-time signed-out
          visitor to "/" here, and the only path back to /login was
          buried 3 steps deep inside the onboarding flow (reveal ->
          opening -> guest chat -> sign-up prompt). Anyone who actually
          wanted to log in (a returning user on a new device/browser, a
          user clicking a "Log In" link shared from elsewhere, etc.) had
          no way to do it without first playing through the whole funnel.
          This is a direct, single-hop `/login` link — no redirects, no
          intermediate steps — kept minimal so it doesn't fight the
          flow's intentionally chrome-free/curiosity-first design (see
          the docstring above). */}
      <div className="px-4 pt-8 flex items-center justify-between">
        <Logo size={28} withWordmark wordmarkClassName="text-lg" />
        <Link
          href="/login"
          className="text-sm font-semibold text-text-secondary hover:text-gold-400 transition-colors ease-premium"
        >
          Log In
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <OnboardingFlow />
      </div>
    </div>
  );
}
