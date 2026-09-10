/**
 * "For You" ranking — turns the old `trending` branch (pure
 * `likes_count DESC`, `> 10` gate, identical for every user) into an
 * actual personalized ranker.
 *
 * Design constraints this works within (see get-posts.ts):
 *   - The candidate pool is still a single non-personalized, short-TTL
 *     Redis-cached query — that cache is what protects the DB from a hot
 *     feed page, and it has to stay userId-free to be shareable.
 *   - Personalization therefore happens IN-PROCESS, on top of the cached
 *     pool, per request. The pool only needs to be large enough that
 *     re-ranking it can't just reproduce the old global order.
 *   - Pagination is offset-based into the *ranked* list (cursor is the
 *     next offset as a string) rather than a `created_at` cursor, since
 *     rank order isn't chronological. Two requests against the same pool
 *     + the same user's signals produce the same order, which is all
 *     stable infinite-scroll needs — it doesn't require the order to
 *     survive the pool's ~45s cache rotation untouched, same as the old
 *     `likes_count` sort didn't either.
 *
 * Signals used (everything already sitting in tables the app writes to,
 * no new schema):
 *   - engagement:  likes_count / comments_count on the post itself
 *   - recency:     exponential half-life decay from created_at
 *   - affinity:    does this user follow / has liked / has ever chatted
 *                  with this character
 *   - taste:       tag overlap with the characters the user actually
 *                  engages with (follows, likes, chats), weighted by how
 *                  strong that engagement is
 *   - authorship:  a small nudge for real user-authored posts over the
 *                  autonomous AI ones, since they're rarer and tend to
 *                  read as more "alive"
 *
 * Then a diversity pass so one prolific/beloved character can't fill the
 * whole page — same principle every real For You feed uses.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import type { FeedPost } from '@/types/feed';

// Half-life for recency decay, in hours. A post this old scores half of a
// brand-new one on recency alone; tuned generously (36h, ~1.5 days) since
// this is a companion-post feed, not a minute-by-minute news feed.
const RECENCY_HALF_LIFE_HOURS = 36;

// Weights — kept as named constants rather than inline magic numbers so
// they can be tuned/A-B'd without touching the scoring logic itself.
const WEIGHTS = {
  likesLog: 1.0,
  commentsLog: 1.4,
  recency: 3.0,
  followed: 4.0,
  liked: 2.5,
  chatted: 3.0,
  tagOverlap: 0.6,
  tagOverlapCap: 3.0,
  userAuthored: 0.4,
} as const;

// Never let tag-taste alone push a post past a strong direct-affinity
// signal — it's a tiebreaker/booster, not a replacement for "you actually
// follow this character."
const TAG_WEIGHT_PER_HIT = { followed: 3, liked: 2, chatted: 1.5 } as const;

// After how many posts from the SAME character in a row do we force a
// different character in, even if it would otherwise rank higher next.
const MAX_CONSECUTIVE_PER_CHARACTER = 2;

export interface UserAffinitySignals {
  followedCharacterIds: Set<string>;
  likedCharacterIds: Set<string>;
  chattedCharacterIds: Set<string>;
  /** tag -> accumulated weight, from the characters this user actually engages with */
  tagWeights: Map<string, number>;
}

const EMPTY_SIGNALS: UserAffinitySignals = {
  followedCharacterIds: new Set(),
  likedCharacterIds: new Set(),
  chattedCharacterIds: new Set(),
  tagWeights: new Map(),
};

/**
 * Pulls together everything we know about which characters this user
 * actually cares about, then derives a tag-taste profile from them.
 * Fails open (returns EMPTY_SIGNALS) on any error — a broken signals
 * fetch should degrade to "score by engagement + recency only", not
 * break the feed.
 */
export async function getUserAffinitySignals(userId: string): Promise<UserAffinitySignals> {
  try {
    const [followsRes, likesRes, convosRes] = await Promise.all([
      supabaseAdmin.from('character_follows').select('character_id').eq('user_id', userId),
      supabaseAdmin.from('character_likes').select('character_id').eq('user_id', userId),
      // Recency-bounded: a conversation from a year ago that fizzled out
      // shouldn't keep steering "for you" forever. 60 days is generous
      // enough to catch anyone with a real ongoing relationship.
      supabaseAdmin
        .from('conversations')
        .select('character_id')
        .eq('user_id', userId)
        .gte('last_message_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const followedCharacterIds = new Set<string>(
      ((followsRes.data ?? []) as { character_id: string }[]).map((r) => r.character_id),
    );
    const likedCharacterIds = new Set<string>(
      ((likesRes.data ?? []) as { character_id: string }[]).map((r) => r.character_id),
    );
    const chattedCharacterIds = new Set<string>(
      ((convosRes.data ?? []) as { character_id: string }[]).map((r) => r.character_id),
    );

    const allEngagedIds = new Set<string>([...followedCharacterIds, ...likedCharacterIds, ...chattedCharacterIds]);
    if (allEngagedIds.size === 0) {
      return EMPTY_SIGNALS;
    }

    const { data: characters } = await supabaseAdmin
      .from('characters')
      .select('id, tags')
      .in('id', Array.from(allEngagedIds));

    const tagWeights = new Map<string, number>();
    for (const c of characters ?? []) {
      const tags = (c as { id: string; tags: string[] | null }).tags ?? [];
      const id = (c as { id: string }).id;
      let weight = 0;
      if (followedCharacterIds.has(id)) weight += TAG_WEIGHT_PER_HIT.followed;
      if (likedCharacterIds.has(id)) weight += TAG_WEIGHT_PER_HIT.liked;
      if (chattedCharacterIds.has(id)) weight += TAG_WEIGHT_PER_HIT.chatted;
      for (const tag of tags) {
        tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + weight);
      }
    }

    return { followedCharacterIds, likedCharacterIds, chattedCharacterIds, tagWeights };
  } catch (err) {
    logger.warn('feed:affinity-signals-failed', { userId, error: err instanceof Error ? err.message : String(err) });
    return EMPTY_SIGNALS;
  }
}

function tagOverlapScore(tags: string[] | null | undefined, tagWeights: Map<string, number>): number {
  if (!tags || tags.length === 0 || tagWeights.size === 0) return 0;
  let raw = 0;
  for (const tag of tags) raw += tagWeights.get(tag) ?? 0;
  return Math.min(raw * WEIGHTS.tagOverlap, WEIGHTS.tagOverlapCap);
}

/** Exported for tests / debugging — score for a single post, no diversity pass applied. */
export function scoreForYouPost(
  post: Omit<FeedPost, 'user_liked'>,
  signals: UserAffinitySignals,
  now: number = Date.now(),
): number {
  const ageHours = Math.max(0, (now - new Date(post.created_at).getTime()) / (60 * 60 * 1000));
  const recency = Math.pow(0.5, ageHours / RECENCY_HALF_LIFE_HOURS);

  const engagement =
    Math.log1p(post.likes_count) * WEIGHTS.likesLog + Math.log1p(post.comments_count) * WEIGHTS.commentsLog;

  const characterId = post.character?.id ?? null;
  let affinity = 0;
  if (characterId) {
    if (signals.followedCharacterIds.has(characterId)) affinity += WEIGHTS.followed;
    if (signals.likedCharacterIds.has(characterId)) affinity += WEIGHTS.liked;
    if (signals.chattedCharacterIds.has(characterId)) affinity += WEIGHTS.chatted;
  }
  const taste = tagOverlapScore(post.character?.tags, signals.tagWeights);

  const authorBonus = post.author_type === 'user' ? WEIGHTS.userAuthored : 0;

  return engagement + recency * WEIGHTS.recency + affinity + taste + authorBonus;
}

/**
 * Ranks the full candidate pool for one user: score everything, sort
 * descending, then run a diversity pass so no character shows up more
 * than MAX_CONSECUTIVE_PER_CHARACTER times in a row. The diversity pass
 * is a simple greedy "hold back the repeat, take the next-best distinct
 * one instead" walk — cheap, deterministic, and good enough for a
 * pool in the low hundreds.
 */
export function rankForYouPool<T extends Omit<FeedPost, 'user_liked'>>(
  posts: T[],
  signals: UserAffinitySignals,
  now: number = Date.now(),
): T[] {
  const scored = posts
    .map((post) => ({ post, score: scoreForYouPost(post, signals, now) }))
    .sort((a, b) => b.score - a.score);

  const result: T[] = [];
  const pending = [...scored];
  let lastCharacterId: string | null = null;
  let consecutiveCount = 0;

  while (pending.length > 0) {
    let pickIndex = 0;
    if (consecutiveCount >= MAX_CONSECUTIVE_PER_CHARACTER) {
      const altIndex = pending.findIndex((item) => (item.post.character?.id ?? null) !== lastCharacterId);
      if (altIndex !== -1) pickIndex = altIndex;
      // If everything left is the same character, we've run out of
      // options — fall through and just take the next-best anyway
      // rather than looping forever.
    }

    const [picked] = pending.splice(pickIndex, 1);
    if (!picked) break;
    result.push(picked.post);

    const characterId = picked.post.character?.id ?? null;
    if (characterId !== null && characterId === lastCharacterId) {
      consecutiveCount += 1;
    } else {
      lastCharacterId = characterId;
      consecutiveCount = 1;
    }
  }

  return result;
}
