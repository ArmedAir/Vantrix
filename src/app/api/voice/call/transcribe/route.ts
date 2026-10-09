/**
 * POST /api/voice/call/transcribe — turns one push-to-talk recording into
 * text via ElevenLabs Scribe (POST https://api.elevenlabs.io/v1/speech-to-text).
 *
 * STT-PLATFORM-FIX: the call feature originally used the browser's
 * built-in SpeechRecognition (webkitSpeechRecognition) client-side — it
 * has NO support at all on iOS Safari or any iOS WebView (confirmed
 * against WebKit's own bug tracker and current caniuse data: "WebView on
 * iOS: No support", and even in-Safari it's disabled inside
 * SFSafariViewController / home-screen web-app contexts). That silently
 * broke the entire call feature for every iOS user — the mic would
 * "listen" and simply never produce a transcript, which is exactly what
 * "the character doesn't react" looks like from the outside. This route
 * replaces it with real server-side transcription; the client now
 * records audio with MediaRecorder (broadly supported, including iOS
 * Safari/WebView) and uploads the clip here instead of relying on
 * in-browser recognition.
 *
 * VENDOR CHOICE: not Groq. groq-brain.ts's own doc is explicit that data
 * sent to Groq "must carry only pseudonymous taste signals and public
 * catalog metadata... never chat text" — a call transcript is exactly
 * the chat text that policy exists to keep off that vendor. ElevenLabs
 * is already trusted with this app's audio (every TTS reply already
 * goes through them — see /api/voice/tts), so routing the other half of
 * the same call's audio through the same already-trusted vendor doesn't
 * open any new vendor-trust question.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { env }           from '@/env';
import { logger }        from '@/lib/logger';

export const dynamic = 'force-dynamic';

// A single push-to-talk clip, not a long recording — generous enough for
// a genuinely long turn (several minutes at typical compressed bitrates)
// without leaving the door open to an arbitrarily large upload.
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

  const elevenLabsKey = env.ELEVENLABS_API_KEY;
  if (!elevenLabsKey || elevenLabsKey === 'placeholder-elevenlabs-key') {
    logger.error('voice/call/transcribe: ELEVENLABS_API_KEY missing');
    return NextResponse.json({ error: 'Voice transcription is not configured' }, { status: 503 });
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Recording too long' }, { status: 413 });
  }

  const incoming = await req.formData().catch(() => null);
  const audioFile = incoming?.get('audio');
  if (!audioFile || !(audioFile instanceof Blob) || audioFile.size === 0) {
    return NextResponse.json({ error: 'No audio received', code: 'VALIDATION_ERROR' }, { status: 400 });
  }
  if (audioFile.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Recording too long' }, { status: 413 });
  }

  try {
    const upstream = new FormData();
    // Scribe v1 — this is a single short push-to-talk clip, not a
    // specialized-vocabulary transcript that would justify v2's extra
    // keyterm-prompting cost/latency (see this app's own TTS route for
    // the same "pick the simpler model unless the use case needs more"
    // reasoning, there applied to eleven_multilingual_v2 vs. Turbo).
    upstream.append('model_id', 'scribe_v1');
    upstream.append('file', audioFile, 'call-clip.webm');

    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method:  'POST',
      headers: { 'xi-api-key': elevenLabsKey },
      body:    upstream,
      signal:  AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error('voice/call/transcribe: elevenlabs error', { status: res.status, body: body.slice(0, 300) });
      return NextResponse.json({ error: 'Could not transcribe audio' }, { status: 502 });
    }

    const data = await res.json() as { text?: string };
    const text = (data.text ?? '').trim();
    return NextResponse.json({ text });
  } catch (err) {
    logger.error('voice/call/transcribe: unexpected error', {
      userId: user.id, error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Could not transcribe audio' }, { status: 500 });
  }
}
