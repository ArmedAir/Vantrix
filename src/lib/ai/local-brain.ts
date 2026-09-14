/**
 * Local Brain — in-process semantic engine for the Vercel-deployable brain
 * routes (src/app/api/brain/{health,embed,rerank}/route.ts).
 * ─────────────────────────────────────────────────────────────────────────
 * services/brain (Python/FastAPI/sentence-transformers/torch) is a
 * persistent container — its own README says plainly "Next.js/Vercel can't
 * run a persistent Python process with a loaded ML model." That's still
 * true. This module doesn't try to run *that* service on Vercel; it
 * reimplements the same operation (embed text with all-MiniLM-L6-v2, rank
 * by cosine similarity) using transformers.js, which runs the model via
 * ONNX Runtime instead of torch — a real Node dependency with prebuilt
 * binaries, not a Python subprocess, so it loads and runs inside a normal
 * Vercel serverless Function.
 *
 * Same model, same output space: transformers.js's default export for this
 * model (Xenova/all-MiniLM-L6-v2 is a standard ONNX conversion of the exact
 * sentence-transformers/all-MiniLM-L6-v2 checkpoint main.py loads) with
 * mean pooling + L2 normalization is the same computation
 * SentenceTransformer(...).encode(texts, normalize_embeddings=True)
 * performs there — 384-dim vectors, cosine similarity == dot product once
 * normalized. That match matters: memory-embeddings.ts / character-
 * embeddings.ts persist these vectors into a fixed vector(384) pgvector
 * column (see 20260902_memory_graph_pgvector.sql /
 * 20260902b_character_pgvector.sql) — whichever engine wrote a given row,
 * a query embedded by either engine lands in the same similarity space.
 *
 * ISOLATION: this module (and the ~35MB quantized ONNX model + onnxruntime-
 * node native binary it pulls in) is imported ONLY by the three route
 * handlers under src/app/api/brain/ — never by semantic-memory.ts,
 * memory-embeddings.ts, character-embeddings.ts, or character-
 * recommender.ts directly. Those still talk to BRAIN_SERVICE_URL over
 * plain HTTP exactly as before (see brain-service-auth.ts) — the only
 * thing that changes is what URL that env var can now point at. That
 * keeps the model and its native binary out of every OTHER function's
 * bundle (chat/stream's cold start in particular must never pay for this —
 * see semantic-memory.ts's own REQUEST_TIMEOUT_MS comment), and keeps this
 * file swappable/removable without touching any caller.
 *
 * FAIL OPEN: every export here returns `null` (never throws) on any
 * load/inference failure. The route handlers turn that into a 503, which
 * callers' existing circuit breakers already treat as "trip and skip" —
 * identical failure contract to the Python service being down.
 */

import { logger } from '@/lib/logger';

// Exported (not just module-local) so the health route can report exactly
// which model answered without redeclaring the string — single source of
// truth for this identifier.
export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIM = 384;

// Mirrors services/brain/main.py's MAX_CANDIDATES — same reasoning (a bad
// request shouldn't be able to force an unbounded batch encode).
export const MAX_CANDIDATES = 100;

type Tensor = { tolist(): number[][] };
type FeatureExtractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<Tensor>;

// Cached across warm invocations of the same Function instance — the model
// is loaded once per cold start, not once per request. Module-scope state
// is the standard/correct place for this in a Node serverless Function
// (same pattern getCircuitBreaker() and other in-memory singletons in this
// codebase already rely on surviving across warm invocations).
let extractorPromise: Promise<FeatureExtractor | null> | null = null;

// PERF: separate from extractorPromise so callers (the health route, in
// particular) can check "did the model load successfully" without paying
// for a real forward pass every time. Set exactly once, right after
// extractorPromise first resolves. true = loaded and confirmed working;
// false = load attempted and failed (extractorPromise is already cached as
// null in that case too, so a retry isn't attempted mid-container-lifetime
// either way); undefined = no attempt made yet on this container.
let modelReady: boolean | undefined;

async function getExtractor(): Promise<FeatureExtractor | null> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      try {
        // Dynamic import, not a static one: keeps this dependency out of
        // any bundle that merely imports this file's *types* re-exported
        // elsewhere, and matches transformers.js's own recommended usage
        // in serverless environments.
        const { pipeline, env: xenovaEnv } = await import('@xenova/transformers');

        // A Lambda's filesystem is read-only except /tmp. transformers.js
        // defaults to caching downloaded model files next to node_modules,
        // which isn't writable here — point it at /tmp instead so the
        // first request in a cold container can actually cache the model
        // for subsequent warm invocations rather than failing or
        // re-downloading every time.
        xenovaEnv.cacheDir = '/tmp/.vantrix-brain-cache';
        xenovaEnv.allowLocalModels = false;

        const extractor = await pipeline('feature-extraction', MODEL_ID, {
          quantized: true, // ~35MB vs ~90MB fp32 — same architecture/weights, quantized for size/speed
        });
        modelReady = true;
        return extractor as unknown as FeatureExtractor;
      } catch (err) {
        modelReady = false;
        logger.warn('local-brain:model-load-failed', { error: String(err) });
        return null;
      }
    })();
  }
  return extractorPromise;
}

/**
 * Embeds a batch of texts. Returns null (never throws) if the model can't
 * be loaded or inference fails — callers must treat that as "unavailable",
 * same as a non-2xx from the Python service.
 */
export async function localEmbed(texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];
  if (texts.length > MAX_CANDIDATES) return null;

  try {
    const extractor = await getExtractor();
    if (!extractor) return null;
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    return output.tolist();
  } catch (err) {
    logger.warn('local-brain:embed-failed', { error: String(err) });
    return null;
  }
}

export interface LocalRankedResult {
  id: string;
  score: number;
}

/**
 * Embeds `query` and every candidate's text in one batch and returns
 * candidates sorted descending by cosine similarity to the query — same
 * contract and math as services/brain/main.py's POST /rerank.
 */
export async function localRerank(
  query: string,
  candidates: { id: string; text: string }[],
): Promise<LocalRankedResult[] | null> {
  if (!candidates.length) return [];
  if (candidates.length > MAX_CANDIDATES) return null;

  const vectors = await localEmbed([query, ...candidates.map((c) => c.text)]);
  if (!vectors) return null;

  const [queryVec, ...candidateVecs] = vectors;
  if (!queryVec) return null;

  return candidates
    .map((c, i) => ({ id: c.id, score: dot(queryVec, candidateVecs[i] ?? []) }))
    .sort((a, b) => b.score - a.score);
}

// Embeddings are L2-normalized (normalize: true above), so cosine
// similarity reduces to a plain dot product — identical shortcut
// main.py's rerank() takes.
function dot(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum;
}

/** Cheap readiness signal for GET /api/brain/health — does not force a model load. */
export function isModelLoading(): boolean {
  return extractorPromise !== null;
}

/**
 * PERF: has the model already been confirmed loaded on this container? Pure
 * memory read, zero inference cost — lets the health route skip re-running
 * a full forward pass on every warm check (uptime monitors/orchestrators
 * typically poll this every 15-60s) once the real answer is already known.
 * undefined until the first getExtractor() attempt resolves on this
 * container (see modelReady above); the caller only needs the true/false
 * cases and treats undefined the same as "not yet confirmed  do a real
 * check."
 */
export function isModelReady(): boolean {
  return modelReady === true;
}
