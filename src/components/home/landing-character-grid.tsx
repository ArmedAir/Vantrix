"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { FilterPillGroup, type FilterPillOption } from "@/components/ui/filter-pills";
import { useCharacterSearch, type GenderFilter } from "@/hooks/use-character-search";
import { resolveImageSrc } from "@/lib/utils";
import type { DiscoverCharacter } from "@/lib/frontend/discover";

const TABS: FilterPillOption[] = [
  { value: "all", label: "All" },
  { value: "female", label: "Girls" },
  { value: "male", label: "Guys" },
  { value: "anime", label: "Anime" },
];

/**
 * Logged-out-visible Girls/Guys/Anime switcher for the landing page's
 * "Meet a few of the people already here" section — same underlying
 * public GET /api/characters?category= filter as
 * discover-audience-grid.tsx (see that file's own comment for why this
 * is safe pre-login), placed here because Candy AI puts this switcher
 * in the nav, visible before the visitor scrolls at all — this section
 * is the first character content a logged-out visitor hits on Vantrix,
 * so it's the equivalent slot on this page.
 *
 * Keeps the same dark, image-bleed card treatment the static 4-up grid
 * it replaces already used, just re-fetching that pool per tab instead
 * of always showing the same 4 server-fetched `featured` characters.
 */
export function LandingCharacterGrid({ initial }: { initial: DiscoverCharacter[] }) {
  const [tab, setTab] = useState<GenderFilter>("all");
  const isFiltered = tab !== "all";

  const { data: fetched, isLoading } = useCharacterSearch({
    q: "",
    gender: tab,
    limit: 4,
    enabled: isFiltered,
  });

  const characters = useMemo(
    () => (isFiltered ? fetched : initial.slice(0, 4)),
    [isFiltered, fetched, initial],
  );

  return (
    <>
      <div className="mt-6 flex justify-start md:justify-end">
        <FilterPillGroup options={TABS} value={tab} onChange={(v) => setTab(v as GenderFilter)} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[.78] rounded-md border border-border-hairline bg-white/[0.03] animate-pulse"
              />
            ))
          : characters.map((character) => (
              <Link
                key={character.id}
                href={`/companions/${character.id}`}
                className="group relative aspect-[.78] overflow-hidden rounded-md border border-border-hairline bg-base"
              >
                <Image
                  src={resolveImageSrc(character.image_url)}
                  alt={character.name}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover transition-transform duration-500 ease-premium group-hover:scale-[1.035]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    <span className="text-[10px] uppercase tracking-[0.15em] text-white/55">Available</span>
                  </div>
                  <div className="mt-1 font-display text-xl text-white">
                    {character.name}
                    {character.age ? `, ${character.age}` : ""}
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-xs text-white/55">
                    {character.archetype || character.tags?.slice(0, 2).join(" · ")}
                  </div>
                </div>
              </Link>
            ))}
      </div>
    </>
  );
}
