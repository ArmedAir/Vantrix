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

export const metadata: Metadata = {
  title: "Vantrix",
  description: "Someone has been trying to figure you out.",
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
