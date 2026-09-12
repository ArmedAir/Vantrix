import { CharacterFeatureCard } from "./character-feature-card";
import { CharacterCircleViewer } from "./character-circle-viewer";
import type { DiscoverCharacter } from "@/lib/frontend/discover";

/**
 * CHARACTER-FEATURES FIX (2026-09-08): replaces PlatformFeatures — a
 * fixed, hand-written array of five marketing cards (Dating/World/
 * Community/Studio/Digital Twin, no character in sight) — with a
 * section actually built from the real character rows Home already
 * fetches (`characters`, a slice of `allCharacters`). Circle strip up
 * top (CharacterCircleViewer) for a quick browse, then a card grid
 * with each character's real image/tags/like count instead of static
 * body copy, linking straight into their chat.
 */
export function CharacterFeatures({
  characters,
  signedOut = false,
}: {
  characters: DiscoverCharacter[];
  /** RSC-BOUNDARY FIX (2026-09-09): previously took a `hrefFor: (id) =>
   * string` function so a signed-out LandingPage caller could route cards
   * through /login?mode=sign-up&redirect=... instead of the raw
   * /characters/<id> path. CharacterFeatures itself is a Server Component,
   * so accepting the function was fine here — but it forwarded that same
   * function into CharacterCircleViewer, a "use client" component, which
   * is not allowed (functions aren't serializable across the RSC
   * boundary) and crashed "/"'s entire render in production. Replaced
   * with this boolean; the href is now built locally (matching the exact
   * shape CharacterFeatureCard already used) and CharacterCircleViewer
   * builds its own from the same flag. See that component's own note. */
  signedOut?: boolean;
}) {
  if (characters.length === 0) return null;

  const grid = characters.slice(0, 6);
  const hrefFor = (id: string) =>
    signedOut
      ? `/login?mode=sign-up&redirect=${encodeURIComponent(`/characters/${id}`)}`
      : `/characters/${id}`;

  return (
    <section id="features" className="px-5 pb-24 md:px-8 md:pb-32">
      <div className="mx-auto max-w-[1320px]">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-500">
            Meet the world
          </p>
          <h2 className="mt-4 font-display text-4xl leading-tight tracking-[-0.03em] md:text-5xl">
            Real companions, not a feature list.
          </h2>
          <p className="mt-5 text-base leading-7 text-text-secondary md:text-lg">
            Browse the people already living on Vantrix — tap a portrait for a closer look, or open a card to start talking.
          </p>
        </div>

        <div className="mt-8">
          <CharacterCircleViewer characters={characters.slice(0, 12)} signedOut={signedOut} />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {grid.map((c) => (
            <CharacterFeatureCard key={c.id} character={c} href={hrefFor(c.id)} />
          ))}
        </div>
      </div>
    </section>
  );
}
