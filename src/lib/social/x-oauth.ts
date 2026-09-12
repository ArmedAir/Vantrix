// src/lib/social/x-oauth.ts
// ─────────────────────────────────────────────────────────────────────────────
// OAuth 1.0a request signing (RFC 5849) for the X (Twitter) API. Hand-rolled
// against the RFC rather than pulling in a package — X still requires OAuth
// 1.0a user-context auth (not just the v2 OAuth2 bearer token) for anything
// that posts, deletes, or uploads on behalf of an account, and there's no
// first-party SDK already in this repo's dependency tree.
//
// Used by x-client.ts for every signed request (tweet create/delete, me, and
// each step of the v1.1 chunked media upload). Nothing in here makes network
// calls itself — this module only builds the `Authorization: OAuth ...`
// header value; x-client.ts owns the actual fetch() calls.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, randomBytes } from 'crypto';
import { env } from '@/env';

export interface OAuth1Credentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

/**
 * Reads OAuth 1.0a credentials from env. Returns null (not a throw) when any
 * piece is missing, so callers can treat "not configured" as a normal,
 * checkable state — same no-op-if-unset contract as the rest of the X_*
 * vars in src/env.ts.
 */
export function getXCredentials(): OAuth1Credentials | null {
  if (!env.X_API_KEY || !env.X_API_SECRET || !env.X_ACCESS_TOKEN || !env.X_ACCESS_TOKEN_SECRET) {
    return null;
  }
  return {
    consumerKey: env.X_API_KEY,
    consumerSecret: env.X_API_SECRET,
    accessToken: env.X_ACCESS_TOKEN,
    accessTokenSecret: env.X_ACCESS_TOKEN_SECRET,
  };
}

/**
 * RFC 3986 percent-encoding (RFC 5849 §3.6), which is stricter than
 * `encodeURIComponent`: `! * ' ( )` must also be escaped, and unreserved
 * characters (`A-Z a-z 0-9 - _ . ~`) must NOT be. `encodeURIComponent`
 * already leaves unreserved chars alone but also leaves `! * ' ( )`
 * unescaped, so those five need a manual second pass.
 */
function percentEncode(input: string): string {
  return encodeURIComponent(input).replace(
    /[!*'()]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/**
 * Builds the RFC 5849 §3.4.1 signature base string from every parameter
 * that participates in signing (oauth_* params, plus query params, plus —
 * only for x-www-form-urlencoded request bodies — the body params). Multipart
 * bodies (used by media APPEND) and JSON bodies (used by every v2 endpoint)
 * are NEVER included here; callers must not pass form params for those.
 */
function buildSignatureBaseString(
  method: string,
  url: string,
  allParams: Record<string, string>,
): string {
  const normalizedParams = Object.keys(allParams)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(allParams[key])}`)
    .join('&');

  return [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(normalizedParams),
  ].join('&');
}

export interface OAuth1SignParams {
  method: string;
  /** Base URL with NO query string — query params go in `queryParams`, not baked into this. */
  url: string;
  credentials: OAuth1Credentials;
  /** Query string params, if any — included in the signature base string per RFC 5849. */
  queryParams?: Record<string, string>;
  /**
   * Body params — ONLY pass these for an actual application/x-www-form-urlencoded
   * request body (e.g. media INIT/FINALIZE). Never pass JSON body fields or
   * multipart fields here; RFC 5849 only signs form-urlencoded bodies, and
   * signing a JSON/multipart body's fields produces a signature the API will
   * reject as invalid.
   */
  formParams?: Record<string, string>;
}

/** Builds a complete `Authorization: OAuth ...` header value for one signed request. */
export function buildOAuth1Header({
  method,
  url,
  credentials,
  queryParams = {},
  formParams = {},
}: OAuth1SignParams): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: '1.0',
  };

  const baseString = buildSignatureBaseString(method, url, {
    ...queryParams,
    ...formParams,
    ...oauthParams,
  });

  const signingKey = `${percentEncode(credentials.consumerSecret)}&${percentEncode(credentials.accessTokenSecret)}`;
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };

  const header = Object.keys(headerParams)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(headerParams[key])}"`)
    .join(', ');

  return `OAuth ${header}`;
}
