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

/**
 * CLS-FIX: this was a single line of text ("Loading…") inside the same
 * vertically-centered flex container CharacterReveal renders into once
 * data arrives. A real Lighthouse run measured CLS = 0.181 ("needs
 * improvement", Google's threshold for "good" is under 0.1) on exactly
 * this page — swapping ~20px of text for CharacterReveal's actual
 * rendered height (a 160px circular photo plus name, description, goal
 * box, trait line, and two buttons — easily 450px+) inside an
 * `items-center` flex box is precisely what the Cumulative Layout Shift
 * metric penalizes: real, already-painted pixels moving as a result of
 * script, not just new content appearing below the fold. This skeleton
 * mirrors CharacterReveal's actual structure and approximate sizing
 * (same circle diameter, same number/rough width of text lines, same
 * two stacked buttons) so the loading -> reveal transition changes very
 * little about the page's total height, instead of jumping from one
 * line to a full card.
 */
function CharacterRevealSkeleton() {
  return (
    <div className="max-w-md mx-auto text-center animate-pulse" aria-hidden="true">
      <div className="w-40 h-40 mx-auto rounded-full bg-surface-raised border border-border-hairline" />
      <div className="mt-6 h-7 w-32 mx-auto rounded bg-surface-raised" />
      <div className="mt-3 h-4 w-full max-w-[280px] mx-auto rounded bg-surface-raised" />
      <div className="mt-2 h-4 w-3/4 max-w-[220px] mx-auto rounded bg-surface-raised" />
      <div className="mt-4 h-14 w-full rounded-lg bg-surface-raised" />
      <div className="mt-6 h-3 w-40 mx-auto rounded bg-surface-raised" />
      <div className="mt-2 h-4 w-56 mx-auto rounded bg-surface-raised" />
      <div className="mt-8 flex flex-col gap-3">
        <div className="h-11 w-full rounded-lg bg-surface-raised" />
        <div className="h-11 w-full rounded-lg bg-surface-raised" />
      </div>
    </div>
  );
}

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
      {step === "loading" && <CharacterRevealSkeleton />}

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
