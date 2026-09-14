/**
 * POST /api/brain/rerank
 * ─────────────────────────────────────────────────────────────────────────
 * Vercel-native counterpart to services/brain/main.py's POST /rerank. Same
 * request/response contract — { query, candidates: [{id, text}] } 
 * { ranked: [{id, score}], model, latency_ms } — so semantic-memory.ts's
 * semanticRerankMemories() and character-recommender.ts's
 * computeRecommendations() work completely unmodified regardless of which
 * URL BRAIN_SERVICE_URL resolves to (see local-brain.ts's module header,
 * and env.ts's VERCEL_URL auto-default).
 *
 * AUTH: fail-closed — see brain-service-auth.ts's verifyBrainRouteAuth()
 * header comment for why this route rejects by default when
 * BRAIN_SERVICE_API_KEY is unset, unlike main.py's fail-open-if-unset
 * posture (this route lives on the same public domain as the rest of the
 * app; main.py usually sits behind a private network boundary instead).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { localRerank, MODEL_ID, MAX_CANDIDATES } from '@/lib/ai/local-brain';
import { verifyBrainRouteAuth } from '@/lib/ai/brain-service-auth';
import { toErrorBody } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Generous ceiling for a cold-start model load + a full batch encode.
export const maxDuration = 30;

const requestSchema = z.object({
  // Same bounds as main.py's RerankRequest, plus a per-candidate text cap
  // main.py doesn't enforce (PERF: encode time scales with token count —
  // callers already truncate to ≤400 chars before sending, so this never
  // clips a real request; it just bounds worst-case latency for anyone
  // else sharing this warm container).
  query: z.string().min(1).max(4000),
  candidates: z
    .array(
      z.object({
        id: z.string().max(200),
        text: z.string().max(2000),
      }),
    )
    .min(1)
    .max(MAX_CANDIDATES),
});

export async function POST(req: NextRequest) {
  if (!verifyBrainRouteAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  try {
    const body = requestSchema.parse(await req.json().catch(() => ({})));

    const ranked = await localRerank(body.query, body.candidates);
    if (ranked === null) {
      // Mirrors main.py's 503 on "model not loaded" — Node-side callers'
      // circuit breakers already treat any non-2xx here as "trip and
      // fail open", identical to the Python service being down.
      return NextResponse.json({ error: 'model not loaded' }, { status: 503 });
    }

    return NextResponse.json({
      ranked,
      model: MODEL_ID,
      latency_ms: Date.now() - start,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: err.flatten() },
        { status: 400 },
      );
    }
    logger.error('api/brain/rerank failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(toErrorBody(err), { status: 500 });
  }
}
