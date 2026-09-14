/**
 * GET /api/brain/health
 * ─────────────────────────────────────────────────────────────────────────
 * Vercel-native counterpart to services/brain/main.py's GET /health — same
 * semantics, backed by local-brain.ts's transformers.js port instead of
 * the Python sentence-transformers model. See local-brain.ts's module
 * header for why this exists and how it's isolated from every other route.
 *
 * UNAUTHENTICATED, deliberately: same reasoning as main.py's own /health —
 * no sensitive work happens here, and load balancers/uptime monitors/
 * orchestrators need to hit it without a credential. /embed and /rerank
 * (the routes that actually do inference) require auth; this one doesn't.
 *
 * Reports REAL load status, not just "did we start trying": on a cold
 * container, a light embed of a fixed probe string forces (and caches) the
 * model load, so `model_loaded` reflects whether inference actually works
 * right now — the same thing main.py's `_model is None` check tells its
 * own callers. On a warm container that has already confirmed this once,
 * subsequent checks answer from a cached flag instead of re-running that
 * probe on every hit (see local-brain.ts's `isModelReady()`) — this route
 * is polled frequently by uptime monitors/orchestrators, and repeating a
 * real forward pass on every single poll would burn CPU for no new
 * information once the answer is already known.
 */

import { NextResponse } from 'next/server';
import { localEmbed, isModelLoading, isModelReady, MODEL_ID } from '@/lib/ai/local-brain';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Generous ceiling for a cold-start model load (~35MB quantized ONNX
// weights) — same rationale as the sibling /embed and /rerank routes.
export const maxDuration = 30;

export async function GET() {
  // PERF: once this container has already confirmed the model loads (the
  // common case — uptime monitors/orchestrators poll this frequently),
  // answer from the cached flag instead of running a real forward pass on
  // every single check. Only a cold container (or one where load
  // previously failed and hasn't been asked again) pays for the actual
  // probe below.
  if (isModelReady()) {
    return NextResponse.json({ ok: true, model_loaded: true, model: MODEL_ID, engine: 'transformers.js' });
  }

  const wasAlreadyLoading = isModelLoading();

  try {
    const probe = await localEmbed(['health check']);
    const modelLoaded = probe !== null;

    return NextResponse.json(
      modelLoaded
        ? { ok: true, model_loaded: true, model: MODEL_ID, engine: 'transformers.js' }
        : { ok: false, model_loaded: false, wasAlreadyLoading },
      { status: modelLoaded ? 200 : 503 },
    );
  } catch (err) {
    // localEmbed() itself never throws (it catches internally and returns
    // null) — this is a final belt-and-suspenders guard so a truly
    // unexpected error still reports "unhealthy" instead of 500ing the
    // health check itself.
    return NextResponse.json(
      { ok: false, model_loaded: false, error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
