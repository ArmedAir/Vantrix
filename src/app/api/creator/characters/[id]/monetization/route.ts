/**
 * POST /api/creator/characters/[id]/monetization
 *
 * Enrolls an already-public, already-approved character into the Creator
 * Fund (see 20270115_creator_fund_character_value_score.sql's
 * upgrade_character_monetization() for the full validation + atomic fee
 * charge). This is separate from and in addition to the base 100-token
 * character-creation fee — creating a character makes it usable;
 * upgrading it makes it eligible for the Character Value Score program.
 *
 * GET returns the current fee + the character's monetization_status, so
 * the client can render "Upgrade for 250 Vantrix Coin" without a second
 * round trip through /api/characters/[id].
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCreatorFundConfig, upgradeCharacterMonetization, computeCharacterFundReadiness } from '@/lib/commerce/character-fund';
import { withErrorHandling } from '@/lib/api/with-error-handling';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  character_not_found: 'Character not found.',
  not_owner: 'Only the creator can upgrade this character.',
  already_monetized: 'This character is already enrolled in the Creator Fund.',
  monetization_suspended: 'This character\u2019s monetization was suspended by moderation.',
  character_not_public: 'The character must be public before it can be monetized.',
  character_not_approved: 'The character must pass moderation review before it can be monetized.',
  insufficient_tokens: 'Not enough Vantrix Coin to cover the upgrade fee.',
  upgrade_failed: 'Could not upgrade this character right now. Please try again.',
  below_readiness_threshold: 'This character needs a bit more depth before it can join the Creator Fund \u2014 fill in the missing checklist items and try again.',
};

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const [config, { data: character }, readiness] = await Promise.all([
    getCreatorFundConfig(),
    supabaseAdmin
      .from('characters')
      .select('id, creator_id, active, is_public, moderation_status, monetization_status, monetization_upgraded_at')
      .eq('id', id)
      .single(),
    computeCharacterFundReadiness(id),
  ]);

  if (!character || character.creator_id !== user.id) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 });
  }

  return NextResponse.json({
    monetizationStatus: character.monetization_status,
    monetizationUpgradedAt: character.monetization_upgraded_at,
    upgradeFeeTokens: config.monetizationUpgradeFeeTokens,
    eligible: character.active && character.is_public && character.moderation_status === 'approved',
    // Advisory checklist by default — see creator_fund_min_readiness_score.
    // minReadinessScore === 0 means readiness is shown but never blocks POST.
    readiness,
    minReadinessScore: config.minReadinessScore,
  });
}, 'creator/characters/[id]/monetization');

export const POST = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const result = await upgradeCharacterMonetization(user.id, id);

  if (!result.success) {
    const status = result.error === 'not_owner' ? 403
      : result.error === 'character_not_found' ? 404
      : result.error === 'insufficient_tokens' ? 402
      : 400;
    return NextResponse.json({
      error: ERROR_MESSAGES[result.error ?? 'upgrade_failed'],
      code: result.error,
      // Only set for below_readiness_threshold, so the client can render
      // exactly which checklist items are still missing.
      readiness: result.readiness,
    }, { status });
  }

  return NextResponse.json({ ok: true });
}, 'creator/characters/[id]/monetization');
