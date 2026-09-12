import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CinematicBackground } from "@/components/immersive/cinematic-background";
import { MotionWrapper } from "@/components/immersive/motion-wrapper";
import { VerificationSeal } from "@/components/immersive/verification-seal";
import { cn } from "@/lib/utils";

/**
 * VERIFICATION-UI: replaces the P0-AGE-GATE-FIX's original plain-text
 * "Mature content" placeholder on /characters/[id] (see that page's own
 * comment above where this is used) with a full credential screen. The
 * two requirements this character's content sits behind — DB-backed age
 * verification and the profiles.nsfw_enabled preference, see
 * character-gate.ts's resolveMatureAccessStatus() — are shown as a
 * checklist rather than folded into one paragraph, so a visitor who has
 * already cleared one of the two sees that reflected immediately instead
 * of being told to "verify your age and enable mature content" as a
 * single undifferentiated instruction when they've already done the
 * first half of it.
 *
 * Every visitor who can reach this component is already signed in —
 * every route under the (app) group redirects a guest to /login before
 * this page renders at all (see (app)/layout.tsx) — so there is no
 * "sign in" branch here, only the two remaining account-level steps.
 */
export function MatureAccessGate({
  characterName,
  ageVerified,
  nsfwEnabled,
}: {
  characterName: string;
  ageVerified: boolean;
  nsfwEnabled: boolean;
}) {
  const remaining = Number(!ageVerified) + Number(!nsfwEnabled);

  return (
    <div className="relative mx-auto max-w-md overflow-hidden px-4 py-20 md:px-8">
      <CinematicBackground intensity="premium" />
      <MotionWrapper className="relative text-center">
        <VerificationSeal state="locked" />

        <h1 className="mt-6 font-display text-2xl text-text-primary">
          {characterName}&apos;s deeper story is sealed
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          Mature scenes are reserved for members who&apos;ve cleared both
          checks below. You&apos;re {remaining === 1 ? "one step" : "two steps"}{" "}
          away.
        </p>

        <ol className="mt-8 list-none space-y-3 text-left">
          <ChecklistRow done={ageVerified} label="Age verified" />
          <ChecklistRow done={nsfwEnabled} label="Mature content enabled" />
        </ol>

        <Button asChild className="mt-8">
          <Link
            href={
              ageVerified ? "/profile/settings" : "/profile/settings#verification"
            }
          >
            Continue in Settings
          </Link>
        </Button>
      </MotionWrapper>
    </div>
  );
}

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-3 rounded-sm border border-border-hairline px-4 py-3">
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          done ? "border-gold-400 bg-gold-fill" : "border-gold-500/30"
        )}
      >
        {done && <Check className="h-3 w-3 text-[#160F02]" strokeWidth={3} />}
      </span>
      <span
        className={cn(
          "text-sm",
          done ? "text-text-primary" : "text-text-secondary"
        )}
      >
        {label}
      </span>
    </li>
  );
}
