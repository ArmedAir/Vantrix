import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/security';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import { heartbeatStart, heartbeatSuccess, heartbeatFail } from '@/lib/cron/heartbeat';
import { computeCharacterValueScores } from '@/lib/commerce/character-fund';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/character-fund-distribution
 *
 * Weekly (see config/cron-jobs.mjs — same Monday cadence as
 * referral-payouts). Computes the Character Value Score for every
 * monetization-eligible character over the trailing 7-day window and
 * writes character_value_scores + any creator_fund_flags rows — see
 * lib/commerce/character-fund.ts's computeCharacterValueScores() for the
 * actual scoring/normalization/self-dealing-detection logic; this route
 * is only the schedule/auth/observability wrapper, same shape as every
 * other cron route in this codebase.
 *
 * This never moves money on its own — same posture as raas_creator_earnings:
 * rows land with payout_status='pending' (or 'pending_review' if a fraud
 * heuristic fired), and an admin/finance workflow handles the actual
 * payout transition to 'paid'.
 */
export async function GET(req: NextRequest) {
  if (!requireCronAuth(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await heartbeatStart('CHARACTER_FUND_DISTRIBUTION');

  try {
    // Trailing 7-day window ending at the top of the hour this run fired,
    // not calendar-week-aligned — keeps this safe to run at any time
    // without producing a short first/last period.
    const periodEnd = new Date();
    periodEnd.setMinutes(0, 0, 0);
    const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    const summary = await computeCharacterValueScores(periodStart, periodEnd);

    logger.info('cron:character-fund-distribution:complete', summary as unknown as Record<string, unknown>);
    await heartbeatSuccess('CHARACTER_FUND_DISTRIBUTION');
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    logger.error('cron:character-fund-distribution:failed', { error: String(err) });
    await heartbeatFail('CHARACTER_FUND_DISTRIBUTION');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
