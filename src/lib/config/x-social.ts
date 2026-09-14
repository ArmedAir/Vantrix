/**
 * Shared loader for the two X cross-posting app_config rows (seeded by
 * 20261226_x_social_publishing.sql), following the same shape as
 * getContactEmail()/getDiscordUrl() (lib/config/contact.ts): fetch by
 * app_config key -> validate -> fall back to a hardcoded constant if the
 * row is missing or malformed. Both values are editable from the
 * app_config table (or the /admin/social toggle, once built) without a
 * redeploy.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

// Matches the migration's seed values. auto-publish defaults OFF: even if
// the app_config row is ever missing/corrupted, the fallback must never be
// "on" — that would silently re-enable unattended posting.
export const FALLBACK_X_AUTO_PUBLISH_ENABLED = false;
export const FALLBACK_X_DAILY_POST_CAP = 10;

export async function getXAutoPublishEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_config')
      .select('value')
      .eq('key', 'x_auto_publish_enabled')
      .maybeSingle();

    if (error || !data?.value) return FALLBACK_X_AUTO_PUBLISH_ENABLED;
    return data.value.trim().toLowerCase() === 'true';
  } catch (err) {
    logger.error('Failed to load x_auto_publish_enabled config', { err: String(err) });
    return FALLBACK_X_AUTO_PUBLISH_ENABLED;
  }
}

export async function getXDailyPostCap(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_config')
      .select('value')
      .eq('key', 'x_daily_post_cap')
      .maybeSingle();

    if (error || !data?.value) return FALLBACK_X_DAILY_POST_CAP;

    const parsed = Number(data.value.trim());
    if (!Number.isFinite(parsed) || parsed < 0) {
      logger.warn('x_daily_post_cap config invalid, using fallback', { value: data.value });
      return FALLBACK_X_DAILY_POST_CAP;
    }
    return Math.floor(parsed);
  } catch (err) {
    logger.error('Failed to load x_daily_post_cap config', { err: String(err) });
    return FALLBACK_X_DAILY_POST_CAP;
  }
}

/** Rows already posted since UTC midnight — the authoritative "how many are left today" count for both auto-select (headroom) and the publisher cron (hard gate). */
export async function countXPostsToday(): Promise<number> {
  const utcMidnight = new Date();
  utcMidnight.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin
    .from('social_posts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'posted')
    .gte('posted_at', utcMidnight.toISOString());

  if (error) {
    logger.error('Failed to count today\'s X posts', { err: error.message });
    // Fail closed: if we can't confirm how many have gone out, assume the
    // cap is already used up rather than risk over-posting.
    return Number.POSITIVE_INFINITY;
  }
  return count ?? 0;
}
