/**
 * GET /api/creator/earnings
 *
 * A creator's marketplace earnings across all their characters' purchased
 * relationship tiers (bond/soulbound) — see creator_earnings ledger in
 * 20260910_raas_unification.sql and lib/commerce/raas.ts's
 * getCreatorEarnings(). Read-only; payout processing itself is out of
 * scope here (payout_status transitions to 'paid' via an admin/finance
 * workflow, not this endpoint).
 */
import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { getCreatorEarnings } from '@/lib/commerce/raas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const earnings = await getCreatorEarnings(user.id);
  return NextResponse.json(earnings);
}
