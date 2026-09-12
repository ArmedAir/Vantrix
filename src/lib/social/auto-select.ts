// src/lib/social/auto-select.ts
// ─────────────────────────────────────────────────────────────────────────────
// Turns eligibility.ts's candidate list into actual `social_posts` rows in
// status='queued'. Does NOT post anything — publisher.ts owns the actual
// call to X, and only ever processes 'queued' rows, gated separately by
// x_auto_publish_enabled. This module's only job is deciding WHAT would be
// worth posting and composing the text for it, so an admin reviewing the
// /admin/social queue sees fully-formed candidates either way.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { composeTweet } from './composer';
import {
  getEligiblePosts,
  getLastXPostTimes,
  MIN_HOURS_BETWEEN_X_POSTS_PER_CHARACTER,
} from './eligibility';
import { countXPostsToday, getXDailyPostCap } from '@/lib/config/x-social';

// Ceiling on how many NEW rows one sweep will insert — independent of the
// daily post cap (which governs actual publishing). Keeps the review queue
// from being flooded in one run even on a day with a very high post cap.
const MAX_QUEUED_PER_RUN = 20;

export interface AutoSelectResult {
  [key: string]: unknown;
  queued: number;
  skippedCandidates: number;
  candidates: number;
}

export async function runXAutoSelect(): Promise<AutoSelectResult> {
  const candidates = await getEligiblePosts();
  if (candidates.length === 0) {
    return { queued: 0, skippedCandidates: 0, candidates: 0 };
  }

  // Headroom check up front: no point queuing more than the day realistically
  // has room to publish. Not a hard gate (publisher.ts re-checks the cap at
  // actual publish time, which is the authoritative check) — just avoids
  // building an oversized review backlog on a day the cap is already tight.
  const [postedToday, dailyCap] = await Promise.all([countXPostsToday(), getXDailyPostCap()]);
  const remainingToday = Math.max(0, dailyCap - postedToday);
  if (remainingToday === 0) {
    return { queued: 0, skippedCandidates: candidates.length, candidates: candidates.length };
  }

  const lastPostTimes = await getLastXPostTimes(candidates.map((c) => c.characterId));
  const cutoffMs = MIN_HOURS_BETWEEN_X_POSTS_PER_CHARACTER * 3_600_000;
  const now = Date.now();

  let queued = 0;
  let skippedCandidates = 0;
  const queuedCharactersThisRun = new Set<string>();

  for (const candidate of candidates) {
    if (queued >= Math.min(MAX_QUEUED_PER_RUN, remainingToday)) {
      skippedCandidates += candidates.length - queued - skippedCandidates;
      break;
    }

    // One queued row per character per run, in addition to the cross-run
    // cadence check below — otherwise a character with several fresh
    // eligible posts in the same sweep would monopolize the queue.
    if (queuedCharactersThisRun.has(candidate.characterId)) {
      skippedCandidates++;
      continue;
    }

    const last = lastPostTimes.get(candidate.characterId);
    if (last && now - last < cutoffMs) {
      skippedCandidates++;
      continue;
    }

    try {
      const { text } = composeTweet({ characterId: candidate.characterId, caption: candidate.caption });

      const { error } = await supabaseAdmin.from('social_posts').insert({
        character_id: candidate.characterId,
        source_post_id: candidate.postId,
        status: 'queued',
        tweet_text: text,
        media_url: candidate.imageUrl,
        triggered_by: 'cron',
      });

      if (error) {
        logger.warn('x-auto-select:insert-failed', { postId: candidate.postId, error: error.message });
        skippedCandidates++;
        continue;
      }

      queued++;
      queuedCharactersThisRun.add(candidate.characterId);
      logger.info('x-auto-select:queued', { postId: candidate.postId, characterId: candidate.characterId });
    } catch (err) {
      logger.warn('x-auto-select:candidate-error', { postId: candidate.postId, error: String(err) });
      skippedCandidates++;
    }
  }

  return { queued, skippedCandidates, candidates: candidates.length };
}
