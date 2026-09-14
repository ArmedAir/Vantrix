/**
 * GET/PATCH /api/creator/characters/[id]/raas-pricing
 *
 * Lets a creator see and edit their own character's RaaS pricing
 * (characters.raas_pricing.bond/soulbound — see lib/commerce/raas.ts's
 * getCharacterPricing()/updateCharacterPricing()). Revenue share
 * (creator_revenue_share_pct) is platform-set, not creator-editable —
 * same posture as the 70% default in 20260910_raas_unification.sql;
 * returned here for display only, never accepted on PATCH.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { updateCharacterPricing, raasErrorStatus } from '@/lib/commerce/raas';
import { withErrorHandling } from '@/lib/api/with-error-handling';

export const dynamic = 'force-dynamic';

const schema = z.object({
  bond: z.number().int().min(50).max(50000).optional(),
  soulbound: z.number().int().min(50).max(50000).optional(),
}).refine((v) => v.bond !== undefined || v.soulbound !== undefined, {
  message: 'At least one of bond or soulbound is required',
});

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('creator_id, raas_pricing, creator_revenue_share_pct')
    .eq('id', id)
    .single();

  if (!character || character.creator_id !== user.id) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 });
  }

  const pricing = character.raas_pricing as { bond?: number; soulbound?: number } | null;
  return NextResponse.json({
    bond: pricing?.bond ?? 500,
    soulbound: pricing?.soulbound ?? 1500,
    creatorRevenueSharePct: character.creator_revenue_share_pct ?? 70,
  });
}, 'creator/characters/[id]/raas-pricing:GET');

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const result = await updateCharacterPricing(user.id, id, parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: raasErrorStatus(result.error) });
  }

  return NextResponse.json({ ok: true });
}, 'creator/characters/[id]/raas-pricing:PATCH');
