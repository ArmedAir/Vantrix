"use client";

import { useMemo, useState } from "react";
import { SafeImage as Image } from "@/components/ui/safe-image";
import Link from "next/link";
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
 * Public equivalent of (app)/explore-characters.tsx's gender pills
 * (Female/Male/Anime), for logged-out visitors on /discover.
 *
 * That component only ever renders on the authenticated Home page, so a
 * visitor never saw the segmentation Candy AI puts in its nav pre-scroll
 * (see the Vantrix-vs-Candy audit) — the underlying data/filter
 * (`characters.gender` via GET /api/characters?category=) was already
 * public and NSFW-gated for logged-out callers (see that route's own
 * "D-03: INTENTIONALLY public" comment), it just had no logged-out UI
 * consumer. This is that consumer.
 *
 * Cards link to /companions/[id] (the public guest-chat preview page),
 * not /characters/[id] (authenticated) or /login — same fix as the
 * rest of /discover's grid, so switching audience tabs never detours
 * through signup before a visitor has seen a character.
 */
export function DiscoverAudienceGrid({
  initial,
}: {
  initial: DiscoverCharacter[];
}) {
  const [tab, setTab] = useState<GenderFilter>("all");
  const isFiltered = tab !== "all";

  const { data: fetched, isLoading } = useCharacterSearch({
    q: "",
    gender: tab,
    limit: 24,
    enabled: isFiltered,
  });

  const characters = useMemo(
    () => (isFiltered ? fetched : initial.slice(0, 24)),
    [isFiltered, fetched, initial],
  );

  return (
    <section className="px-4 md:px-8 pb-20 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="font-display text-lg text-text-primary">
          Popular companions
        </h2>
        <FilterPillGroup options={TABS} value={tab} onChange={(v) => setTab(v as GenderFilter)} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] rounded-md border border-border-hairline bg-white/[0.03] animate-pulse"
            />
          ))}
        </div>
      ) : characters.length === 0 ? (
        <p className="text-text-secondary text-sm">
          No companions found for this filter yet — check back soon.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {characters.map((c) => (
            <Link
              key={c.id}
              href={`/companions/${c.id}`}
              className="group rounded-md overflow-hidden border border-border-hairline"
            >
              <div className="relative aspect-[3/4]">
                <Image
                  src={resolveImageSrc(c.image_url)}
                  alt={c.name}
                  fill
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover transition-transform ease-premium duration-200 group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-2.5">
                <p className="text-sm font-semibold text-text-primary truncate">
                  {c.name}
                  {c.age ? (
                    <span className="text-text-secondary font-normal">
                      {" "}
                      · {c.age}
                    </span>
                  ) : null}
                </p>
                {c.archetype && (
                  <p className="text-xs text-text-secondary truncate mt-0.5">
                    {c.archetype}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
