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
 *
 * ARCH-WORLD-PROOF (2026-09-14): a visitor coming from a single-avatar
 * companion app has no reason to believe "she has a life beyond this
 * chat" is real rather than marketing copy — so this is proven, not
 * claimed, at the very first moment a specific character exists for
 * them: before signup, before the first message, right here at reveal.
 * `character.current_goal` (see public-character.ts's PublicCharacter
 * comment) is the character's own real, always-on ambition field — the
 * same field the in-app "daily life update" memories are generated from
 * — not a canned onboarding line. Shown only when present; a character
 * with no goal set falls back to the existing trait-match copy alone
 * rather than a placeholder.
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

      {character.current_goal && (
        <div className="mt-4 inline-flex items-start gap-2 rounded-lg border border-gold-500/20 bg-gold-500/[0.05] px-3.5 py-2.5 text-left">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" aria-hidden />
          <p className="text-xs leading-relaxed text-text-secondary">
            <span className="font-semibold text-text-primary">Right now:</span>{" "}
            {character.name} is {character.current_goal}
            {" "}— her life keeps going, whether you&apos;re here or not.
          </p>
        </div>
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
