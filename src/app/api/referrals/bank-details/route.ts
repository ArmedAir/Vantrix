import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveAccountNumber, PaystackTransferError } from '@/lib/paystack-transfer';

const schema = z.object({
  accountNumber: z.string().regex(/^\d{10}$/),
  bankCode: z.string().min(1),
});

/**
 * POST /api/referrals/bank-details
 *
 * Saves payout bank details for the current user's referral partner
 * record. Re-resolves the account name server-side (never trusts a
 * client-supplied name) and clears any cached Paystack recipient code, so
 * the next payout run re-registers the recipient against the new account
 * instead of silently paying the old one.
 *
 * Restricted to 'dev' and 'influencer' classes — the 'user' class never
 * receives cash, so it has nothing to configure here.
 *
 * RLS FIX (2026-09-12): referral_partners has no UPDATE policy at all
 * (see the identical fix in /api/referrals/apply and
 * /api/admin/referrals/approve) — this save was silently rejected by RLS
 * for the same reason. Eligibility (own row, dev/influencer class, active
 * status) is already fully checked above before the write, so the write
 * itself goes through supabaseAdmin.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });

  const { data: partner } = await supabase
    .from('referral_partners')
    .select('id,class,status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!partner) return NextResponse.json({ error: 'No referral partner record found' }, { status: 404 });
  if (partner.class === 'user') {
    return NextResponse.json({ error: 'The free referral tier has no bank details to configure — it pays in tokens.' }, { status: 400 });
  }
  if (partner.status !== 'active') {
    return NextResponse.json({ error: `Your partner application is ${partner.status} — bank details can be set once approved.` }, { status: 403 });
  }

  let accountName: string;
  try {
    ({ accountName } = await resolveAccountNumber(parsed.data));
  } catch (err) {
    const message = err instanceof PaystackTransferError ? err.message : 'Could not verify that account';
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const { error } = await supabaseAdmin.from('referral_partners').update({
    payout_bank_code: parsed.data.bankCode,
    payout_account_no: parsed.data.accountNumber,
    payout_account_name: accountName,
    paystack_recipient_code: null, // force re-registration against the (possibly new) account
  }).eq('id', partner.id);

  if (error) return NextResponse.json({ error: 'Failed to save bank details', detail: error.message }, { status: 500 });

  return NextResponse.json({ accountName, saved: true });
}
