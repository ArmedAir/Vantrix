/**
 * "Sign in with X" — OAuth2 Authorization Code + PKCE.
 * ─────────────────────────────────────────────────────────────────────────
 * Deliberately a separate module from lib/social/x-oauth.ts, which signs
 * requests with OAuth 1.0a user-context credentials for ONE fixed company
 * account (character cross-posting). This module authenticates an
 * arbitrary VISITOR against THEIR OWN X account — different grant type
 * (OAuth2 Authorization Code + PKCE, not OAuth 1.0a request signing),
 * different credential shape (a confidential client_id/secret registered
 * once in the X Developer Portal, not a fixed user access token), and a
 * completely different purpose. Nothing in here touches X_API_KEY/
 * X_ACCESS_TOKEN or vice versa.
 *
 * Flow (see the two route handlers under src/app/api/auth/x/):
 *   1. GET /api/auth/x/login    — buildAuthorizeUrl() + cookies, redirect to X
 *   2. GET /api/auth/x/callback — exchangeCodeForToken() + fetchXUser(),
 *      then map the X identity onto a Supabase auth user (see that route).
 *
 * No package pulled in for this — it's ~4 fetch calls and a PKCE
 * challenge, the same call this repo already made for the OAuth 1.0a
 * signer (hand-roll against the RFC rather than add a dependency for
 * something this small).
 */

import { createHash, randomBytes } from 'crypto';
import { env } from '@/env';

export interface XOAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Reads OAuth2 sign-in credentials from env. Returns null (not a throw)
 * when unset, so the route handlers can treat "not configured" as a
 * normal, checkable 503 rather than a startup failure — same contract as
 * lib/social/x-oauth.ts's getXCredentials().
 */
export function getXSignInCredentials(): XOAuthCredentials | null {
  if (!env.X_OAUTH_CLIENT_ID || !env.X_OAUTH_CLIENT_SECRET) return null;
  return {
    clientId: env.X_OAUTH_CLIENT_ID,
    clientSecret: env.X_OAUTH_CLIENT_SECRET,
    redirectUri: env.X_OAUTH_REDIRECT_URI,
  };
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string; // S256(codeVerifier), base64url — never the verifier itself
}

/** RFC 7636 — 43-128 char unreserved-charset verifier; base64url(32 random bytes) comfortably fits that. */
export function generatePkcePair(): PkcePair {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export function generateOAuthState(): string {
  return base64url(randomBytes(16));
}

const SCOPES = ['tweet.read', 'users.read'].join(' ');

/** Builds the browser-redirect URL to X's authorize page. Does not make a network call. */
export function buildAuthorizeUrl(creds: XOAuthCredentials, state: string, codeChallenge: string): string {
  const url = new URL(env.X_OAUTH_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', creds.clientId);
  url.searchParams.set('redirect_uri', creds.redirectUri);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export interface XTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope: string;
}

/**
 * Exchanges an authorization code for an access token. X's OAuth2 token
 * endpoint requires HTTP Basic auth (client_id:client_secret) for a
 * confidential client — this is a real, registered app secret, not a
 * public-client PKCE-only exchange, even though PKCE is also used
 * alongside it (X requires both for this app type).
 */
export async function exchangeCodeForToken(
  creds: XOAuthCredentials,
  code: string,
  codeVerifier: string,
): Promise<XTokenResponse> {
  const tokenUrl = env.X_OAUTH_TOKEN_URL ?? `${env.X_API_BASE_URL.replace(/\/$/, '')}/2/oauth2/token`;
  const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: creds.redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`x-sign-in:token exchange failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    scope: json.scope,
  };
}

export interface XUserProfile {
  id: string;
  username: string;
  name: string;
  profileImageUrl: string | null;
}

/** GET /2/users/me with the visitor's own bearer token (not the app's OAuth1.0a posting creds). */
export async function fetchXUser(accessToken: string): Promise<XUserProfile> {
  const url = `${env.X_API_BASE_URL.replace(/\/$/, '')}/2/users/me?user.fields=profile_image_url,username,name`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`x-sign-in:users/me failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    data: { id: string; username: string; name: string; profile_image_url?: string };
  };

  return {
    id: json.data.id,
    username: json.data.username,
    name: json.data.name,
    // X serves this at the "_normal" (48x48) size by default — swap to a
    // larger crop so it isn't blurry as a full-size profile avatar.
    profileImageUrl: json.data.profile_image_url
      ? json.data.profile_image_url.replace('_normal', '_400x400')
      : null,
  };
}

/** Synthetic email for an X-only account — no real email is ever collected via this flow. */
export function syntheticXEmail(xUserId: string): string {
  return `x_${xUserId}@users.vantrix.ink`;
}
