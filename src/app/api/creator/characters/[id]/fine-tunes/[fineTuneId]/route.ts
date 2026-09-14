/**
 * PATCH/DELETE /api/creator/characters/[id]/fine-tunes/[fineTuneId]
 *
 * Per-pack half of the fine-tune CRUD surface — the collection route one
 * level up (fine-tunes/route.ts) only lists and creates. Backs
 * raas-studio.ts's updateFineTune()/deleteFineTune(), which fine-tune-
 * manager.tsx uses for editing a pack, toggling its active tier, and
 * removing it. Owner-scoped via lib/commerce/raas.ts's updateFineTune/
 * deleteFineTune, which re-check character + fine-tune ownership
 * themselves rather than trusting the caller — same posture as every
 * other creator RaaS route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { updateFineTune, deleteFineTune, raasErrorStatus } from '@/lib/commerce/raas';
import { withErrorHandling } from '@/lib/api/with-error-handling';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(1000).optional(),
  tierRequired: z.enum(['bond', 'soulbound']).optional(),
  voiceProfileOverrides: z.record(z.string(), z.string()).optional(),
  loraModelId: z.string().trim().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fineTuneId: string }> },
) => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, fineTuneId } = await params;
  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const result = await updateFineTune(user.id, id, fineTuneId, parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: raasErrorStatus(result.error) });
  }

  return NextResponse.json({ ok: true });
}, 'creator/characters/[id]/fine-tunes/[fineTuneId]:PATCH');

export const DELETE = withErrorHandling(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fineTuneId: string }> },
) => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, fineTuneId } = await params;
  const result = await deleteFineTune(user.id, id, fineTuneId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: raasErrorStatus(result.error) });
  }

  return NextResponse.json({ ok: true });
}, 'creator/characters/[id]/fine-tunes/[fineTuneId]:DELETE');
