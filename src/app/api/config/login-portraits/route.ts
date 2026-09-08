/**
 * GET /api/config/login-portraits
 *
 * Public, unauthenticated read of the /login page's portrait collage.
 * Backed by app_config (key: 'login_portraits') so admins can change which
 * character images appear there without a code deploy — see
 * /admin/login-portraits and its API actions in /api/admin/route.ts.
 *
 * The login page itself now reads getLoginPortraits() directly (server
 * component, no HTTP round trip — see src/lib/config/login-portraits.ts's
 * header for why) — this route stays as the public read for any
 * client-side consumer, kept in sync with the page by sharing the same
 * loader/validation instead of duplicating it.
 *
 * Falls back to the original hardcoded set if the config row is missing,
 * empty, or malformed, so a bad admin edit can never blank the login page.
 */
import { NextResponse } from 'next/server';
import { getLoginPortraits } from '@/lib/config/login-portraits';

/**
 * CACHE-FIX: was `force-dynamic` with zero Cache-Control, so every call
 * (this route + the login page's own direct getLoginPortraits() call —
 * see that file's header) round-tripped app_config fresh, for content
 * that's identical for every visitor and only ever changes via an admin
 * edit. Public/shared cache is safe here specifically because this
 * response has no per-user variance at all (no auth check above, config
 * table is the same for everyone) — unlike the NSFW-gated character
 * endpoints elsewhere in this codebase, which stay `private` on purpose.
 * 60s matches the admin-edit-to-live-page latency this page can tolerate;
 * stale-while-revalidate keeps a cache miss from ever blocking on a fresh
 * DB read.
 */
export const revalidate = 60;

export async function GET() {
  const portraits = await getLoginPortraits();
  return NextResponse.json(
    { portraits },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
  );
}
