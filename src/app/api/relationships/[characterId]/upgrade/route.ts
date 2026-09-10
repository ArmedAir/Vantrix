/**
 * POST /api/relationships/[characterId]/upgrade
 *
 * Purchase a relationship tier ('bond' or 'soulbound') for one specific
 * character with Vantrix Coin. Mirrors dating/gifts's shape: this route
 * validates the request and reports the result; the actual token
 * deduction + tier grant + creator earnings credit all happen atomically
 * inside purchase_relationship_tier() (see
 * 20260910_raas_unification.sql) via lib/commerce/raas.ts's thin wrapper.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { purchaseRelationshipTier, getCharacterPricing } from '@/lib/commerce/raas';
import { checkDatingActionLimit, resolveEffectiveTier } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const schema = z.object({
  tier: z.enum(['bond', 'soulbound']),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ characterId: string }> }) {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { characterId } = await params;
  if (!characterId) return NextResponse.json({ error: 'Missing characterId' }, { status: 400 });

  // Same rate-limit bucket as dating gifts — this is the same shape of
  // action (spend tokens against a character relationship) and shares its
  // abuse profile.
  const { data: profile } = await supabaseAdmin.from('profiles').select('tier,role,is_admin').eq('id', user.id).single();
  const effectiveTier = resolveEffectiveTier(profile ?? {});
  const rl = await checkDatingActionLimit(user.id, effectiveTier);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' }, { status: 429 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const pricing = await getCharacterPricing(characterId);
  if (!pricing) return NextResponse.json({ error: 'Character not found' }, { status: 404 });

  const result = await purchaseRelationshipTier(user.id, characterId, parsed.data.tier);

  if (!result.success) {
    const status = result.error === 'insufficient_tokens' ? 402
                 : result.error === 'cannot_purchase_own_character' ? 403
                 : result.error === 'character_not_found' ? 404
                 : 500;
    if (status === 500) logger.warn('relationships:upgrade failed', { userId: user.id, characterId, error: result.error });
    return NextResponse.json({
      error: result.error === 'insufficient_tokens' ? 'Insufficient Vantrix Coin' : result.error,
      code: result.error?.toUpperCase(),
    }, { status });
  }

  return NextResponse.json({ tier: result.tier });
}
