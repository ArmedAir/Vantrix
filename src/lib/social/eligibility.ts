// src/lib/social/eligibility.ts
// ─────────────────────────────────────────────────────────────────────────────
// Determines which character_posts rows are candidates for X cross-posting.
// Deliberately conservative — this feeds auto-select.ts, which queues rows
// for UNATTENDED posting once an admin flips x_auto_publish_enabled, so a
// mistake here goes out to a real public account, not just an in-app
// surface an admin can quietly unpublish.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

// Only look at posts from the last N hours — an eligibility sweep that ran
// late (or a backfill) should not suddenly dump a week of stale posts onto
// X all at once.
const MAX_POST_AGE_HOURS = 48;

// Per-character cross-post cadence — separate from (and typically looser
// than) character-feed.ts's own MIN_HOURS_BETWEEN_POSTS for *creating* a
// post; this governs how often any one character's content reaches X
// specifically, so a very active in-app poster doesn't dominate the feed.
export const MIN_HOURS_BETWEEN_X_POSTS_PER_CHARACTER = 24;

export interface EligiblePost {
  postId: string;
  characterId: string;
  characterName: string;
  caption: string;
  imageUrl: string | null;
  postType: 'photo' | 'text' | 'teaser';
}

interface CharacterPostRow {
  id: string;
  character_id: string;
  caption: string | null;
  image_url: string | null;
  post_type: string;
  is_locked: boolean;
  created_at: string;
  characters: { name: string; active: boolean; is_live: boolean; moderation_status: string; is_nsfw: boolean } | { name: string; active: boolean; is_live: boolean; moderation_status: string; is_nsfw: boolean }[] | null;
}

/**
 * Returns character_posts rows eligible for X cross-posting, newest first:
 *   - within the freshness window
 *   - not already cross-posted (crossposted_to_x = false)
 *   - not already queued/posted/posting/pending_review in social_posts
 *     (checked via a separate query below — a post can only ever be queued
 *     for X once, even if a previous attempt failed and the row is still
 *     sitting there as 'failed')
 *   - has a caption (an X post needs SOME text; image-only isn't composable)
 *   - is_locked = false and post_type != 'teaser' — locked/teaser content is
 *     the in-app paywall hook; publishing it free on X undercuts the exact
 *     thing it's designed to do
 *   - underlying character is active, live, approved, and NOT is_nsfw — X's
 *     platform policy on adult content makes any is_nsfw character an
 *     account-suspension risk, so those are excluded from auto cross-
 *     posting entirely, full stop, regardless of any other flag
 */
export async function getEligiblePosts(limit = 100): Promise<EligiblePost[]> {
  const cutoff = new Date(Date.now() - MAX_POST_AGE_HOURS * 3_600_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('character_posts')
    .select(
      'id,character_id,caption,image_url,post_type,is_locked,created_at,characters:character_id(name,active,is_live,moderation_status,is_nsfw)',
    )
    .eq('crossposted_to_x', false)
    .eq('is_locked', false)
    .neq('post_type', 'teaser')
    .not('caption', 'is', null)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    logger.error('x-eligibility:fetch-failed', { error: error?.message });
    return [];
  }

  const rows = data as unknown as CharacterPostRow[];

  const candidates = rows
    .map((row) => {
      const character = Array.isArray(row.characters) ? row.characters[0] : row.characters;
      return { row, character };
    })
    .filter(({ character }) =>
      character?.active === true &&
      character?.is_live === true &&
      character?.moderation_status === 'approved' &&
      character?.is_nsfw === false,
    )
    .filter(({ row }) => Boolean(row.caption?.trim()));

  if (candidates.length === 0) return [];

  // Exclude posts already represented in social_posts by any non-terminal-
  // failure status — 'skipped' (admin explicitly rejected) is excluded too,
  // since re-queuing something a human already said no to would defeat the
  // review step entirely. Only a genuinely 'failed' attempt (a real error,
  // e.g. a transient X outage) is left eligible for a future retry.
  const postIds = candidates.map(({ row }) => row.id);
  const { data: existingQueue, error: queueError } = await supabaseAdmin
    .from('social_posts')
    .select('source_post_id, status')
    .in('source_post_id', postIds)
    .neq('status', 'failed');

  if (queueError) {
    logger.error('x-eligibility:queue-check-failed', { error: queueError.message });
    return [];
  }

  const alreadyQueued = new Set((existingQueue ?? []).map((r) => r.source_post_id));

  return candidates
    .filter(({ row }) => !alreadyQueued.has(row.id))
    .map(({ row, character }) => ({
      postId: row.id,
      characterId: row.character_id,
      characterName: character!.name,
      caption: row.caption!.trim(),
      imageUrl: row.post_type === 'text' ? null : row.image_url,
      postType: row.post_type as 'photo' | 'text' | 'teaser',
    }));
}

/**
 * Per-character last-cross-post timestamps (from social_posts, status =
 * 'posted'), for auto-select.ts to enforce MIN_HOURS_BETWEEN_X_POSTS_PER_CHARACTER
 * without an N+1 query per candidate.
 */
export async function getLastXPostTimes(characterIds: string[]): Promise<Map<string, number>> {
  if (characterIds.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from('social_posts')
    .select('character_id, posted_at')
    .in('character_id', characterIds)
    .eq('status', 'posted')
    .order('posted_at', { ascending: false });

  if (error) {
    logger.error('x-eligibility:last-post-times-failed', { error: error.message });
    return new Map();
  }

  const result = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.posted_at) continue;
    if (!result.has(row.character_id)) {
      result.set(row.character_id, new Date(row.posted_at).getTime());
    }
  }
  return result;
}
