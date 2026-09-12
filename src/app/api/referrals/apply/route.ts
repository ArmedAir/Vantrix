import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { generateCode } from '@/lib/referral-engine';
import { CLASS_REQUIREMENTS } from '@/lib/referral-config';
import { withErrorHandling } from '@/lib/api/with-error-handling';

const schema = z.object({
  requestedClass: z.enum(['dev', 'influencer']),
  applicationNote: z.string().min(20).max(2000),
  socialProofUrl: z.string().url(),
  followerCount: z.number().int().min(0).optional(),
  vanitySlug: z.string().regex(/^[a-z0-9-]{3,24}$/).optional(),
});

/**
 * POST /api/referrals/apply
 *
 * Entry point for devs and influencers to apply for a cash-commission
 * tier. Both classes require manual approval (CLASS_REQUIREMENTS) — this
 * route sets the partner row to 'pending_review' and never auto-approves,
 * even for influencer follower counts that clear the minimum, because a
 * follower count alone doesn't tell you about audience quality or fraud
 * risk. An admin approves via /api/admin/referrals/approve.
 *
 * UPGRADE-PATH FIX (2026-09-12): GET /api/referrals/me auto-creates a
 * free 'user'-class row (status 'active') the first time ANYONE opens the
 * Referrals dashboard — that's by design, it's the no-application-needed
 * free tier. But this route was unconditionally rejecting with 409
 * whenever *any* row already existed for the user, which meant that
 * auto-created free-tier row permanently blocked the one thing dev/
 * influencer applications exist for. Every application submitted after a
 * user had ever viewed /referrals (i.e. effectively every application)
 * failed with "You already have a referral partner record."
 *
 * `referral_partners.user_id` is UNIQUE (one row per user, ever — see
 * 2026071702_referral_system.sql), so an upgrade from the free tier is an
 * UPDATE of that same row, not a second INSERT. The row is only truly
 * "already spoken for" — and application blocked — when it's mid-review,
 * suspended, or already an approved cash-tier partner. A base 'user'-tier
 * row or a previously 'rejected' application are both fair game to
 * (re)apply from.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { requestedClass, applicationNote, socialProofUrl, followerCount, vanitySlug } = parsed.data;

  const requirements = CLASS_REQUIREMENTS[requestedClass];
  if (requirements.minFollowers && (followerCount ?? 0) < requirements.minFollowers) {
    return NextResponse.json({
      error: `${requestedClass} tier requires at least ${requirements.minFollowers} followers`,
      code: 'BELOW_MINIMUM',
    }, { status: 403 });
  }

  const { data: existing } = await supabase
    .from('referral_partners').select('id,class,status').eq('user_id', user.id).maybeSingle();

  if (existing) {
    if (existing.status === 'pending_review') {
      return NextResponse.json(
        { error: 'Your application is already under review', status: existing.status },
        { status: 409 },
      );
    }
    if (existing.status === 'suspended') {
      return NextResponse.json(
        { error: 'Your referral partner account is suspended', status: existing.status },
        { status: 403 },
      );
    }
    if (existing.status === 'active' && existing.class !== 'user') {
      return NextResponse.json(
        { error: `You're already an approved ${existing.class} partner`, status: existing.status },
        { status: 409 },
      );
    }
    // Remaining cases — 'active' + class 'user' (the free-tier default
    // everyone starts with), or a previous 'rejected' application — are
    // both eligible to (re)apply. Falls through to the shared upsert below.
  }

  if (vanitySlug) {
    let slugQuery = supabase.from('referral_partners').select('id').eq('vanity_slug', vanitySlug);
    if (existing) slugQuery = slugQuery.neq('id', existing.id);
    const { data: slugTaken } = await slugQuery.maybeSingle();
    if (slugTaken) return NextResponse.json({ error: 'That vanity link is already taken' }, { status: 409 });
  }

  const applicationFields = {
    class: requestedClass,
    status: 'pending_review' as const,
    vanity_slug: vanitySlug ?? null,
    application_note: applicationNote,
    social_proof_url: socialProofUrl,
    follower_count: followerCount ?? null,
  };

  if (existing) {
    const { data: updated, error } = await supabase
      .from('referral_partners')
      .update(applicationFields)
      .eq('id', existing.id)
      .select('id,status,code')
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: 'Failed to submit application', detail: error?.message }, { status: 500 });
    }
    return NextResponse.json({ applicationId: updated.id, status: updated.status, code: updated.code });
  }

  // No prior row at all — rare (apply is normally reached via the
  // dashboard, which already provisions one) but handled for
  // completeness, e.g. a direct API call. Code generation is retried on a
  // unique-constraint collision (code has a UNIQUE index) rather than
  // failing the whole application over what's a ~1-in-65536 coincidence.
  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
  const seed = profile?.display_name ?? user.email ?? user.id;

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: partner, error } = await supabase.from('referral_partners').insert({
      user_id: user.id,
      code: generateCode(seed),
      ...applicationFields,
    }).select('id,status,code').single();

    if (partner) return NextResponse.json({ applicationId: partner.id, status: partner.status, code: partner.code });
    if (error?.code !== '23505') { // not a unique-violation — retrying won't help
      return NextResponse.json({ error: 'Failed to submit application', detail: error?.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Failed to submit application', detail: 'code generation exhausted retries' }, { status: 500 });
}, 'referrals/apply');
