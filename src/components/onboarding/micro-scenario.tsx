"use client";

import { OnboardingChoiceButton, OnboardingSkipLink, OnboardingStepProgress } from "./onboarding-choice-button";

/**
 * Step 3 — see build doc §1.3. Deliberately a single scenario: one good
 * scenario carries more signal than three shallow ones, and keeps the
 * "first meaningful interaction within 60-90 seconds" goal intact.
 *
 * Response ids here (`1am_text_a`..`d`) are the exact keys
 * lib/onboarding/select-character.ts's SCENARIO_TAG_WEIGHTS expects —
 * keep them in sync if this scenario's options ever change.
 */
const OPTIONS: { id: string; label: string }[] = [
  { id: "1am_text_a", label: '"What\'s wrong?"' },
  { id: "1am_text_b", label: '"Depends who\'s asking."' },
  { id: "1am_text_c", label: "Call immediately." },
  { id: "1am_text_d", label: "Leave them on read." },
];

export function MicroScenario({
  onChoose,
  onSkip,
}: {
  onChoose: (responseId: string) => void;
  onSkip: () => void;
}) {
  return (
    <div className="max-w-md mx-auto text-center">
      <OnboardingStepProgress step={3} />
      <p className="text-text-secondary text-sm">It&apos;s 1:17 AM.</p>
      <p className="mt-2 font-display text-xl md:text-2xl text-text-primary text-balance">
        Someone you care about sends: &ldquo;Are you awake?&rdquo;
      </p>
      <p className="mt-3 text-text-secondary text-sm">What do you do?</p>
      <div className="mt-8 space-y-3">
        {OPTIONS.map((opt) => (
          <OnboardingChoiceButton key={opt.id} label={opt.label} onClick={() => onChoose(opt.id)} />
        ))}
      </div>
      <OnboardingSkipLink onSkip={onSkip} />
    </div>
  );
}
