/**
 * VoiceStudio TTS client — OpenAI-compatible /v1/audio/speech.
 *
 * VoiceStudio (github.com/debpalash/VoiceStudio, formerly OmniVoice-Studio)
 * is a self-hosted, free, local ElevenLabs alternative. It exposes an
 * OpenAI-compatible audio API on whatever host/port the operator's instance
 * is running on (default localhost:3900 for a loopback desktop/Docker
 * install). This module is a thin, dependency-free client for that one
 * endpoint — no OpenAI SDK needed for a single POST.
 *
 * Used as the SECOND-tier fallback in /api/voice/tts/route.ts, after
 * ElevenLabs (primary, when configured) and before the client-only Web
 * Speech Synthesis fallback:
 *
 *   ElevenLabs (paid, premium) → VoiceStudio (self-hosted, free) → Web Speech
 *
 * Wholly optional: if VOICESTUDIO_BASE_URL isn't set, isVoiceStudioConfigured()
 * returns false and the route skips straight past this tier, same as before
 * VoiceStudio existed in this codebase.
 *
 * Auth: VoiceStudio's loopback API needs no key at all. VOICESTUDIO_API_KEY
 * is only relevant if the operator exposed their instance over a network
 * boundary that requires a share PIN / API key (see VoiceStudio's own
 * docs/api-auth.md) — sent as a bearer token when present, omitted otherwise.
 */

import { env } from '@/env';

export function isVoiceStudioConfigured(): boolean {
  return !!env.VOICESTUDIO_BASE_URL;
}

export interface VoiceStudioSpeechParams {
  text: string;
  /** VoiceStudio voice profile id. Falls back to VOICESTUDIO_DEFAULT_VOICE, then 'default'. */
  voice?: string;
  /** mp3 | opus | aac | flac | wav | pcm — see VoiceStudio's /v1/audio/speech docs. */
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  /** Request timeout in ms. VoiceStudio runs on local/self-hosted hardware,
   *  which can be meaningfully slower than a cloud provider — give it more
   *  headroom than the ElevenLabs breaker's 15s. */
  timeoutMs?: number;
}

export class VoiceStudioError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'VoiceStudioError';
  }
}

/**
 * Synthesizes speech via a self-hosted VoiceStudio instance's
 * OpenAI-compatible endpoint. Returns the raw audio buffer + the mime type
 * to store it under, mirroring the shape callers already handle for
 * ElevenLabs (see the R2 upload block in /api/voice/tts/route.ts).
 *
 * Throws VoiceStudioError on any non-2xx response or network failure —
 * callers should wrap this in their own circuit breaker (see
 * VOICESTUDIO_BREAKER_CONFIG in the route) rather than relying on retries
 * here, since a degraded self-hosted instance should fail fast the same way
 * a degraded ElevenLabs does.
 */
export async function synthesizeWithVoiceStudio(
  params: VoiceStudioSpeechParams
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!env.VOICESTUDIO_BASE_URL) {
    throw new VoiceStudioError('VOICESTUDIO_BASE_URL is not configured');
  }

  const responseFormat = params.responseFormat ?? 'mp3';
  const voice = params.voice ?? env.VOICESTUDIO_DEFAULT_VOICE ?? 'default';
  const timeoutMs = params.timeoutMs ?? 20_000;

  const url = new URL('/v1/audio/speech', env.VOICESTUDIO_BASE_URL).toString();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.VOICESTUDIO_API_KEY) {
    headers.Authorization = `Bearer ${env.VOICESTUDIO_API_KEY}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'tts-1',
        input: params.text,
        voice,
        response_format: responseFormat,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new VoiceStudioError(`voicestudio_network_error: ${String(err)}`);
  }

  if (!res.ok) {
    throw new VoiceStudioError(`voicestudio_${res.status}`, res.status);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = MIME_BY_FORMAT[responseFormat];
  return { buffer, mimeType };
}

const MIME_BY_FORMAT: Record<NonNullable<VoiceStudioSpeechParams['responseFormat']>, string> = {
  mp3:  'audio/mpeg',
  opus: 'audio/opus',
  aac:  'audio/aac',
  flac: 'audio/flac',
  wav:  'audio/wav',
  pcm:  'audio/pcm',
};
