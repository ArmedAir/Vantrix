"use client";

import { cn } from "@/lib/utils";

/**
 * One tap target, shared by every onboarding step (mystery hook, one-big-
 * choice, micro-scenario). Deliberately plain — per build doc §1, the
 * narrative copy is doing the work, not button decoration.
 */
export function OnboardingChoiceButton({
  label,
  sublabel,
  onClick,
  emoji,
}: {
  label: string;
  sublabel?: string;
  onClick: () => void;
  emoji?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border border-border-hairline px-5 py-4",
        "transition-colors ease-premium hover:border-gold-500/50 hover:bg-white/[0.03]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50"
      )}
    >
      <span className="flex items-baseline gap-2">
        {emoji && <span aria-hidden>{emoji}</span>}
        <span className="font-semibold text-text-primary">{label}</span>
      </span>
      {sublabel && (
        <span className="block mt-1 text-sm text-text-secondary">{sublabel}</span>
      )}
    </button>
  );
}

/**
 * FRICTION-REDUCTION PASS: every pre-chat quiz step now renders this same
 * "skip ahead" link beneath its choices. Previously the only way through
 * hook/intent/scenario was answering all three — a visitor who just
 * wanted to start talking had no way out short of closing the tab. This
 * jumps straight to the character reveal with whatever signals were
 * already collected (selectCharacter degrades gracefully to a popularity
 * tiebreaker on missing signals — see that module's zero-signal branch),
 * so skipping costs the personalization quality of the first pick, not
 * the ability to proceed.
 */
export function OnboardingSkipLink({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      type="button"
      onClick={onSkip}
      className="mt-6 text-xs text-text-tertiary hover:text-text-secondary underline transition-colors ease-premium"
    >
      Skip — just show me someone
    </button>
  );
}

/** Tiny "step X of 3" indicator so the quiz doesn't feel open-ended —
 *  perceived length is itself a friction source independent of actual
 *  step count. Only rendered on the three quiz steps, not reveal/opening/
 *  chat, which aren't part of the "how many more of these" question. */
export function OnboardingStepProgress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <p className="text-[11px] uppercase tracking-wide text-text-tertiary mb-4">
      Step {step} of 3
    </p>
  );
}
