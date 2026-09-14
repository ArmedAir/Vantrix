/**
 * getFeedPostsPage — the actual paginated character-post-feed logic
 * (Redis-backed non-personalized cache, trending/following sort,
 * per-user like merge, locked-post image redaction).
 *
 * FOR-YOU/FOLLOWING SIMPLIFICATION (2026-09-07): the "all" filter is gone
 * — it ran the exact same created_at-DESC query as "new" with no distinct
 * behavior, so the global feed's two user-facing tabs collapsed to
 * "trending" (labeled "For You" client-side, the default) and "following".
 * "new" itself is still here (see the branch below) — it turned out to
 * have a real, different caller (CharacterPostsGrid's own-profile Posts
 * tab) that "trending"'s likes-count gate and "following"'s follow-status
 * gate both broke; see types/feed.ts's FeedFilter comment for the full
 * story. It's deliberately not exposed as a global feed tab, just kept as
 * an internal chronological/ungated mode every real caller pairs with a
 * `character` id.
 *
 * ROOT-CAUSE FIX (2026-08-23): same self-fetch issue as
 * lib/dating/get-world-home.ts and lib/community/get-communities.ts (see
 * the former's header comment for the full explanation) — this used to
 * live inline in app/api/feed/posts/route.ts, reachable from
 * (app)/feed/page.tsx only via lib/frontend/feed.ts's getFeedPosts(),
 * which round-trips through fetchInternal(). That file's own comment
 * argued the route's cache layer + sort branching + per-user merge was
 * "real request-shaping you don't want to reimplement," and therefore had
 * to go through HTTP — but that's an argument for extracting the logic
 * into an importable function (this file), not for leaving it inline and
 * self-fetching it. Moved here so the Server Component can call it
 * in-process; route.ts is now a thin wrapper around this for the client-
 * side infinite-scroll fetches in hooks/use-feed.ts, which still need the
 * real HTTP endpoint since they run in the browser.
 *
 * SOCIAL PASS (Kindroid-parity): `character_follows` + `characters.
 * follower_count` were already fully built (character-engagement.tsx,
 * /api/characters/[id]/follow) but the feed itself never read them —
 * the exact "backend shipped, no consumer" pattern already found
 * elsewhere in this codebase. `filter: 'following'` closes that gap,
 * giving the feed the Feed-vs-Following split Kindroid Social itself
 * draws between the public feed and your own followed companions'
 * timeline. Personalized by definition, so it never touches the
 * trending cache below — a followed-character list is
 * per-user and would poison a shared cache key.
 *
 * ACHIEVEMENT POSTS (2026-09-05): `character_posts` can now hold rows with
 * `target_user_id` set (see lib/feed/achievement-posts.ts + the 20260905
 * migration) — a milestone post visible to exactly one user, regardless of
 * whether they formally follow that character. The public trending ("For
 * You") path explicitly excludes them (`.is('target_user_id', null)`) since that
 * path is a shared, unauthenticated-safe cache — even redacting them
 * server-side wouldn't be enough, they must never enter a payload another
 * user could theoretically be served. `following` is the one place they
 * surface, unioned in by user id alongside the normal followed-character
 * rows, since a private milestone with a companion belongs in "your" feed
 * whether or not you've clicked Follow on them.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { resolveEffectiveTier } from '@/lib/rate-limit';
import { getUserAffinitySignals, rankForYouPool } from '@/lib/feed/ranking';
import type { FeedFilter, FeedPost, FeedPostsPage } from '@/types/feed';

// Non-personalized post-list cache. Short TTL: this smooths request bursts
// on a hot feed page, it is not meant to serve stale-for-minutes data. Key
// intentionally excludes userId — the cached payload never contains
// user_liked.
const FEED_CACHE_TTL_SECONDS = 20;

// How many candidates the shared, non-personalized "trending" pool holds
// per cache key. Needs to be well above any single page size (40 max) —
// personalization/diversity re-ranks THIS pool per user, so a pool the
// same size as one page would just reproduce the old global order.
const FOR_YOU_POOL_SIZE = 300;
// Separate, slightly longer TTL from the plain page cache above: this
// query is heavier (bigger LIMIT) and personalization re-slices it
// per-request anyway, so a fresher page cache buys nothing here.
const FOR_YOU_POOL_TTL_SECONDS = 45;

type RawFeedPost = Omit<FeedPost, 'user_liked'>;
type CachedPage = { posts: RawFeedPost[]; nextCursor: string | null };

/**
 * Raw DB row shape before the milestone_data -> milestone mapping below.
 * target_user_id is selected (see POST_SELECT) purely so getFeedPostById
 * can enforce the private-permalink check — it's stripped in mapPostRow
 * and never part of RawFeedPost/FeedPost, so it can't leak to the client.
 */
type DbPostRow = Omit<RawFeedPost, 'milestone'> & {
  target_user_id: string | null;
  milestone_data: { milestoneKey: string; milestoneLabel: string; milestoneEmoji: string; streakDays: number | null; bondScore: number | null } | null;
};

/** milestone_data (DB JSONB, camelCase-inside-snake-case column) -> the FeedPost.milestone shape the client actually consumes. Also drops target_user_id — internal-only, see DbPostRow. */
function mapPostRow(row: DbPostRow): RawFeedPost {
  const { milestone_data, target_user_id: _targetUserId, ...rest } = row;
  return {
    ...rest,
    milestone: milestone_data
      ? {
          key:         milestone_data.milestoneKey,
          label:       milestone_data.milestoneLabel,
          emoji:       milestone_data.milestoneEmoji,
          streak_days: milestone_data.streakDays,
          bond_score:  milestone_data.bondScore,
        }
      : null,
  };
}

// intro_video_url/gallery_*_urls kept so FeedStoriesRail can open the same
// CharacterStoryViewer Home's CharacterStatusRing already uses — no new
// table, no new route, same fields /api/discover/featured already selects
// from `characters`. Shared by every query path below (list + single-post)
// so the two never drift into returning different post shapes.
const POST_SELECT = `
  id,
  caption,
  image_url,
  post_type,
  is_locked,
  likes_count,
  comments_count,
  created_at,
  author_type,
  target_user_id,
  milestone_data,
  character:characters!character_posts_character_id_fkey (
    id,
    name,
    image_url,
    gender,
    tags,
    is_live,
    intro_video_url,
    gallery_image_urls,
    gallery_video_urls
  )
`;

function feedCacheKey(filter: string, charFilter: string | null, cursor: string | null, limit: number): string {
  return `feed:posts:${filter}:${charFilter ?? 'all'}:${cursor ?? 'first'}:${limit}`;
}

async function getCachedPage(key: string): Promise<CachedPage | null> {
  try {
    const cached = await redis.get<string>(key);
    return cached ? (JSON.parse(cached) as CachedPage) : null;
  } catch {
    return null; // fail OPEN — cache miss, fall through to Supabase
  }
}

async function setCachedPage(key: string, page: CachedPage): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(page), { ex: FEED_CACHE_TTL_SECONDS });
  } catch {
    // Non-fatal — caching is best-effort
  }
}

/**
 * Per-user like merge + locked-post redaction — shared by every read path
 * below.
 *
 * PREMIUM-GATING FIX (2026-09-07): `is_locked` marks a post as premium-only
 * content, not "locked for everyone." The redaction below used to strip
 * image_url for ANY user when a post was locked, with no tier check at
 * all — so a paying premium member saw the exact same "Unlock with
 * Premium" teaser as a free user, on every locked post in the feed. Fixed
 * by resolving the caller's effective tier (same resolveEffectiveTier()
 * used by chat/dating gating, so admins count as premium too) and only
 * redacting for users who are NOT premium.
 */
async function annotateForUser(userId: string, posts: RawFeedPost[]): Promise<FeedPost[]> {
  const hasLockedPost = posts.some((p) => p.is_locked);

  const [likes, profile] = await Promise.all([
    posts.length > 0
      ? supabaseAdmin
          .from('post_likes')
          .select('post_id')
          .eq('user_id', userId)
          .in('post_id', posts.map((p) => p.id))
      : Promise.resolve({ data: [] as { post_id: string }[] }),
    // Only worth the round trip when it can actually change the outcome.
    hasLockedPost
      ? supabaseAdmin
          .from('profiles')
          .select('tier, role, is_admin')
          .eq('id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const likedPostIds = new Set((likes.data ?? []).map((l) => l.post_id));
  const tier = hasLockedPost ? resolveEffectiveTier(profile.data ?? {}) : 'free';
  const isPremium = tier === 'premium';

  return posts.map((p) => ({
    ...p,
    user_liked: likedPostIds.has(p.id),
    // SEC/MONETIZATION FIX (Phase B audit, 2026-08-06): is_locked used to
    // be cosmetic-only (CSS blur over the real, full-resolution URL) — the
    // real URL is never sent to a non-premium user for a locked post.
    // Premium users get the real URL since the content is unlocked for
    // them; see header comment above for the 2026-09-07 gating fix.
    image_url: p.is_locked && !isPremium ? null : p.image_url,
  }));
}

/** Character IDs `userId` follows — empty array (not an error) when they follow no one. */
async function getFollowedCharacterIds(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('character_follows')
    .select('character_id')
    .eq('user_id', userId);

  if (error) {
    logger.warn('feed:following-lookup-failed', { userId, error: error.message });
    return [];
  }
  return (data ?? []).map((r) => r.character_id as string);
}

export async function getFeedPostsPage(
  userId: string,
  params: { filter?: FeedFilter; character?: string | null; cursor?: string | null; limit?: number } = {},
): Promise<FeedPostsPage> {
  const filter = params.filter ?? 'trending';
  const charFilter = params.character ?? null;
  const cursor = params.cursor ?? null;
  const limit = Math.min(Math.max(1, params.limit && Number.isFinite(params.limit) ? params.limit : 20), 40);

  // ── Following: personalized, never cached ──────────────────────────────
  if (filter === 'following') {
    const followedIds = await getFollowedCharacterIds(userId);
    const scopedIds = charFilter ? followedIds.filter((id) => id === charFilter) : followedIds;

    // A user's own achievement posts belong in their feed even for a
    // character they've never formally followed — the relationship itself
    // is the subscription, not the Follow button. Union followed-character
    // posts with "posts targeted at me" rather than requiring both; when
    // charFilter narrows to one character, the .eq() below still scopes
    // correctly since an achievement row carries a real character_id too.
    let query = supabaseAdmin
      .from('character_posts')
      .select(POST_SELECT)
      .limit(limit + 1);

    const followedClause = scopedIds.length > 0 ? `character_id.in.(${scopedIds.join(',')})` : null;
    const orParts = [followedClause, `target_user_id.eq.${userId}`].filter(Boolean) as string[];
    query = query.or(orParts.join(','));

    if (charFilter) query = query.eq('character_id', charFilter);
    if (cursor) query = query.lt('created_at', cursor);
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) {
      logger.error('feed:following-posts-fetch-error', { error: error.message });
      return { posts: [], nextCursor: null };
    }

    const hasMore = (data ?? []).length > limit;
    const posts = ((data ?? []) as unknown as DbPostRow[]).slice(0, limit).map(mapPostRow);
    const nextCursor = hasMore && posts.length > 0 ? posts[posts.length - 1]!.created_at : null;

    return { posts: await annotateForUser(userId, posts), nextCursor };
  }

  // ── New (chronological, ungated): character-profile "Posts" tab only ───
  // Restored for a real caller the 2026-09-07 simplification missed —
  // CharacterPostsGrid's own-profile post history (see types/feed.ts's
  // FeedFilter comment for the full story). Shares the same non-personalized
  // short-TTL cache as "trending" below, just ordered by recency instead of
  // likes_count and with no likes-count gate — deliberately NOT restoring
  // the old global "all"/"new" tabs, which is why this stays undocumented
  // as a public feed option and every real call site pairs it with a
  // `character` id.
  if (filter === 'new') {
    const cacheKey = feedCacheKey(filter, charFilter, cursor, limit);
    let posts: RawFeedPost[];
    let nextCursor: string | null;

    const cachedPage = await getCachedPage(cacheKey);
    if (cachedPage) {
      posts = cachedPage.posts;
      nextCursor = cachedPage.nextCursor;
    } else {
      let query = supabaseAdmin
        .from('character_posts')
        .select(POST_SELECT)
        .is('target_user_id', null) // same shared-cache privacy boundary as "trending" below
        .limit(limit + 1)
        .order('created_at', { ascending: false });

      if (charFilter) query = query.eq('character_id', charFilter);
      if (cursor) query = query.lt('created_at', cursor);

      const { data, error } = await query;
      if (error) {
        logger.error('feed:new-posts-fetch-error', { error: error.message });
        return { posts: [], nextCursor: null };
      }

      const hasMore = (data ?? []).length > limit;
      posts = ((data ?? []) as unknown as DbPostRow[]).slice(0, limit).map(mapPostRow);
      nextCursor = hasMore && posts.length > 0 ? posts[posts.length - 1]!.created_at : null;

      await setCachedPage(cacheKey, { posts, nextCursor });
    }

    return { posts: await annotateForUser(userId, posts), nextCursor };
  }

  // ── Trending ("For You"): shared candidate pool, personalized ranking ──
  // `filter` can only be 'trending' here — 'following' and 'new' already
  // returned above. Formerly branched on 'all' too (identical to 'new');
  // that's gone, see this file's header note.
  //
  // PERSONALIZATION (this session): the old version of this branch WAS
  // the entire "For You" algorithm — `likes_count > 10`, sort by
  // `likes_count DESC`, done. Every user saw byte-identical pages; "For
  // You" was a UI label, not a behavior. The fix keeps the one part that
  // genuinely needs a shared cache (the DB read — see FOR_YOU_POOL_SIZE
  // comment) but moves ranking out of SQL and into lib/feed/ranking.ts,
  // which scores each candidate per-user (recency decay, engagement,
  // follow/like/chat affinity, tag taste, a diversity pass) before
  // slicing out this page. `cursor` here is therefore an offset into the
  // ranked list, not a `created_at` value — see this file's own header
  // comment on `charFilter`/pagination and ranking.ts's header comment
  // for why that's still cursor-pagination-safe.
  const poolCacheKey = `feed:for-you-pool:${charFilter ?? 'all'}`;
  let pool: RawFeedPost[];

  const cachedPool = await redis.get<string>(poolCacheKey).catch(() => null);
  if (cachedPool) {
    pool = JSON.parse(cachedPool) as RawFeedPost[];
  } else {
    let query = supabaseAdmin
      .from('character_posts')
      .select(POST_SELECT)
      // Shared, non-personalized cache — a private achievement post must
      // never be able to enter a payload that could be served to anyone
      // but the one user it belongs to. Redundant with the RLS policy on
      // this table (belt-and-suspenders, since this path reads via
      // supabaseAdmin/service_role, which bypasses RLS entirely).
      .is('target_user_id', null)
      .gt('likes_count', 10)
      .order('likes_count', { ascending: false })
      .limit(FOR_YOU_POOL_SIZE);

    if (charFilter) {
      query = query.eq('character_id', charFilter);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('feed:posts-fetch-error', { error: error.message });
      return { posts: [], nextCursor: null };
    }

    pool = ((data ?? []) as unknown as DbPostRow[]).map(mapPostRow);

    try {
      await redis.set(poolCacheKey, JSON.stringify(pool), { ex: FOR_YOU_POOL_TTL_SECONDS });
    } catch {
      // Non-fatal — caching is best-effort
    }
  }

  const signals = await getUserAffinitySignals(userId);
  const ranked = rankForYouPool(pool, signals);

  const offset = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;
  const page = ranked.slice(offset, offset + limit);
  const nextCursor = offset + limit < ranked.length ? String(offset + limit) : null;

  return { posts: await annotateForUser(userId, page), nextCursor };
}

/**
 * getFeedPostById — single-post lookup for the /feed/[id] permalink page
 * (see feed-post-card.tsx's share button, which links there) and for
 * /api/feed/posts/[id]'s GET. Same redaction/like-merge contract as the
 * list path so a shared link never leaks a locked post's real image_url.
 */
export async function getFeedPostById(userId: string, postId: string): Promise<FeedPost | null> {
  const { data, error } = await supabaseAdmin
    .from('character_posts')
    .select(POST_SELECT)
    .eq('id', postId)
    .maybeSingle();

  if (error) {
    logger.error('feed:post-by-id-fetch-error', { error: error.message, postId });
    return null;
  }
  if (!data) return null;

  const row = data as unknown as DbPostRow;
  // A shared /feed/[id] permalink must not leak a private achievement post
  // to anyone but the user it belongs to — same rule the public list path
  // enforces via .is('target_user_id', null), applied here since a single
  // fetch by id skips that filter by design (it needs to find the row).
  if (row.target_user_id && row.target_user_id !== userId) return null;

  const [annotated] = await annotateForUser(userId, [mapPostRow(row)]);
  return annotated ?? null;
}
