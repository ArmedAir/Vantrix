"use client";

import { cn } from "@/lib/utils";

/**
 * One tap target, shared by every onboarding step.
 * Deliberately plain — per build doc §1, the narrative copy is doing the
 * work, not button decoration.
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
