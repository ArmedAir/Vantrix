/**
 * Streak Risk Reminder — Vantrix
 *
 * The account-level daily streak (user_streaks, see growth/streak-rewards-
 * engine.ts) already computes "at risk" state — GET /api/user/streak-shield
 * flags streakAtRisk when >22h have passed since last_checkin — but that
 * state was only ever surfaced passively, inside a panel the user has to
 * open the app to see. A user who doesn't open the app today gets no
 * signal at all and simply loses the streak overnight. This module is the
 * proactive half: a once-daily sweep that finds users whose streak is
 * still alive but not yet checked in today, and sends one reminder before
 * the UTC daily-reset would break it.
 *
 * Eligibility (see getStreakRiskCandidates):
 *   current_streak > 0                          — only users with something
 *                                                  to lose
 *   last_checkin within [yesterday 00:00 UTC,   — checked in yesterday
 *                         today 00:00 UTC)         (UTC calendar day), not
 *                                                  yet today. This is the
 *                                                  exact "still alive, still
 *                                                  needs today's check-in"
 *                                                  window per
 *                                                  check_and_update_streak()'s
 *                                                  own v_last_checkin =
 *                                                  v_today - 1 branch — NOT
 *                                                  a >22h rolling window,
 *                                                  which would also catch
 *                                                  users whose streak
 *                                                  already lapsed days ago
 *                                                  (current_streak just
 *                                                  hasn't been reset to 0
 *                                                  yet because that only
 *                                                  happens on their next
 *                                                  check-in).
 *
 * Delivery goes through emitNotification() (respects the user's own
 * streak_risk in-app/push preference, writes the inbox row, fans out to
 * push) and reserveProactiveSlot() (the same cross-source daily
 * cap/quiet-gap that character-initiative.ts, surprise-engine.ts, and
 * nudge.ts already share), so this never stacks on top of another
 * proactive push the same day.
 *
 * Message copy is static and runs through toneGuard() anyway (belt and
 * suspenders, same posture as recordSurprise() in surprise-engine.ts) —
 * no fake urgency, no guilt, just a plain heads-up with the real number.
 *
 * Known limitation (shared with nudges/surprises/character-initiatives —
 * none of those are timezone-aware either): this fires on one fixed UTC
 * schedule for every user. There's no per-user timezone column on
 * `profiles` yet, so "early evening, most timezones" (20:00 UTC) is the
 * best available compromise, not a real localized send time.
 *
 * Called by /api/cron/streak-risk (cron: once daily, 20:00 UTC).
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { emitNotification } from '@/lib/notifications/emit';
import { reserveProactiveSlot } from '@/lib/notifications/proactive-arbitrator';
import { toneGuard } from '@/lib/ai/surprise-engine';

export interface StreakRiskCandidate {
  userId: string;
  currentStreak: number;
}

/** Users whose streak is still alive but hasn't been checked in today (UTC). */
export async function getStreakRiskCandidates(limit = 2000): Promise<StreakRiskCandidate[]> {
  const now = new Date();
  const todayStartUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterdayStartUTC = new Date(todayStartUTC.getTime() - 24 * 60 * 60 * 1000);

  const { data, error } = await supabaseAdmin
    .from('user_streaks')
    .select('user_id, current_streak, last_checkin')
    .gt('current_streak', 0)
    .gte('last_checkin', yesterdayStartUTC.toISOString())
    .lt('last_checkin', todayStartUTC.toISOString())
    .limit(limit);

  if (error) {
    logger.error('streak-risk:getStreakRiskCandidates-failed', { error: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({ userId: row.user_id, currentStreak: row.current_streak }));
}

function buildMessage(streak: number): { title: string; body: string } {
  const title = 'Your streak is still open';
  const body =
    streak === 1
      ? `Day 1 is in the books — send a message today to start day 2.`
      : `Your ${streak}-day streak is still open today — a quick message keeps it going.`;
  return { title, body };
}

export interface StreakRiskSweepResult {
  [key: string]: unknown;
  candidates: number;
  sent: number;
  skippedArbitration: number;
  skippedToneGuard: number;
}

export async function runStreakRiskSweep(): Promise<StreakRiskSweepResult> {
  const candidates = await getStreakRiskCandidates();
  const result: StreakRiskSweepResult = {
    candidates: candidates.length,
    sent: 0,
    skippedArbitration: 0,
    skippedToneGuard: 0,
  };

  for (const candidate of candidates) {
    const { title, body } = buildMessage(candidate.currentStreak);

    const check = toneGuard(body);
    if (!check.ok) {
      // Should never actually fire against the two static templates above —
      // this is defense in depth in case the copy is ever edited to
      // interpolate something dynamic later. Skip rather than send.
      logger.warn('streak-risk:tone-guard-blocked', { userId: candidate.userId, pattern: check.violated });
      result.skippedToneGuard += 1;
      continue;
    }

    const claimed = await reserveProactiveSlot({ userId: candidate.userId, source: 'streak_risk' });
    if (!claimed) {
      result.skippedArbitration += 1;
      continue;
    }

    await emitNotification({
      userId: candidate.userId,
      type: 'streak_risk',
      title,
      body,
      ctaUrl: '/chats',
      urgency: 'medium',
      metadata: { streak: candidate.currentStreak },
    });

    result.sent += 1;
  }

  logger.info('streak-risk:sweep-complete', result);
  return result;
}
