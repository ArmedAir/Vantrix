/**
 * Curator Engine — one cross-surface "what should this user see right now"
 * call, spanning dating, feed, and universe.
 *
 * WHY THIS EXISTS: dating (recommendations/engine.ts), feed (feed/ranking.ts
 * via get-posts.ts), and universe (universe/world-atlas.ts) each already have
 * a real, independently-tuned scoring/selection engine. Nothing wrong with
 * any of them individually — but nothing composes their output for a single
 * "AI curator" surface either, so a cross-module digest has never existed.
 *
 * DELIBERATE SCOPE DECISION: this module does NOT merge or replace those
 * three engines' internal signal math (tag-weight computation, popularity
 * scoring, etc.). Each one was independently tuned — recommendations/
 * engine.ts's getCombinedTagWeights and feed/ranking.ts's
 * getUserAffinitySignals compute genuinely different things from
 * overlapping raw data (different weight constants, different
 * normalization), and collapsing them into one shared signal object would
 * silently re-tune two live, already-calibrated ranking systems with no way
 * to verify the score-distribution impact from here. So: call each engine
 * as-is, exactly the way its existing route already does, and compose only
 * the *output*. If the three should eventually share one signal model,
 * that's a separate, deliberate change to make with real production score
 * data in hand — not a side effect of building a digest.
 *
 * Universe's contribution is intentionally NOT personalized — world state
 * and active events are global (see getWorldOverview), so this surfaces
 * them as ambient context, not a "for you" claim. Faking personalization
 * there would be worse than not having it.
 *
 * Every leg is independently fail-soft: a broken/slow engine degrades that
 * one section to its documented empty shape rather than failing the whole
 * digest (this is the same fail-open contract getUserAffinitySignals and
 * getWorldOverview's own callers already use — no new failure philosophy
 * introduced here).
 */

import { getRecommendations, type RecommendedCharacter, type UserMood } from '@/lib/recommendations/engine';
import { getFeedPostsPage } from '@/lib/feed/get-posts';
import { getWorldOverview } from '@/lib/universe/world-atlas';
import { logger } from '@/lib/logger';
import type { FeedPost } from '@/types/feed';
import type { WorldOverview } from '@/types/universe-views';
import type { Tier } from '@/lib/rate-limit';

export interface CuratorDigest {
  dating: {
    /** Top-scored dating candidates, same engine/weights as /api/recommendations. */
    topCandidates: RecommendedCharacter[];
  };
  feed: {
    /** Top-ranked "for you" posts, same engine/weights as the feed's default filter. */
    topPosts: FeedPost[];
  };
  universe: {
    /** Ambient — not personalized. See module docstring. */
    overview: WorldOverview | null;
  };
}

const EMPTY_DIGEST: CuratorDigest = {
  dating: { topCandidates: [] },
  feed: { topPosts: [] },
  universe: { overview: null },
};

export interface GetCuratorDigestOptions {
  /** How many items to surface per surface. Small on purpose — this is a
   *  digest/highlight reel, not a replacement for each surface's own full
   *  browse view. */
  datingLimit?: number;
  feedLimit?: number;
  mood?: UserMood | null;
  allowNsfw?: boolean;
  genderFilter?: 'male' | 'female' | 'non_binary' | null;
}

/**
 * userId === '' is accepted the same way getRecommendations() and
 * getFeedPostsPage() already accept it for logged-out/degraded callers —
 * this function doesn't add its own auth gating, that's the route's job
 * (see api/curator/home/route.ts, same division of responsibility as
 * api/recommendations/route.ts).
 */
export async function getCuratorDigest(
  userId: string,
  tier: Tier,
  options: GetCuratorDigestOptions = {},
): Promise<CuratorDigest> {
  const {
    datingLimit = 3,
    feedLimit = 3,
    mood = null,
    allowNsfw = false,
    genderFilter = null,
  } = options;

  const [datingResult, feedResult, universeResult] = await Promise.allSettled([
    getRecommendations(userId, tier, datingLimit, mood, allowNsfw, genderFilter),
    getFeedPostsPage(userId, { limit: feedLimit }),
    getWorldOverview(),
  ]);

  if (datingResult.status === 'rejected') {
    logger.warn('curator:dating-leg-failed', { userId, error: String(datingResult.reason) });
  }
  if (feedResult.status === 'rejected') {
    logger.warn('curator:feed-leg-failed', { userId, error: String(feedResult.reason) });
  }
  if (universeResult.status === 'rejected') {
    logger.warn('curator:universe-leg-failed', { userId, error: String(universeResult.reason) });
  }

  return {
    dating: {
      topCandidates: datingResult.status === 'fulfilled' ? datingResult.value : EMPTY_DIGEST.dating.topCandidates,
    },
    feed: {
      topPosts: feedResult.status === 'fulfilled' ? feedResult.value.posts : EMPTY_DIGEST.feed.topPosts,
    },
    universe: {
      overview: universeResult.status === 'fulfilled' ? universeResult.value : EMPTY_DIGEST.universe.overview,
    },
  };
}
