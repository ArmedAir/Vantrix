/**
 * GET /api/creator/dashboard
 *
 * Backs the Creator Studio earnings dashboard
 * (components/studio/creator-dashboard/creator-earnings-dashboard.tsx):
 * per-character interactions, retention, trending, and combined
 * marketplace + Creator Fund earnings for the most recently computed
 * period. See lib/commerce/character-fund.ts's getCreatorDashboard() for
 * how the two earnings streams are composed.
 *
 * Read-only, like /api/creator/earnings — payout processing itself stays
 * out of scope here.
 */
import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCreatorDashboard } from '@/lib/commerce/character-fund';
import { withErrorHandling } from '@/lib/api/with-error-handling';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // All character_value_scores rows written by a given cron run share the
  // same period_start — find the most recent one rather than recomputing
  // "now" here, so the dashboard always reflects an actually-settled
  // period, not a partial in-flight one.
  const { data: latest } = await supabaseAdmin
    .from('character_value_scores')
    .select('period_start')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) {
    return NextResponse.json({
      periodStart: null,
      periodEnd: null,
      totalEarnedTokens: 0,
      totalEarnedTrendPct: null,
      pendingTokens: 0,
      paidTokens: 0,
      characters: [],
      note: 'No Creator Fund period has been computed yet.',
    });
  }

  const periodStart = new Date(latest.period_start);
  const periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const priorPeriodStart = new Date(periodStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const dashboard = await getCreatorDashboard(user.id, periodStart, periodEnd, priorPeriodStart);
  return NextResponse.json(dashboard);
}, 'creator/dashboard');
