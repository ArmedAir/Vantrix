"use client";

import { OnboardingChoiceButton, OnboardingSkipLink, OnboardingStepProgress } from "./onboarding-choice-button";
import type { IntentChoice } from "@/lib/onboarding/signals";

/** Step 2 — see build doc §1.2. Primary signal for character selection. */
const OPTIONS: { value: IntentChoice; emoji: string; label: string; sublabel: string }[] = [
  { value: "connection", emoji: "❤️", label: "Connection", sublabel: "I want someone who gets me." },
  { value: "chemistry", emoji: "🔥", label: "Chemistry", sublabel: "I want tension." },
  { value: "depth", emoji: "🧠", label: "Deep conversation", sublabel: "I want someone interesting." },
  { value: "escape", emoji: "🎭", label: "Escape", sublabel: "Take me somewhere else." },
  { value: "surprise", emoji: "🎲", label: "Surprise me", sublabel: "You choose." },
];

export function OneBigChoice({
  onChoose,
  onSkip,
}: {
  onChoose: (choice: IntentChoice) => void;
  onSkip: () => void;
}) {
  return (
    <div className="max-w-md mx-auto text-center">
      <OnboardingStepProgress step={2} />
      <p className="font-display text-2xl md:text-3xl text-text-primary tracking-tight">
        What sounds better tonight?
      </p>
      <div className="mt-8 space-y-3">
        {OPTIONS.map((opt) => (
          <OnboardingChoiceButton
            key={opt.value}
            emoji={opt.emoji}
            label={opt.label}
            sublabel={opt.sublabel}
            onClick={() => onChoose(opt.value)}
          />
        ))}
      </div>
      <OnboardingSkipLink onSkip={onSkip} />
    </div>
  );
}
