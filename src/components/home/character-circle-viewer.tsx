"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { resolveImageSrc } from "@/lib/utils";
import type { DiscoverCharacter } from "@/lib/frontend/discover";

/** Fire-and-forget — matches companion-card.tsx's own click-tracking
 * contract (POST /api/characters/click) so circles feed the same
 * trending/recommendation signal every other discovery card does. */
function pingCharacterClick(id: string) {
  fetch("/api/characters/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
    keepalive: true,
  }).catch(() => {});
}

/**
 * CIRCLE-VIEWER FIX (2026-09-08): replaces the old static "Beyond the
 * chat" marketing grid's lack of any character-facing visual with a
 * round-portrait strip driven by real character rows (`characters`,
 * the same DiscoverCharacter[] the rest of Home already has in hand —
 * no new fetch). Tapping a circle opens a lightweight full-image
 * lightbox with name/archetype and a straight link into that
 * character's chat, rather than duplicating CharacterStatusRing's
 * seen/unseen story-viewer machinery, which is a separate feature
 * with its own localStorage + server-sync contract.
 */
export function CharacterCircleViewer({
  characters,
  hrefFor = (id: string) => `/characters/${id}`,
}: {
  characters: DiscoverCharacter[];
  /** Lets a signed-out caller (LandingPage) route through its own
   * /login?mode=sign-up&redirect=... helper instead of the raw path. */
  hrefFor?: (id: string) => string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const withImage = characters.filter((c) => c.image_url);

  if (withImage.length === 0) return null;

  const open = withImage.find((c) => c.id === openId) ?? null;

  return (
    <>
      <div className="flex gap-5 overflow-x-auto no-scrollbar px-1 py-1">
        {withImage.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setOpenId(c.id)}
            className="flex flex-col items-center gap-2 shrink-0"
          >
            <div className="relative h-20 w-20 md:h-24 md:w-24 overflow-hidden rounded-full border-2 border-border-hairline transition-colors ease-premium hover:border-gold-500/60">
              <Image
                src={resolveImageSrc(c.image_url)}
                alt={c.name}
                fill
                sizes="96px"
                className="object-cover"
              />
            </div>
            <span className="max-w-[84px] truncate text-xs text-text-secondary">
              {c.name}
            </span>
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenId(null)}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpenId(null)}
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>

          <div
            className="relative w-full max-w-sm overflow-hidden rounded-lg border border-border-hairline bg-base"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-[3/4] w-full">
              <Image
                src={resolveImageSrc(open.image_url)}
                alt={open.name}
                fill
                sizes="384px"
                className="object-cover"
              />
            </div>
            <div className="p-4">
              <div className="font-display text-xl text-text-primary">{open.name}</div>
              {open.archetype && (
                <div className="mt-1 text-sm text-text-secondary">{open.archetype}</div>
              )}
              <Link
                href={hrefFor(open.id)}
                onClick={() => pingCharacterClick(open.id)}
                className="mt-4 inline-block rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-black transition-colors ease-premium hover:bg-gold-400"
              >
                Chat with {open.name}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
