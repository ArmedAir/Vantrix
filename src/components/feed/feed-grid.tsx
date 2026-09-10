"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Users } from "lucide-react";
import { motion } from "framer-motion";
import { FilterPillGroup } from "@/components/ui/filter-pills";
import { Button } from "@/components/ui/button";
import { FeedPostCard } from "./feed-post-card";
import { FeedStoriesRail } from "./feed-stories-rail";
import { useFeed } from "@/hooks/use-feed";
import type { FeedPost, FeedFilter, FeedCharacterSummary } from "@/types/feed";
import type { HeroAd } from "@/lib/frontend/ads";

// FOR-YOU/FOLLOWING SIMPLIFICATION (2026-09-07): New and All are gone —
// both ran the identical created_at-DESC query (see types/feed.ts's own
// note), so keeping both on screen was pure duplication. Trending's slot
// is relabeled "For You" rather than removed, since it's the only
// remaining non-personalized ranking and becomes the feed's default tab.
const FILTER_OPTIONS = [
  { value: "trending", label: "For You" },
  { value: "following", label: "Following" },
];

// Sponsored posts are currently disabled in the feed (product decision —
// see FeedGrid's `ads` prop below). FeedInlineAd, getInlineAds(), and the
// admin ad form's 'inline' position are all left in place so this can be
// switched back on later just by passing real ads through again; nothing
// downstream of `ads` needed to change to turn this off.
type FeedItem =
  | { kind: "post"; key: string; post: FeedPost }
  | { kind: "ad"; key: string; ad: HeroAd };

function interleaveAds(posts: FeedPost[], ads: HeroAd[]): FeedItem[] {
  if (ads.length === 0) return posts.map((post) => ({ kind: "post", key: post.id, post }));

  const items: FeedItem[] = [];
  let adCursor = 0;
  posts.forEach((post, i) => {
    items.push({ kind: "post", key: post.id, post });
    const postsSoFar = i + 1;
    const dueForAd =
      postsSoFar === FIRST_AD_AFTER ||
      (postsSoFar > FIRST_AD_AFTER && (postsSoFar - FIRST_AD_AFTER) % AD_INTERVAL === 0);
    if (dueForAd) {
      const ad = ads[adCursor % ads.length];
      items.push({ kind: "ad", key: `ad-${ad.id}-${adCursor}`, ad });
      adCursor += 1;
    }
  });
  return items;
}

// Instagram-style cadence: first ad after 3 posts, then one every 5 after
// that. Ads cycle (modulo) if the feed page renders more ad slots than
// getInlineAds() returned rows for — a thin 'inline' inventory still
// spreads across a long scroll session instead of drying up after one card.
const FIRST_AD_AFTER = 3;
const AD_INTERVAL = 5;

export function FeedGrid({
  initialPosts,
  initialNextCursor,
  ads: _ads = [],
}: {
  initialPosts: FeedPost[];
  initialNextCursor: string | null;
  ads?: HeroAd[];
}) {
  const [filter, setFilter] = useState<FeedFilter>("trending");
  const [activeCharacter, setActiveCharacter] = useState<string | null>(null);
  const [posts, setPosts] = useState(initialPosts);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const { fetchPosts } = useFeed();

  // Sponsored content disabled in the feed — pass [] regardless of what
  // the caller sent so interleaveAds() (still here, unused-for-now) is a
  // no-op. Re-enable by passing `_ads` here instead of `[]`.
  const feedItems = useMemo(() => interleaveAds(posts, []), [posts]);

  // Stories rail is drawn from whoever has posted recently — no extra
  // fetch, just the characters already embedded in the loaded page.
  const storyCharacters = useMemo(() => {
    const seen = new Map<string, FeedCharacterSummary>();
    for (const p of initialPosts) {
      if (p.character && !seen.has(p.character.id)) seen.set(p.character.id, p.character);
    }
    return Array.from(seen.values()).slice(0, 20);
  }, [initialPosts]);

  async function refetch(nextFilter: FeedFilter, nextCharacter: string | null) {
    setLoading(true);
    const page = await fetchPosts(nextFilter, undefined, nextCharacter ?? undefined);
    if (page) {
      setPosts(page.posts);
      setNextCursor(page.nextCursor);
    }
    setLoading(false);
  }

  async function handleFilterChange(value: string) {
    const target = value as FeedFilter;
    setFilter(target);
    await refetch(target, activeCharacter);
  }

  async function handleCharacterSelect(id: string | null) {
    setActiveCharacter(id);
    await refetch(filter, id);
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoading(true);
    const page = await fetchPosts(filter, nextCursor, activeCharacter ?? undefined);
    if (page) {
      setPosts((prev) => [...prev, ...page.posts]);
      setNextCursor(page.nextCursor);
    }
    setLoading(false);
  }

  return (
    <div>
      <FeedStoriesRail
        characters={storyCharacters}
        activeId={activeCharacter}
        onSelect={handleCharacterSelect}
      />

      <FilterPillGroup
        options={FILTER_OPTIONS}
        value={filter}
        onChange={handleFilterChange}
        className="px-4 md:px-0 mb-4"
      />

      {posts.length === 0 && !loading ? (
        filter === "following" ? (
          <FollowingEmptyState />
        ) : (
          <p className="text-sm text-text-tertiary py-16 text-center">
            {filter === "trending" ? "Nothing for you yet — check back soon." : "No posts yet — check back soon."}
          </p>
        )
      ) : (
        <div className="flex flex-col gap-4 px-4 md:px-0">
          {feedItems.map((item, i) => (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: Math.min(i, 6) * 0.03 }}
            >
              {item.kind === "post" ? <FeedPostCard post={item.post} /> : null}
            </motion.div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
        </div>
      )}

      {/*
        "trending" (the "For You" tab) always re-runs its likes_count-sorted
        query unfiltered rather than paging via cursor — see
        lib/feed/get-posts.ts — so a Load More button there would just
        re-fetch the same top page rather than continuing it. "following"
        is the one tab that actually pages.
      */}
      {!loading && filter !== "trending" && nextCursor && (
        <div className="flex justify-center mt-4">
          <Button variant="secondary" size="sm" onClick={loadMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * KINDROID-PARITY: the Following tab's own empty state — distinct from
 * "no posts yet" because the fix is different. An empty New/Trending/All
 * feed means come back later; an empty Following feed means there's
 * nothing to wait on, there's an action to take right now.
 */
function FollowingEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 px-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border-hairline">
        <Users className="h-5 w-5 text-gold-500" strokeWidth={1.5} />
      </span>
      <div>
        <p className="text-sm font-medium text-text-primary">
          You&apos;re not following anyone yet
        </p>
        <p className="mt-1 text-sm text-text-tertiary max-w-[280px]">
          Follow a companion from their profile and their posts will show up
          here first.
        </p>
      </div>
      <Button asChild size="sm" variant="secondary" className="mt-1">
        <Link href="/characters">Find companions to follow</Link>
      </Button>
    </div>
  );
}
