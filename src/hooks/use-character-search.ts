"use client";

import useSWR from "swr";
import type { DiscoverCharacter } from "@/lib/frontend/discover";

/**
 * §10's standardized Client Component shape ({ data, isLoading, error })
 * via SWR — a plain read against a filterable list is exactly the case
 * §10 names SWR/React Query for, unlike use-dating-deck.ts's swipe state
 * (that one deliberately opts out of background revalidation; this one
 * wants it, so a filter change reflects a genuinely fresh query).
 *
 * CACHE-FIX: the fetcher used to pass `cache: "no-store"`, which forces
 * the browser to skip its HTTP cache entirely — meaning GET
 * /api/characters's own `Cache-Control: private, max-age=30,
 * stale-while-revalidate=60` (see that route's own PERF comment; kept
 * `private` rather than a shared/CDN cache specifically because NSFW
 * gating varies per caller) was never actually honored client-side. Every
 * tab switch, remount, or SWR background revalidation re-hit the DB, even
 * for an identical query fired seconds apart. Dropping `no-store` lets
 * the browser cache do what the server already told it it's safe to do;
 * this changes nothing about who can see what, only how often an
 * identical request re-queries. dedupingInterval below is bumped to
 * roughly match the server's max-age so SWR's own revalidation cadence
 * doesn't outrun the cache window it's now actually using; revalidateOnFocus
 * is turned off since a companion grid doesn't need to refetch just
 * because the tab regained focus.
 */
export type GenderFilter = "all" | "female" | "male" | "anime";

async function fetcher(url: string): Promise<DiscoverCharacter[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const body = (await res.json()) as { characters: DiscoverCharacter[] };
  return body.characters ?? [];
}

export function useCharacterSearch(params: {
  q: string;
  gender: GenderFilter;
  limit: number;
  /**
   * VIBE-FILTER-FIX: optional tag list (see MOOD_TAGS in
   * lib/recommendations/moods.ts) — sent as a comma-joined `tags` param
   * to /api/characters' new overlaps filter. Omitted/empty = no vibe
   * filter, unchanged behavior for every existing caller.
   */
  tags?: string[];
  /**
   * PERF: defaults true (unchanged behavior for the existing caller,
   * characters-browse.tsx). explore-characters.tsx passes false for
   * every tab that isn't gender-filtered (For You/New draw from a pool
   * it already has; Trending has its own dedicated hook,
   * use-trending-characters.ts) — without this, the hook fired a real
   * request against /api/characters on every one of those tabs,
   * including the default landing tab, and threw the response away.
   * `null` as the SWR key is SWR's documented way to skip the fetch
   * entirely rather than fire-and-discard.
   */
  enabled?: boolean;
}) {
  const enabled = params.enabled ?? true;
  const sp = new URLSearchParams();
  if (params.q.trim()) sp.set("q", params.q.trim());
  if (params.gender !== "all") sp.set("category", params.gender);
  if (params.tags && params.tags.length > 0) sp.set("tags", params.tags.join(","));
  sp.set("limit", String(params.limit));

  const { data, error, isLoading } = useSWR(
    enabled ? `/api/characters?${sp.toString()}` : null,
    fetcher,
    {
      keepPreviousData: true,
      dedupingInterval: 30_000,
      revalidateOnFocus: false,
    }
  );

  return {
    data: data ?? [],
    isLoading: enabled && isLoading,
    error: error ? "Couldn't load companions. Try again." : null,
  };
}
