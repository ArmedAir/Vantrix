/**
 * GET /api/auth/x/login
 *
 * Entry point for "Sign in with X" — generates a PKCE pair + anti-CSRF
 * state, stashes both in short-lived httpOnly cookies (read back by
 * /api/auth/x/callback), and redirects the browser to X's authorize page.
 *
 * No session/auth required to hit this route by design — same posture as
 * /api/auth/login-guard, this runs before any sign-in has happened.
 * Already covered by middleware.ts's existing /api/auth/* rate limit.
 */
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  getXSignInCredentials,
  generatePkcePair,
  generateOAuthState,
  buildAuthorizeUrl,
} from '@/lib/auth/x-sign-in';

export const dynamic = 'force-dynamic';

// Matches the SEC-01 open-redirect guard used by /auth/callback and
// login/page.tsx: only a same-origin path starting with a single "/" is
// ever honored.
function sanitizeRedirect(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}

const STATE_COOKIE_MAX_AGE_S = 600; // 10 minutes — comfortably longer than any real authorize-page dwell time

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(req.url);
  const next = sanitizeRedirect(searchParams.get('next'));

  const creds = getXSignInCredentials();
  if (!creds) {
    logger.warn('auth.x.login.not_configured');
    return NextResponse.redirect(`${origin}/login?error=x_sign_in_unavailable`);
  }

  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = generateOAuthState();
  const authorizeUrl = buildAuthorizeUrl(creds, state, codeChallenge);

  const res = NextResponse.redirect(authorizeUrl);
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const, // must survive the top-level cross-site redirect back from x.com
    path: '/',
    maxAge: STATE_COOKIE_MAX_AGE_S,
  };
  res.cookies.set('x_oauth_state', state, cookieOpts);
  res.cookies.set('x_oauth_verifier', codeVerifier, cookieOpts);
  res.cookies.set('x_oauth_next', next, cookieOpts);

  return res;
}
