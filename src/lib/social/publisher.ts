// src/lib/social/publisher.ts
// ─────────────────────────────────────────────────────────────────────────────
// Actually posts queued social_posts rows to X. Two entry points:
//   - runXPublisherCron()   — used by /api/cron/x-social-publish; only runs
//                             at all if x_auto_publish_enabled is true, and
//                             stops as soon as the daily cap is hit.
//   - publishSocialPostNow() — used by the admin "publish now" action
//                             (/api/admin/social/[id]); bypasses the
//                             auto_publish_enabled toggle (an admin
//                             explicitly approving one post doesn't need
//                             unattended-posting to be turned on) but still
//                             respects the same daily cap — see that
//                             function's own comment for why.
//
// Both funnel through publishOne(), which is the only place that actually
// calls uploadMedia()/postTweet() and writes the resulting status back.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { prepareCharacterImageForX, MediaFetchError } from './media';
import { uploadMedia, postTweet, isXClientConfigured, XApiError } from './x-client';
import { countXPostsToday, getXAutoPublishEnabled, getXDailyPostCap } from '@/lib/config/x-social';

interface QueuedRow {
  id: string;
  character_id: string;
  source_post_id: string | null;
  tweet_text: string | null;
  media_url: string | null;
}

async function publishOne(row: QueuedRow): Promise<{ success: boolean; error?: string }> {
  if (!row.tweet_text) {
    await supabaseAdmin
      .from('social_posts')
      .update({ status: 'failed', error: 'no tweet_text on row' })
      .eq('id', row.id);
    return { success: false, error: 'no tweet_text on row' };
  }

  // Mark 'posting' before the network calls so a concurrent run (or a
  // retry while this one is still in flight) can't double-post the same
  // row — a cheap optimistic lock, same intent as content-engine's
  // queued -> generating transition before processQueueItem() runs.
  await supabaseAdmin.from('social_posts').update({ status: 'posting' }).eq('id', row.id);

  try {
    let mediaIds: string[] | undefined;

    if (row.media_url) {
      const prepared = await prepareCharacterImageForX(row.media_url);
      const mediaId = await uploadMedia(prepared.buffer, prepared.mimeType);
      mediaIds = [mediaId];
    }

    const tweet = await postTweet(row.tweet_text, mediaIds);

    await supabaseAdmin
      .from('social_posts')
      .update({ status: 'posted', x_tweet_id: tweet.id, posted_at: new Date().toISOString(), error: null })
      .eq('id', row.id);

    if (row.source_post_id) {
      await supabaseAdmin
        .from('character_posts')
        .update({ crossposted_to_x: true })
        .eq('id', row.source_post_id);
    }

    logger.info('x-publisher:posted', { socialPostId: row.id, tweetId: tweet.id });
    return { success: true };
  } catch (err) {
    const message =
      err instanceof XApiError || err instanceof MediaFetchError || err instanceof Error
        ? err.message
        : String(err);

    // Rate-limited attempts go back to 'queued' (worth retrying next run)
    // rather than 'failed' (which reads as a permanent, needs-a-look error
    // in the admin queue) — everything else is a real failure.
    const isRateLimited = err instanceof XApiError && err.isRateLimited;
    const nextStatus = isRateLimited ? 'queued' : 'failed';

    await supabaseAdmin
      .from('social_posts')
      .update({ status: nextStatus, error: message })
      .eq('id', row.id);

    logger.warn('x-publisher:failed', { socialPostId: row.id, error: message, isRateLimited });
    return { success: false, error: message };
  }
}

export interface PublishRunResult {
  [key: string]: unknown;
  posted: number;
  failed: number;
  skipped: number;
}

/** Cron entry point — only posts if x_auto_publish_enabled is true; stops once the daily cap is reached. */
export async function runXPublisherCron(): Promise<PublishRunResult> {
  if (!isXClientConfigured()) {
    return { posted: 0, failed: 0, skipped: 0 };
  }

  const autoPublishEnabled = await getXAutoPublishEnabled();
  if (!autoPublishEnabled) {
    return { posted: 0, failed: 0, skipped: 0 };
  }

  const [postedToday, dailyCap] = await Promise.all([countXPostsToday(), getXDailyPostCap()]);
  const remaining = Math.max(0, dailyCap - postedToday);
  if (remaining === 0) {
    return { posted: 0, failed: 0, skipped: 0 };
  }

  const { data, error } = await supabaseAdmin
    .from('social_posts')
    .select('id,character_id,source_post_id,tweet_text,media_url')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(remaining);

  if (error || !data) {
    logger.error('x-publisher:fetch-failed', { error: error?.message });
    return { posted: 0, failed: 0, skipped: 0 };
  }

  let posted = 0;
  let failed = 0;

  for (const row of data as QueuedRow[]) {
    const result = await publishOne(row);
    if (result.success) posted++;
    else failed++;
  }

  return { posted, failed, skipped: 0 };
}

/**
 * Admin-triggered immediate publish of one row (bypasses
 * x_auto_publish_enabled — an admin explicitly clicking "publish now" is
 * itself the approval that toggle exists to require). Still respects the
 * same daily cap as the cron: one admin manually publishing shouldn't be
 * able to blow past the limit any more than unattended posting can — if
 * the cap needs raising for a real reason, that's an app_config change
 * (or a `/admin/social` toggle once built), not a bypass buried in this
 * one action.
 */
export async function publishSocialPostNow(socialPostId: string): Promise<{ success: boolean; error?: string }> {
  if (!isXClientConfigured()) {
    return { success: false, error: 'X credentials not configured' };
  }

  const [postedToday, dailyCap] = await Promise.all([countXPostsToday(), getXDailyPostCap()]);
  if (postedToday >= dailyCap) {
    return { success: false, error: `Daily X post cap (${dailyCap}) already reached today` };
  }

  const { data: row, error } = await supabaseAdmin
    .from('social_posts')
    .select('id,character_id,source_post_id,tweet_text,media_url,status')
    .eq('id', socialPostId)
    .maybeSingle();

  if (error || !row) {
    return { success: false, error: 'Post not found' };
  }
  if (row.status !== 'queued' && row.status !== 'pending_review') {
    return { success: false, error: `Cannot publish a post in status "${row.status}"` };
  }

  return publishOne(row as QueuedRow);
}
