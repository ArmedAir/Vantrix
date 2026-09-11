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
  return (
    <Link
      href={href}
      onClick={() => pingCharacterClick(c.id)}
      className="group flex flex-col overflow-hidden rounded-lg border border-border-hairline bg-base shadow-card transition-colors ease-premium hover:border-gold-500/40"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {c.image_url ? (
          <Image
            src={resolveImageSrc(c.image_url)}
            alt={c.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
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
