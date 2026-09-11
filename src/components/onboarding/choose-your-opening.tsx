"use client";

import { OnboardingChoiceButton } from "./onboarding-choice-button";

/**
 * Step 5 — see build doc §1.5. Critically, this is NOT a separate
 * scripted interstitial: the option the visitor picks here becomes the
 * literal first message sent to /api/chat/guest (see
 * onboarding-flow.tsx's handOff, which passes the chosen line straight
 * into GuestChatWidget's seededFirstMessage prop). Zero engineering
 * duplication, and the character responds in-character from turn one.
 */
const OPTIONS: { id: "a" | "b" | "c" | "silence"; label: string; message: string | null }[] = [
  { id: "a", label: '"Maybe I am."', message: "Maybe I am." },
  { id: "b", label: '"I wasn\'t."', message: "I wasn't." },
  { id: "c", label: '"You\'re assuming a lot."', message: "You're assuming a lot." },
  { id: "silence", label: "Say nothing", message: null },
];

export function ChooseYourOpening({
  characterName,
  onChoose,
}: {
  characterName: string;
  onChoose: (choice: "a" | "b" | "c" | "silence", message: string | null) => void;
}) {
  return (
    <div className="max-w-md mx-auto text-center">
      <p className="text-text-secondary text-sm">Your first night with {characterName}</p>
      <p className="mt-3 text-text-primary text-[15px] leading-relaxed text-balance">
        It&apos;s raining. She finds you sitting alone at a nearly empty bar.
        She sits beside you.
      </p>
      <p className="mt-3 font-display text-lg text-text-primary text-balance">
        &ldquo;You look like you&apos;re waiting for someone.&rdquo;
      </p>
      <div className="mt-8 space-y-3">
        {OPTIONS.map((opt) => (
          <OnboardingChoiceButton
            key={opt.id}
            label={opt.label}
            onClick={() => onChoose(opt.id, opt.message)}
          />
        ))}
      </div>
    </div>
  );
}
