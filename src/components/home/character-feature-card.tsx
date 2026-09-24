"use client";

import Link from "next/link";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { resolveImageSrc } from "@/lib/utils";
import type { DiscoverCharacter } from "@/lib/frontend/discover";

/** Fire-and-forget — same POST /api/characters/click contract as
 * companion-card.tsx, so this grid feeds the same trending/
 * recommendation signal every other discovery card on Home does. */
function pingCharacterClick(id: string) {
  fetch("/api/characters/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
    keepalive: true,
  }).catch(() => {});
}

export function CharacterFeatureCard({
  character: c,
  href,
}: {
  character: DiscoverCharacter;
  href: string;
}) {
  // GLASSMORPHIC (2026-09-14 pass): only ever 6 of these on screen at
  // once (Home's Meet-the-world grid, see character-features.tsx's
  // `.slice(0, 6)`), unlike CompanionCard/MediaCard which can hit ~200
  // in the /characters grid — so unlike that component, a real
  // backdrop-blur here is cheap. Content panel sits below the image on
  // the card's own (visible) background, so glass reads as intended
  // here rather than being wasted under a full-bleed photo.
  return (
    <Link
      href={href}
      onClick={() => pingCharacterClick(c.id)}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-gold-500/15 bg-base/60 shadow-glass backdrop-blur-xl backdrop-saturate-150 ring-1 ring-inset ring-white/[0.05] transition-[border-color,box-shadow,transform] duration-300 ease-premium hover:border-gold-500/50 hover:shadow-glass-hover hover:-translate-y-0.5"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {c.image_url ? (
          <Image
            src={resolveImageSrc(c.image_url)}
            alt={c.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            // OBJECT-POSITION-FIX: default object-cover centers the crop,
            // but these are tall portrait photos with the face near the
            // top -- centering on a 4:3 box was cropping straight through
            // the head (nose-down on one character, chin-down on another,
            // per a real screenshot report). object-top anchors the crop
            // to the top of the source image instead, so the head is
            // always what's kept, never what's cut.
            className="object-cover object-top"
          />
        ) : (
          <div className="h-full w-full bg-border-hairline" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-text-primary">{c.name}</h3>
          {c.is_live && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-gold-500">
              Live
            </span>
          )}
        </div>
        {c.archetype && (
          <p className="mt-1 text-sm text-text-secondary">{c.archetype}</p>
        )}
        {c.description && (
          <p className="mt-3 line-clamp-2 text-sm leading-6 text-text-secondary">
            {c.description}
          </p>
        )}
        <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-gold-400 group-hover:text-gold-300">
          Start chatting
          <span aria-hidden>&rarr;</span>
        </div>
      </div>
    </Link>
  );
}
