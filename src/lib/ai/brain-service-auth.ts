/**
 * Shared auth helpers for calls to the brain (semantic embedding/rerank)
 * service — both the original Python sidecar (services/brain) and its
 * Vercel-native equivalent (src/app/api/brain/*, see local-brain.ts).
 *
 * AUTH-FIX: services/brain/main.py previously accepted requests to /embed
 * and /rerank with no credential at all — anyone who could reach
 * BRAIN_SERVICE_URL could send arbitrary batches and consume CPU. The
 * service now checks a Bearer token against BRAIN_SERVICE_API_KEY when
 * that env var is set (see services/brain/main.py's _require_auth). This
 * file's `brainServiceAuthHeaders()` builds the matching header on the
 * Node side so every caller (semantic-memory.ts, character-recommender.ts,
 * memory-embeddings.ts, character-embeddings.ts) sends it consistently
 * instead of each reimplementing the same `if` check.
 *
 * If BRAIN_SERVICE_API_KEY isn't set, this returns an empty object and
 * requests go out unauthenticated — identical to pre-fix behavior, for
 * deployments where the service is only reachable inside a private
 * network/VPC and the extra credential isn't needed.
 *
 * VERCEL-BRAIN: `verifyBrainRouteAuth()` is the server-side counterpart,
 * used by the route handlers under src/app/api/brain/. Those routes are a
 * meaningfully
 * different risk than the Python service: main.py usually sits on a
 * private Docker/VPC network with no public ingress at all, so an unset
 * key there is "trust the network boundary instead." The Next.js routes
 * live on the SAME public domain as the rest of the app — there's no
 * private-network equivalent to fall back on — so this defaults to
 * fail-closed instead of fail-open: unset BRAIN_SERVICE_API_KEY means
 * every request is rejected, not "auth skipped." The one override is
 * BRAIN_SERVICE_DEV_MODE=true (see local dev docs in services/brain/
 * README.md) — same escape hatch main.py offers, same "never in a
 * deployed environment" warning applies here too.
 */

import type { NextRequest } from 'next/server';
import { env } from '@/env';
import { timingSafeEqual } from '@/lib/security';

export function brainServiceAuthHeaders(): Record<string, string> {
  const key = env.BRAIN_SERVICE_API_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/**
 * Verifies the Authorization header on an inbound request to one of this
 * app's own /api/brain/* routes. Returns true iff the request may proceed.
 *
 *   - BRAIN_SERVICE_API_KEY set  →  header must be exactly `Bearer <key>`
 *     (constant-time compare — see timingSafeEqual's own header for why a
 *     plain `===` on a secret comparison is a timing side-channel).
 *   - BRAIN_SERVICE_API_KEY unset AND BRAIN_SERVICE_DEV_MODE='true'  →
 *     allowed (explicit local-dev opt-in only).
 *   - BRAIN_SERVICE_API_KEY unset, dev mode not set  →  rejected. This is
 *     the fail-closed default described above.
 */
export function verifyBrainRouteAuth(req: NextRequest): boolean {
  const key = env.BRAIN_SERVICE_API_KEY;
  const devMode = env.BRAIN_SERVICE_DEV_MODE === 'true';

  if (!key) return devMode;

  const header = req.headers.get('authorization') ?? '';
  return timingSafeEqual(header, `Bearer ${key}`);
}
