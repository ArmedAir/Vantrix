"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CharacterReveal } from "./character-reveal";
import { ChooseYourOpening } from "./choose-your-opening";
import { GuestChatWidget } from "@/components/public/guest-chat-widget";
import {
  getOnboardingSignals,
  updateOnboardingSignals,
  incrementTriedAnother,
} from "@/lib/onboarding/signals";
import { selectCharacter, type CharacterMatch } from "@/lib/onboarding/select-character";
import type { PublicCharacter } from "@/lib/seo/public-character";

/**
 * The "First Chapter" flow — see docs/vantrix-onboarding-conversion-build.md
 * §1 for the original spec. The 3-step quiz (identity hook / intent /
 * scenario) has been removed; the flow now goes straight from loading
 * into the character reveal. This component owns step sequencing only;
 * every step's actual UI lives in its own file, and the guest chat itself
 * is the existing, unmodified GuestChatWidget (just seeded — see that
 * component's ONBOARDING-SEED comment).
 *
 * The character reveal draws from /api/public/onboarding-characters
 * (anonymous-safe, same public/non-NSFW filter as every other guest-
 * reachable surface) and picks locally via select-character.ts — see
 * that module's docstring on why this is a shallow client-side match,
 * not a parallel recommendation engine. Since the quiz signals no
 * longer exist, selectCharacter runs with an empty signals object,
 * which it already handles gracefully (this is the same code path the
 * old "skip quiz" shortcut used).
 */
type Step = "loading" | "reveal" | "opening" | "chat" | "error";

const CHARACTER_POOL_ENDPOINT = "/api/public/onboarding-characters";

export function OnboardingFlow() {
  const [step, setStep] = useState<Step>("loading");
  const [pool, setPool] = useState<PublicCharacter[]>([]);
  const [match, setMatch] = useState<CharacterMatch | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [seededMessage, setSeededMessage] = useState<string | null>(null);

  const revealMatch = useCallback((sourcePool: PublicCharacter[], excludeIds: string[]) => {
    const signals = getOnboardingSignals();
    const picked = selectCharacter(sourcePool, signals, excludeIds);
    if (!picked) {
      setStep("error");
      return;
    }
    setMatch(picked);
    updateOnboardingSignals({ characterRevealId: picked.character.id });
    setStep("reveal");
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(CHARACTER_POOL_ENDPOINT)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load characters: ${res.status}`);
        return res.json();
      })
      .then((body: { characters: PublicCharacter[] }) => {
        if (cancelled) return;
        if (!body.characters?.length) {
          setStep("error");
          return;
        }
        setPool(body.characters);
        // Quiz removed: go straight from loading to the character reveal.
        revealMatch(body.characters, []);
      })
      .catch(() => {
        if (!cancelled) setStep("error");
      });
    return () => {
      cancelled = true;
    };
  }, [revealMatch]);

  function handleTryAnother() {
    if (!match) return;
    const nextExcluded = [...excluded, match.character.id];
    setExcluded(nextExcluded);
    incrementTriedAnother();
    revealMatch(pool, nextExcluded);
  }

  function handleMeetHer() {
    setStep("opening");
  }

  function handleOpeningChoice(
    choice: "a" | "b" | "c" | "silence",
    message: string | null
  ) {
    updateOnboardingSignals({ openingLineChoice: choice });
    setSeededMessage(message);
    setStep("chat");
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      {step === "loading" && (
        <p className="text-text-tertiary text-sm">Loading…</p>
      )}

      {step === "error" && (
        <div className="max-w-md mx-auto text-center">
          <p className="text-text-secondary text-sm">
            We couldn&apos;t load companions right now.
          </p>
          <Link href="/discover" className="mt-4 inline-block text-gold-400 hover:text-gold-300 text-sm font-semibold">
            Browse companions instead
          </Link>
        </div>
      )}

      {step === "reveal" && match && (
        <CharacterReveal
          match={match}
          onMeetHer={handleMeetHer}
          onTryAnother={handleTryAnother}
        />
      )}

      {step === "opening" && match && (
        <ChooseYourOpening
          characterName={match.character.name}
          onChoose={handleOpeningChoice}
        />
      )}

      {step === "chat" && match && (
        <div className="w-full max-w-md mx-auto">
          <GuestChatWidget
            character={{
              id: match.character.id,
              name: match.character.name,
              image_url: match.character.image_url,
              opening_line: match.character.opening_line,
            }}
            signUpHref={`/login?mode=sign-up&redirect=${encodeURIComponent(
              `/characters/${match.character.id}`
            )}`}
            seededFirstMessage={seededMessage}
          />
        </div>
      )}
    </div>
  );
}
