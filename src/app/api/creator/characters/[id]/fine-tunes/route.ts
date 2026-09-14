/**
 * GET/POST /api/creator/characters/[id]/fine-tunes
 *
 * Creator-facing CRUD surface for character_fine_tunes — see
 * lib/commerce/raas.ts's header doc for the feature this backs. Owner-only:
 * a creator manages their own character's specialized personality packs
 * here; buyers only ever see the active one surfaced in-prompt via
 * getActiveFineTune(), never through this route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { listFineTunesForOwner, createFineTune, raasErrorStatus } from '@/lib/commerce/raas';
import { withErrorHandling } from '@/lib/api/with-error-handling';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).default(''),
  tierRequired: z.enum(['bond', 'soulbound']),
  voiceProfileOverrides: z.record(z.string(), z.string()).default({}),
  loraModelId: z.string().trim().max(200).nullable().optional(),
});

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const fineTunes = await listFineTunesForOwner(user.id, id);
  if (fineTunes === null) return NextResponse.json({ error: 'Character not found' }, { status: 404 });

  return NextResponse.json({ fineTunes });
}, 'creator/characters/[id]/fine-tunes:GET');

export const POST = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const raw = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const result = await createFineTune(user.id, id, {
    name: parsed.data.name,
    description: parsed.data.description,
    tierRequired: parsed.data.tierRequired,
    voiceProfileOverrides: parsed.data.voiceProfileOverrides,
    loraModelId: parsed.data.loraModelId ?? null,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: raasErrorStatus(result.error) });
  }

  return NextResponse.json({ fineTune: result.fineTune }, { status: 201 });
}, 'creator/characters/[id]/fine-tunes:POST');
