import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

/**
 * /enter — the "First Chapter" pre-signup onboarding flow.
 * See docs/vantrix-onboarding-conversion-build.md for the full spec.
 *
 * Deliberately no PublicHeader/nav chrome on this route (per build doc
 * §1.1 — "no explanation of the platform, make the user curious"). A
 * returning visitor should not land here repeatedly — enforced upstream:
 * middleware.ts redirects every first-time, signed-out visit to "/" here
 * (root traffic decision, 2026-09-06), tracked via a `vx_seen` cookie so
 * it only ever fires once per browser. See that file's own doc comment
 * for the crawler exemption and deep-link handling.
 *
 * force-dynamic: nothing here is user-specific server-side (the flow
 * itself is entirely client-state), but the character pool it fetches
 * client-side changes continuously — same reasoning the (seo)/companions
 * page uses for its own force-dynamic.
 */
export const dynamic = "force-dynamic";

// BRAND-DISAMBIGUATION FIX: this used to be a flat `title: "Vantrix"` —
// bare "Vantrix" with no AI/companion context, on the one route every
// signed-out crawler that isn't on the KNOWN_CRAWLER_UA_PATTERN allowlist
// in middleware.ts (GPTBot, ClaudeBot, PerplexityBot, etc. — see that
// file's own fix comment) actually gets redirected to. That combination
// meant exactly the AI-answer-engine crawlers llms.txt is written for
// were seeing the least disambiguated title on the whole site. The root
// layout's title template (`%s — Vantrix AI Companions`) now appends the
// disambiguator automatically, so this only needs the page-specific part.
export const metadata: Metadata = {
  title: "Someone Has Been Trying to Figure You Out",
  description:
    "Vantrix — AI companions with persistent memory who remember you, always. Someone has been trying to figure you out.",
};

export default function EnterPage() {
  return (
    <div className="min-h-screen bg-base flex flex-col">
      <div className="px-4 pt-8 text-center">
        <span className="font-display text-lg tracking-tight text-text-primary">
          VANTRIX
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <OnboardingFlow />
      </div>
    </div>
  );
}
