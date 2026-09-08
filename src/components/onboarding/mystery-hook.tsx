"use client";

import { OnboardingChoiceButton, OnboardingSkipLink, OnboardingStepProgress } from "./onboarding-choice-button";
import type { IdentityChoice } from "@/lib/onboarding/signals";

/**
 * Step 1 of the "First Chapter" flow — see build doc §1.1.
 * No product explanation, no nav chrome. The goal is one decision inside
 * the first few seconds, not comprehension of what Vantrix is.
 */
const OPTIONS: { value: IdentityChoice; label: string }[] = [
  { value: "unforgettable", label: "Someone unforgettable" },
  { value: "dangerous", label: "Someone dangerous" },
  { value: "safe", label: "Someone safe" },
  { value: "irreplaceable", label: "Someone impossible to replace" },
  { value: "unsure", label: "I don't know yet" },
];

export function MysteryHook({
  onChoose,
  onSkip,
}: {
  onChoose: (choice: IdentityChoice) => void;
  onSkip: () => void;
}) {
  return (
    <div className="max-w-md mx-auto text-center">
      <OnboardingStepProgress step={1} />
      <p className="font-display text-2xl md:text-3xl text-text-primary tracking-tight text-balance">
        Someone has been trying to figure you out.
      </p>
      <p className="mt-4 text-text-secondary text-[15px]">
        Before you meet them —
        <br />
        how do you want to be remembered?
      </p>
      <div className="mt-8 space-y-3">
        {OPTIONS.map((opt) => (
          <OnboardingChoiceButton
            key={opt.value}
            label={opt.label}
            onClick={() => onChoose(opt.value)}
          />
        ))}
      </div>
      <OnboardingSkipLink onSkip={onSkip} />
    </div>
  );
}
