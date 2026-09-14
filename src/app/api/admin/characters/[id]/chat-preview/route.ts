/**
 * POST /api/admin/characters/[id]/chat-preview — admin-only test chat
 *
 * CHARACTER-CHAT-PREVIEW FIX: the moderation queue (see ../route.ts and
 * character-moderation-card.tsx) let staff approve or reject a character
 * from its name/age/gender/photo/description alone — the actual persona
 * fields that drive what the character *says* in chat (backstory,
 * archetype, personality sliders, goals, fears, flaws, dreams) were
 * neither shown nor testable before the approve/reject decision. Staff
 * were signing off on how a character chats without ever seeing it chat.
 *
 * This route lets an admin hold a short, ephemeral conversation with a
 * pending (or any) character before deciding. It intentionally does NOT
 * go through the full production chat pipeline (/api/chat/stream) —
 * that route is 2000+ lines of memory/billing/crisis/relationship-engine
 * wiring meant for a real, persisted user conversation. None of that
 * applies here: nothing is saved, no tokens are billed to any user
 * (orchestrator.finish() — the billing step — is deliberately never
 * called), and there is no conversation row. It calls the same
 * orchestrator.infer()/routeCompletion() the real pipeline uses for the
 * actual model call, just with a locally-built system prompt and a
 * throwaway context, so the reply quality/model is representative
 * without carrying any of the persisted-conversation side effects.
 *
 * Nothing here is persisted — every request is stateless; the client
 * resends the whole preview transcript each turn (see
 * character-chat-preview.tsx).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { requireAdmin } from '@/lib/auth/admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { toErrorBody, errorLogFields } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { createTracer } from '@/lib/tracing';
import { orchestrator, type OrchestratorContext, type OrchestratorMessage } from '@/lib/ai/orchestrator';

export const dynamic = 'force-dynamic';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(4000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
});

/** Builds a good-enough persona prompt straight from the row's own
 * fields — not byte-identical to the production system prompt (that
 * lives deep inside chat/stream's own pipeline and pulls in memory/
 * relationship state that doesn't exist for a preview chat), but built
 * from the same source-of-truth columns, so what staff see here is
 * representative of what actually drives the character in real chat. */
function buildPreviewSystemPrompt(character: {
  name: string;
  age: number;
  gender: string;
  description: string;
  backstory: string | null;
  archetype: string | null;
  attachment_style: string | null;
  current_goal: string | null;
  childhood_bg: string | null;
  family_bg: string | null;
  dreams: string[] | null;
  fears: string[] | null;
  flaws: string[] | null;
  char_warmth: number;
  char_openness: number;
  char_depth: number;
  char_adventure: number;
}): string {
  const lines = [
    `You are ${character.name}, a ${character.age}-year-old ${character.gender} character on a companion chat app.`,
    character.description,
    character.archetype ? `Archetype: ${character.archetype}.` : null,
    character.backstory ? `Backstory: ${character.backstory}` : null,
    character.childhood_bg ? `Childhood: ${character.childhood_bg}` : null,
    character.family_bg ? `Family: ${character.family_bg}` : null,
    character.current_goal ? `Current goal: ${character.current_goal}` : null,
    character.dreams?.length ? `Dreams: ${character.dreams.join(', ')}.` : null,
    character.fears?.length ? `Fears: ${character.fears.join(', ')}.` : null,
    character.flaws?.length ? `Flaws: ${character.flaws.join(', ')}.` : null,
    character.attachment_style ? `Attachment style: ${character.attachment_style}.` : null,
    `Personality sliders (0-10) — warmth: ${character.char_warmth}, openness: ${character.char_openness}, depth: ${character.char_depth}, adventure: ${character.char_adventure}. Let these visibly shape your tone.`,
    'Stay fully in character. Reply as this person would in a real chat — first person, conversational, not narration.',
  ].filter(Boolean);

  return lines.join('\n');
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const idCheck = z.string().uuid().safeParse(params.id);
    if (!idCheck.success) {
      return NextResponse.json({ error: 'Invalid character id', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data: character, error } = await supabaseAdmin
      .from('characters')
      .select(
        'id,name,age,gender,description,backstory,archetype,attachment_style,current_goal,childhood_bg,family_bg,dreams,fears,flaws,char_warmth,char_openness,char_depth,char_adventure'
      )
      .eq('id', params.id)
      .maybeSingle();

    if (error) throw error;
    if (!character) {
      return NextResponse.json({ error: 'Character not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const systemPrompt = buildPreviewSystemPrompt(character);
    const messages: OrchestratorMessage[] = [
      { role: 'system', content: systemPrompt },
      ...parsed.data.messages,
    ];

    const traceId = crypto.randomUUID();
    const tracer = createTracer(traceId, { userId: user.id, characterId: character.id, kind: 'admin-chat-preview' });

    // Built directly rather than via orchestrator.prepare() — prepare()
    // exists to compute a real user's spending-cap/adaptive-quota token
    // budget, neither of which applies to a staff-only, unbilled preview
    // call. A fixed generous budget is enough for a representative reply.
    const ctx: OrchestratorContext = {
      userId: user.id,
      tier: 'premium',
      characterId: character.id,
      traceId,
      tracer,
      tokenBudget: 500,
      multiplier: 1,
      throttled: false,
      currentUsage: 0,
      dailyLimit: Number.MAX_SAFE_INTEGER,
      startedAt: Date.now(),
      modelTier: 'SMART',
    };

    const result = await orchestrator.infer(ctx, messages);
    // Deliberately no orchestrator.finish() call — see docstring above:
    // this is a staff preview, not a billable user message.

    return NextResponse.json({ reply: result.reply, model: result.model });
  } catch (err) {
    logger.error('Admin character chat-preview error', errorLogFields(err));
    const status = err instanceof Error && 'statusCode' in err ? (err as { statusCode: number }).statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
