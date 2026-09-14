import { createHash, randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emitNotification } from './notifications/emit';
import { bg } from './logger';
import {
  ATTRIBUTION_MODEL,
  ATTRIBUTION_WINDOW_DAYS,
  COMMISSION_HOLD_DAYS,
  USER_CLASS_TOKEN_BONUS,
  REFEREE_FIRST_MONTH_DISCOUNT_PCT,
  INFLUENCER_VOLUME_BONUSES_NGN,
  getCommissionPct,
  type ReferralClass,
} from './referral-config';

/** Hashes IP+UA the same way the rest of the app hashes visitor identifiers — never store raw IP. */
export function hashVisitor(ip: string, userAgent: string, salt: string): string {
  return createHash('sha256').update(`${ip}|${userAgent}|${salt}`).digest('hex');
}

/**
 * Generates a referral code. 'user' class gets a short auto code from
 * their username; 'dev'/'influencer' can request a vanity slug at
 * application time (validated separately).
 */
export function generateCode(seed: string): string {
  const base = seed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase() || 'VTX';
  const suffix = randomUUID().slice(0, 4).toUpperCase();
  return `${base}${suffix}`;
}

/**
 * ROOT CAUSE (2026-09-07): "my referral link is broken" traced to this
 * function. GET /api/referrals/me builds the shareable link from
 * `vanity_slug` whenever a partner has one set (`/r/${vanity_slug}`,
 * falling back to `/r/${code}` only when there isn't one — see that
 * route's `linkPath`), but recordClick() below only ever looked the
 * incoming URL segment up against the `code` column. Any partner who set
 * a vanity slug — the exact thing dev/influencer applicants are invited
 * to request on /api/referrals/apply, and the whole point of the "vanity"
 * feature — got a link that 404'd on every single click: recordClick
 * returns 'invalid_code', the /r/[code] route treats that identically to
 * a typo'd/dead link and silently redirects the visitor to "/" with no
 * signup step, and nothing is ever recorded, so the partner's own click
 * count stays at zero forever with no error surfaced anywhere. The same
 * code-only lookup existed independently in the badge/banner embed asset
 * routes, so the same partners' embed images broke for the same reason.
 *
 * Fix: a single shared resolver used by all three call sites, checking
 * `code` first (the common case, one query) and only falling back to
 * `vanity_slug` when that misses. Deliberately two sequential `.eq()`
 * calls rather than one `.or('code.eq.X,vanity_slug.eq.X')` — the code
 * segment here comes straight from a public, unauthenticated URL param
 * (see /r/[code]/route.ts), and hand-interpolating untrusted input into
 * a PostgREST `.or()` filter string is a real injection surface (commas/
 * parens in the filter syntax) for zero benefit over two parameterized
 * `.eq()` lookups.
 */
export async function resolvePartnerByCodeOrSlug(
  supabase: SupabaseClient,
  identifier: string,
  select: string,
) {
  const { data: byCode } = await supabase
    .from('referral_partners')
    .select(select)
    .eq('code', identifier)
    .maybeSingle();
  if (byCode) return byCode;

  const { data: bySlug } = await supabase
    .from('referral_partners')
    .select(select)
    .eq('vanity_slug', identifier)
    .maybeSingle();
  return bySlug;
}

/** Records a click against a partner's code or vanity slug. Called from the /r/[code] redirect route. */
export async function recordClick(
  supabase: SupabaseClient,
  params: { code: string; visitorHash: string; landingPath: string }
): Promise<{ partnerId: string } | { error: string }> {
  const partner = await resolvePartnerByCodeOrSlug(supabase, params.code, 'id,status') as
    | { id: string; status: string }
    | null;

  if (!partner) return { error: 'invalid_code' };
  if (partner.status !== 'active') return { error: 'partner_inactive' };

  await supabase.from('referral_clicks').insert({
    partner_id: partner.id,
    visitor_hash: params.visitorHash,
    landing_path: params.landingPath,
  });

  return { partnerId: partner.id };
}

/**
 * Attributes a new signup to a partner, if an eligible click exists within
 * the attribution window. Call this right after a new user completes
 * signup (not on every page load).
 *
 * FRAUD GUARD: a partner cannot refer themselves — checked by comparing
 * the new user's id against the partner's own user_id.
 */
export async function attributeConversion(
  supabase: SupabaseClient,
  params: { newUserId: string; visitorHash: string; refCode?: string | null }
): Promise<{ conversionId: string; partnerId: string } | { skipped: string }> {
  const windowStart = new Date(Date.now() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // COOKIE-ATTRIBUTION FIX: prefer the `vx_ref` cookie the /r/[code] route
  // now sets, which names the partner directly and survives a UA/IP change
  // between click and signup (in-app-browser click -> real-browser signup,
  // or a mobile IP change over time — both silently broke the old
  // hash-only match). Only fall back to the IP+UA click hash when there's
  // no cookie (e.g. the visitor has cookies blocked), so existing behavior
  // is preserved rather than replaced.
  let winningPartnerId: string | null = null;

  if (params.refCode) {
    const partnerByCode = await resolvePartnerByCodeOrSlug(supabase, params.refCode, 'id,status') as
      | { id: string; status: string }
      | null;
    if (partnerByCode) winningPartnerId = partnerByCode.id;
  }

  if (!winningPartnerId) {
    const { data: clicks } = await supabase
      .from('referral_clicks')
      .select('partner_id,created_at')
      .eq('visitor_hash', params.visitorHash)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: ATTRIBUTION_MODEL === 'first-touch' });

    if (!clicks || clicks.length === 0) return { skipped: 'no_click' };
    winningPartnerId = clicks[0].partner_id; // first row per the ordering above wins, per ATTRIBUTION_MODEL
  }

  const { data: partner } = await supabase
    .from('referral_partners')
    .select('id,user_id,status')
    .eq('id', winningPartnerId)
    .single();

  if (!partner || partner.status !== 'active') return { skipped: 'partner_inactive' };
  if (partner.user_id === params.newUserId) return { skipped: 'self_referral' };

  const { data: existing } = await supabase
    .from('referral_conversions')
    .select('id')
    .eq('referred_user_id', params.newUserId)
    .maybeSingle();
  if (existing) return { skipped: 'already_attributed' };

  const { data: conversion, error } = await supabase
    .from('referral_conversions')
    .insert({ partner_id: partner.id, referred_user_id: params.newUserId })
    .select('id')
    .single();

  if (error || !conversion) return { skipped: `insert_failed:${error?.message}` };

  await supabase.from('profiles')
    .update({ referred_by_partner_id: partner.id })
    .eq('id', params.newUserId);

  return { conversionId: conversion.id, partnerId: partner.id };
}

/**
 * Called from the payment-success webhook path (Paystack/Stripe/
 * NOWPayments), AFTER the payment is confirmed. Computes and records the
 * commission (or token bonus) for that payment, if the payer was
 * referred. Idempotent on source_payment_id — safe to call more than once
 * for the same payment (webhook retries).
 */
export async function recordCommissionForPayment(
  supabase: SupabaseClient,
  params: {
    payerId: string;
    sourcePaymentId: string;
    paymentAmountNgn: number;
    monthNumber: number; // 1 = payer's first paid month with this partner attribution
  }
): Promise<{ status: 'no_referral' | 'already_recorded' | 'token_bonus' | 'commission_recorded' }> {
  const { data: conversion } = await supabase
    .from('referral_conversions')
    .select('id,partner_id,fraud_flag')
    .eq('referred_user_id', params.payerId)
    .maybeSingle();

  if (!conversion || conversion.fraud_flag) return { status: 'no_referral' };

  const { data: partner } = await supabase
    .from('referral_partners')
    .select('id,user_id,class,status')
    .eq('id', conversion.partner_id)
    .single();

  if (!partner || partner.status !== 'active') return { status: 'no_referral' };

  const cls = partner.class as ReferralClass;

  if (cls === 'user') {
    // Token bonus is one-time — only on this referred user's FIRST payment.
    if (params.monthNumber !== 1) return { status: 'no_referral' };
    const { data: existingBonus } = await supabase
      .from('referral_token_rewards')
      .select('id')
      .eq('conversion_id', conversion.id)
      .maybeSingle();
    if (existingBonus) return { status: 'already_recorded' };

    // Credit tokens to the partner's own account (partner.user_id, NOT
    // partner.id — the latter is the referral_partners row id) BEFORE
    // recording the reward row, so a failed credit can still be retried on
    // the next webhook delivery instead of getting silently swallowed by
    // the existingBonus check above. Uses the existing add_tokens() RPC
    // (see supabase/migrations/20240101_production.sql) rather than a
    // nonexistent 'increment_tokens' function.
    const { error: creditErr } = await supabase.rpc('add_tokens', {
      p_user_id: partner.user_id,
      p_amount: USER_CLASS_TOKEN_BONUS,
    });
    if (creditErr) {
      throw new Error(`add_tokens failed for referral bonus: ${creditErr.message}`);
    }

    await supabase.from('referral_token_rewards').insert({
      conversion_id: conversion.id,
      partner_id: partner.id,
      tokens_awarded: USER_CLASS_TOKEN_BONUS,
    });

    emitNotification({
      userId: partner.user_id,
      type: 'referral_reward',
      title: 'Referral reward',
      body: `You earned ${USER_CLASS_TOKEN_BONUS} tokens for a successful referral.`,
      ctaUrl: '/referrals',
      urgency: 'medium',
      metadata: { conversionId: conversion.id, tokensAwarded: USER_CLASS_TOKEN_BONUS },
    }).catch(bg('emitNotification.referralReward'));

    return { status: 'token_bonus' };
  }

  const pct = getCommissionPct(cls, params.monthNumber);
  if (pct <= 0) return { status: 'no_referral' }; // past the decay window — house keeps 100%

  const { data: existing } = await supabase
    .from('referral_commissions')
    .select('id')
    .eq('source_payment_id', params.sourcePaymentId)
    .maybeSingle();
  if (existing) return { status: 'already_recorded' };

  const commissionNgn = Math.round(params.paymentAmountNgn * pct * 100) / 100;

  await supabase.from('referral_commissions').insert({
    conversion_id: conversion.id,
    partner_id: partner.id,
    source_payment_id: params.sourcePaymentId,
    payment_amount_ngn: params.paymentAmountNgn,
    commission_pct: pct,
    commission_ngn: commissionNgn,
    month_number: params.monthNumber,
    status: 'pending',
  });

  return { status: 'commission_recorded' };
}

/**
 * Call from a refund/chargeback webhook handler. Reverses any commission
 * tied to that payment, whether it already moved to 'payable' or is still
 * 'pending' — this is the anti-fraud clawback.
 */
export async function clawBackCommission(
  supabase: SupabaseClient,
  sourcePaymentId: string
): Promise<{ reversed: boolean }> {
  const { data, error } = await supabase
    .from('referral_commissions')
    .update({ status: 'clawed_back' })
    .eq('source_payment_id', sourcePaymentId)
    .in('status', ['pending', 'payable'])
    .select('id');

  return { reversed: !error && !!data && data.length > 0 };
}

/**
 * Cron job: moves any 'pending' commission older than COMMISSION_HOLD_DAYS
 * to 'payable', now that the refund-risk window has passed clean.
 */
export async function releaseMaturedHolds(supabase: SupabaseClient): Promise<{ released: number }> {
  const cutoff = new Date(Date.now() - COMMISSION_HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('referral_commissions')
    .update({ status: 'payable' })
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .select('id');

  return { released: error ? 0 : (data?.length ?? 0) };
}

/**
 * Was previously defined in referral-config.ts (REFEREE_FIRST_MONTH_DISCOUNT_PCT)
 * but never read by any checkout route — the referred-user discount was
 * promised in config/copy but not actually applied anywhere.
 *
 * Call this BEFORE creating a checkout session (Stripe or Paystack), for
 * any authenticated user. Returns the discount pct to apply (0 if none).
 * Does NOT mark the discount as used — that happens in
 * markRefereeDiscountUsed(), which the payment-success webhook calls only
 * once the payment actually clears, so an abandoned checkout doesn't burn
 * the user's one-time discount.
 */
export async function getRefereeDiscountPct(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('referred_by_partner_id,referral_discount_used')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.referred_by_partner_id) return 0;
  if (profile.referral_discount_used) return 0;

  return REFEREE_FIRST_MONTH_DISCOUNT_PCT;
}

/**
 * Marks the referee discount as consumed. Call from the payment-success
 * webhook path, alongside recordCommissionForPayment(), once the first
 * payment actually clears. Idempotent: setting an already-true flag is a
 * harmless no-op.
 */
export async function markRefereeDiscountUsed(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase
    .from('profiles')
    .update({ referral_discount_used: true })
    .eq('id', userId);
}

/**
 * Was previously defined in referral-config.ts (INFLUENCER_VOLUME_BONUSES_NGN)
 * but never read by any cron/payout code — influencer volume bonuses were
 * promised but never actually paid.
 *
 * Call from the referral-payouts cron, once per influencer-class partner,
 * before the regular commission payout loop. Checks each bonus tier's
 * threshold (N paying referrals within windowDays) against actual
 * conversions-with-a-commission in that window, and queues a payout row
 * for the highest newly-earned tier this partner hasn't already been paid
 * (tiers are cumulative, one-time-per-partner — see the UNIQUE constraint
 * on referral_volume_bonuses).
 */
export async function checkAndAwardVolumeBonuses(
  supabase: SupabaseClient,
  params: { partnerId: string; partnerClass: ReferralClass }
): Promise<{ awardedNgn: number; tier: number | null }> {
  if (params.partnerClass !== 'influencer') return { awardedNgn: 0, tier: null };

  const { data: alreadyAwarded } = await supabase
    .from('referral_volume_bonuses')
    .select('min_paying_referrals')
    .eq('partner_id', params.partnerId);

  const awardedTiers = new Set((alreadyAwarded ?? []).map((r) => r.min_paying_referrals));

  // Highest tier first — if a partner qualifies for the top tier, pay
  // that one rather than working up through lower tiers one at a time.
  const sortedTiers = [...INFLUENCER_VOLUME_BONUSES_NGN].sort(
    (a, b) => b.minPayingReferrals - a.minPayingReferrals
  );

  for (const bonusTier of sortedTiers) {
    if (awardedTiers.has(bonusTier.minPayingReferrals)) continue;

    const windowStart = new Date(
      Date.now() - bonusTier.windowDays * 24 * 60 * 60 * 1000
    ).toISOString();

    // "Paying referrals" = distinct conversions that generated at least
    // one commission (any status) within the window — a referred signup
    // with no payment doesn't count.
    const { data: commissions } = await supabase
      .from('referral_commissions')
      .select('conversion_id')
      .eq('partner_id', params.partnerId)
      .gte('created_at', windowStart);

    const distinctPayingReferrals = new Set((commissions ?? []).map((c) => c.conversion_id)).size;

    if (distinctPayingReferrals >= bonusTier.minPayingReferrals) {
      const { error } = await supabase.from('referral_volume_bonuses').insert({
        partner_id: params.partnerId,
        min_paying_referrals: bonusTier.minPayingReferrals,
        window_days: bonusTier.windowDays,
        bonus_ngn: bonusTier.bonusNgn,
      });
      // Unique constraint means a concurrent cron run can't double-insert;
      // if it lost the race, treat as not-awarded-by-us this run.
      if (!error) {
        return { awardedNgn: bonusTier.bonusNgn, tier: bonusTier.minPayingReferrals };
      }
    }
  }

  return { awardedNgn: 0, tier: null };
}
