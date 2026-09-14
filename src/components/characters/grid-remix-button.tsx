"use client";

import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";

/**
 * Icon-only variant of RemixButton for overlaying on a grid card that's
 * already wrapped in its own <Link> (see characters-browse.tsx — MediaCard
 * wraps its whole card in a Link, so this can't be a nested <a>/Link
 * itself). Plain <button> + router.push, with stopPropagation/
 * preventDefault so a tap here never also triggers the card's own
 * navigation to the chat page underneath it.
 */
export function GridRemixButton({ characterId }: { characterId: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="Remix this character"
      title="Remix this character"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(`/studio/create?remixOf=${characterId}`);
      }}
      className="flex items-center justify-center h-8 w-8 rounded-full bg-black/70 border border-white/10 text-gold-400 backdrop-blur-md hover:bg-black/85 hover:border-gold-500/40 transition-colors"
    >
      <Wand2 className="h-4 w-4" />
    </button>
  );
}
