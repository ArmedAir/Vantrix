"use client";

import { SafeImage as Image } from "@/components/ui/safe-image";
import { Button } from "@/components/ui/button";
import { resolveImageSrc } from "@/lib/utils";
import type { CharacterMatch } from "@/lib/onboarding/select-character";

/**
 * Step 4 — see build doc §1.4. Two rules that matter here, both from the
 * build doc and non-negotiable:
 *
 * 1. The "Based on what you've shown us" line IS the disclosure moment
 *    (§4) — it must always name this as an inference from the visitor's
 *    own choices, never imply hidden analysis or certainty.
 * 2. "Try another" must route to a genuinely different character
 *    (enforced by select-character.ts's `exclude` param, not here) —
 *    a fake reshuffle that looks the same reads as broken, not responsive.
 */
export function CharacterReveal({
  match,
  onMeetHer,
  onTryAnother,
}: {
  match: CharacterMatch;
  onMeetHer: () => void;
  onTryAnother: () => void;
}) {
  const { character, matchedTags } = match;
  const traitLine = matchedTags.length > 0
    ? `you tend to value ${matchedTags.slice(0, 2).join(" and ")}`
    : "you're still figuring out what you're looking for — that's alright too";

  return (
    <div className="max-w-md mx-auto text-center">
      <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden border border-border-hairline">
        <Image
          src={resolveImageSrc(character.image_url)}
          alt={character.name}
          fill
          sizes="160px"
          className="object-cover"
        />
      </div>

      <p className="mt-6 font-display text-2xl text-text-primary">{character.name}</p>
      {character.description && (
        <p className="mt-2 text-text-secondary text-[15px] leading-relaxed">
          {character.description}
        </p>
      )}

      <p className="mt-6 text-xs uppercase tracking-wide text-text-tertiary">
        Why Vantrix suggested her
      </p>
      <p className="mt-1.5 text-sm text-text-secondary">
        Based on what you&apos;ve shown us, {traitLine}.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <Button size="lg" onClick={onMeetHer}>
          Meet her
        </Button>
        <Button variant="ghost" onClick={onTryAnother}>
          Try another
        </Button>
      </div>
    </div>
  );
}
