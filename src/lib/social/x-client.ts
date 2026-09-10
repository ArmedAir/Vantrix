// src/lib/social/x-client.ts
// ─────────────────────────────────────────────────────────────────────────────
// X (Twitter) API client — v2 for tweet create/delete/me, v1.1 chunked media
// upload (v2 has no media-upload endpoint of its own; every integration,
// including this one, uploads via v1.1 and then references the resulting
// media_id from the v2 POST /2/tweets call). Every call signs with OAuth 1.0a
// user-context auth (x-oauth.ts) — X requires user context, not just an
// app-only bearer token, to post, delete, or upload on behalf of an account.
//
// Every exported function throws XApiError on failure. The publisher
// pipeline is expected to catch it, persist `.message` / `.isRateLimited`
// onto the social_posts row, and treat 429s as retry-later rather than a
// permanent failure (see `.isRateLimited` / `.retryAfterSeconds`).
// ─────────────────────────────────────────────────────────────────────────────

import { env } from '@/env';
import { logger } from '@/lib/logger';
import { sanitizeProviderError } from '@/lib/security';
import { buildOAuth1Header, getXCredentials, type OAuth1Credentials } from './x-oauth';

const TIMEOUT_MS = 30_000;
const MEDIA_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB — under X's 5 MB per-APPEND-chunk ceiling
const STATUS_POLL_MIN_INTERVAL_MS = 1_000;
const STATUS_POLL_MAX_ATTEMPTS = 30; // ~ceiling on total wait for async (video/gif) processing

export class XApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRateLimited: boolean = false,
    public readonly retryAfterSeconds?: number,
    public readonly xResponse?: unknown,
  ) {
    super(message);
    this.name = 'XApiError';
  }
}

export function isXClientConfigured(): boolean {
  return getXCredentials() !== null;
}

function requireCredentials(): OAuth1Credentials {
  const creds = getXCredentials();
  if (!creds) {
    throw new XApiError(
      'x: credentials not configured (X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET)',
    );
  }
  return creds;
}

/** Reads 429 rate-limit info off a response. X sends either `x-rate-limit-reset` (unix seconds) or `retry-after` (delta seconds), depending on endpoint. */
function rateLimitInfo(res: Response): { isRateLimited: boolean; retryAfterSeconds?: number } {
  if (res.status !== 429) return { isRateLimited: false };

  const header = res.headers.get('x-rate-limit-reset') ?? res.headers.get('retry-after');
  if (!header) return { isRateLimited: true };

  const value = Number(header);
  if (!Number.isFinite(value)) return { isRateLimited: true };

  // x-rate-limit-reset is a unix timestamp; retry-after is already a delta.
  // Anything above ~1e9 can only be a unix timestamp (that threshold is
  // itself a date from 2001), so it's an unambiguous way to tell them apart.
  const retryAfterSeconds =
    value > 1_000_000_000 ? Math.max(0, value - Math.floor(Date.now() / 1000)) : value;

  return { isRateLimited: true, retryAfterSeconds };
}

async function xFetch(url: string, init: RequestInit, operation: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    logger.external('x', operation, Date.now() - start, res.ok);
    return res;
  } catch (err) {
    logger.external('x', operation, Date.now() - start, false, err);
    throw new XApiError(`x: ${operation} request failed: ${sanitizeProviderError(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function parseJson(res: Response): Promise<any> {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

async function throwIfNotOk(res: Response, json: any, operation: string): Promise<void> {
  if (res.ok) return;
  const { isRateLimited, retryAfterSeconds } = rateLimitInfo(res);
  throw new XApiError(
    `x: ${operation} failed (${res.status}): ${sanitizeProviderError(JSON.stringify(json).slice(0, 200))}`,
    res.status,
    isRateLimited,
    retryAfterSeconds,
    json,
  );
}

// ── Tweet create / delete / me (v2, JSON body — OAuth1 base string excludes JSON bodies) ──

export interface PostTweetResult {
  id: string;
  text: string;
}

/** POST /2/tweets. Pass `mediaIds` from `uploadMedia()` to attach an image/gif/video. */
export async function postTweet(text: string, mediaIds?: string[]): Promise<PostTweetResult> {
  const creds = requireCredentials();
  const url = `${env.X_API_BASE_URL.replace(/\/$/, '')}/2/tweets`;
  const body: Record<string, unknown> = { text };
  if (mediaIds && mediaIds.length > 0) {
    body.media = { media_ids: mediaIds };
  }

  const res = await xFetch(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: buildOAuth1Header({ method: 'POST', url, credentials: creds }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    'postTweet',
  );

  const json = await parseJson(res);
  await throwIfNotOk(res, json, 'postTweet');
  return { id: json.data.id, text: json.data.text };
}

/** DELETE /2/tweets/:id. Returns true if X reports the tweet as deleted. */
export async function deleteTweet(tweetId: string): Promise<boolean> {
  const creds = requireCredentials();
  const url = `${env.X_API_BASE_URL.replace(/\/$/, '')}/2/tweets/${encodeURIComponent(tweetId)}`;

  const res = await xFetch(
    url,
    {
      method: 'DELETE',
      headers: { Authorization: buildOAuth1Header({ method: 'DELETE', url, credentials: creds }) },
    },
    'deleteTweet',
  );

  const json = await parseJson(res);
  await throwIfNotOk(res, json, 'deleteTweet');
  return Boolean(json.data?.deleted);
}

export interface XMeResult {
  id: string;
  username: string;
  name: string;
}

/** GET /2/users/me — cheap "are these credentials valid" check, used by the admin connection-test action. */
export async function getMe(): Promise<XMeResult> {
  const creds = requireCredentials();
  const url = `${env.X_API_BASE_URL.replace(/\/$/, '')}/2/users/me`;

  const res = await xFetch(
    url,
    {
      method: 'GET',
      headers: { Authorization: buildOAuth1Header({ method: 'GET', url, credentials: creds }) },
    },
    'getMe',
  );

  const json = await parseJson(res);
  await throwIfNotOk(res, json, 'getMe');
  return { id: json.data.id, username: json.data.username, name: json.data.name };
}

// ── Chunked media upload (v1.1 — v2 has no media endpoint of its own) ────────

type XMediaCategory = 'tweet_image' | 'tweet_gif' | 'tweet_video';

function mediaCategoryFor(mimeType: string): XMediaCategory {
  if (mimeType === 'image/gif') return 'tweet_gif';
  if (mimeType.startsWith('video/')) return 'tweet_video';
  return 'tweet_image';
}

function uploadUrl(): string {
  return `${env.X_UPLOAD_BASE_URL.replace(/\/$/, '')}/1.1/media/upload.json`;
}

async function initUpload(
  creds: OAuth1Credentials,
  totalBytes: number,
  mimeType: string,
): Promise<string> {
  const url = uploadUrl();
  const formParams: Record<string, string> = {
    command: 'INIT',
    total_bytes: String(totalBytes),
    media_type: mimeType,
    media_category: mediaCategoryFor(mimeType),
  };

  const res = await xFetch(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: buildOAuth1Header({ method: 'POST', url, credentials: creds, formParams }),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(formParams).toString(),
    },
    'mediaUpload.init',
  );

  const json = await parseJson(res);
  await throwIfNotOk(res, json, 'mediaUpload.init');
  return String(json.media_id_string);
}

async function appendChunks(
  creds: OAuth1Credentials,
  mediaId: string,
  buffer: Buffer,
): Promise<void> {
  const url = uploadUrl();
  let segmentIndex = 0;

  for (let offset = 0; offset < buffer.length; offset += MEDIA_CHUNK_SIZE) {
    const chunk = buffer.subarray(offset, offset + MEDIA_CHUNK_SIZE);

    // APPEND is multipart/form-data, not x-www-form-urlencoded — per RFC
    // 5849 the signature base string only ever covers the URL + oauth
    // params for a non-form-urlencoded body, so `formParams` is
    // deliberately omitted here (unlike INIT/FINALIZE below).
    const authHeader = buildOAuth1Header({ method: 'POST', url, credentials: creds });

    const form = new FormData();
    form.append('command', 'APPEND');
    form.append('media_id', mediaId);
    form.append('segment_index', String(segmentIndex));
    form.append('media', new Blob([new Uint8Array(chunk)]));

    const res = await xFetch(
      url,
      { method: 'POST', headers: { Authorization: authHeader }, body: form },
      'mediaUpload.append',
    );

    if (!res.ok) {
      const json = await parseJson(res);
      await throwIfNotOk(res, json, `mediaUpload.append[${segmentIndex}]`);
    }
    segmentIndex += 1;
  }
}

async function finalizeUpload(
  creds: OAuth1Credentials,
  mediaId: string,
): Promise<{ processing: boolean }> {
  const url = uploadUrl();
  const formParams: Record<string, string> = { command: 'FINALIZE', media_id: mediaId };

  const res = await xFetch(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: buildOAuth1Header({ method: 'POST', url, credentials: creds, formParams }),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(formParams).toString(),
    },
    'mediaUpload.finalize',
  );

  const json = await parseJson(res);
  await throwIfNotOk(res, json, 'mediaUpload.finalize');
  return { processing: Boolean(json.processing_info) };
}

async function pollStatus(creds: OAuth1Credentials, mediaId: string): Promise<void> {
  const url = uploadUrl();

  for (let attempt = 0; attempt < STATUS_POLL_MAX_ATTEMPTS; attempt++) {
    const queryParams: Record<string, string> = { command: 'STATUS', media_id: mediaId };
    const qs = new URLSearchParams(queryParams).toString();

    const res = await xFetch(
      `${url}?${qs}`,
      {
        method: 'GET',
        headers: {
          Authorization: buildOAuth1Header({ method: 'GET', url, credentials: creds, queryParams }),
        },
      },
      'mediaUpload.status',
    );

    const json = await parseJson(res);
    await throwIfNotOk(res, json, 'mediaUpload.status');

    const state = json.processing_info?.state;
    if (!state || state === 'succeeded') return;
    if (state === 'failed') {
      throw new XApiError(
        `x: media processing failed: ${sanitizeProviderError(JSON.stringify(json.processing_info?.error ?? {}))}`,
        undefined,
        false,
        undefined,
        json,
      );
    }

    const waitMs = Math.max((json.processing_info?.check_after_secs ?? 1) * 1000, STATUS_POLL_MIN_INTERVAL_MS);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw new XApiError(`x: media processing did not complete after ${STATUS_POLL_MAX_ATTEMPTS} status polls`);
}

/**
 * Full v1.1 chunked upload: INIT  APPEND (in MEDIA_CHUNK_SIZE pieces) 
 * FINALIZE  STATUS-poll only if FINALIZE reports async processing_info
 * (images normally finalize synchronously; video/gif go through async
 * processing). Returns the media_id to pass into `postTweet()`'s
 * `mediaIds` param.
 */
export async function uploadMedia(buffer: Buffer, mimeType: string): Promise<string> {
  const creds = requireCredentials();
  const mediaId = await initUpload(creds, buffer.length, mimeType);
  await appendChunks(creds, mediaId, buffer);
  const { processing } = await finalizeUpload(creds, mediaId);
  if (processing) {
    await pollStatus(creds, mediaId);
  }
  return mediaId;
}
