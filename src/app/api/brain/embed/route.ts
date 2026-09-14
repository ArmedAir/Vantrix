/**
 * POST /api/brain/embed
 * ─────────────────────────────────────────────────────────────────────────
 * Vercel-native counterpart to services/brain/main.py's POST /embed. Same
 * request/response contract — { texts: string[] }  { embeddings: number[][],
 * model } — so memory-embeddings.ts and character-embeddings.ts (the two
 * actual callers, via embedTexts()) work completely unmodified regardless
 * of which URL BRAIN_SERVICE_URL resolves to (see local-brain.ts's module
 * header, and env.ts's VERCEL_URL auto-default).
 *
 * AUTH: fail-closed — see brain-service-auth.ts's verifyBrainRouteAuth()
 * header comment for why this route rejects by default when
 * BRAIN_SERVICE_API_KEY is unset, unlike main.py's fail-open-if-unset
 * posture (this route lives on the same public domain as the rest of the
 * app; main.py usually sits behind a private network boundary instead).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { localEmbed, MODEL_ID, MAX_CANDIDATES } from '@/lib/ai/local-brain';
import { verifyBrainRouteAuth } from '@/lib/ai/brain-service-auth';
import { toErrorBody } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Generous ceiling for a cold-start model load + a full batch encode.
export const maxDuration = 30;

const requestSchema = z.object({
  // Same count cap as main.py's EmbedRequest (MAX_CANDIDATES) — a bad
  // request shouldn't be able to force an unbounded batch encode either
  // side. PERF: also cap each text's length — callers (memory-embeddings.ts,
  // character-embeddings.ts) already truncate well below this before
  // sending, so this never clips a legitimate request; it just bounds the
  // worst case for anyone else hitting this same warm container (encode
  // time scales with token count, not just candidate count).
  texts: z.array(z.string().max(2000)).min(1).max(MAX_CANDIDATES),
});

export async function POST(req: NextRequest) {
  if (!verifyBrainRouteAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = requestSchema.parse(await req.json().catch(() => ({})));

    const embeddings = await localEmbed(body.texts);
    if (embeddings === null) {
      // Mirrors main.py's 503 on "model not loaded" — Node-side callers'
      // circuit breakers already treat any non-2xx here as "trip and
      // fail open", identical to the Python service being down.
      return NextResponse.json({ error: 'model not loaded' }, { status: 503 });
    }

    return NextResponse.json({ embeddings, model: MODEL_ID });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: err.flatten() },
        { status: 400 },
      );
    }
    logger.error('api/brain/embed failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(toErrorBody(err), { status: 500 });
  }
}
