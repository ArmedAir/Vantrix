"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Hold-to-record voice MESSAGES for ordinary chat — distinct from
 * use-voice-call.ts's hands-free VAD, which is for a live call. Here
 * there's no latency pressure and no turn-taking loop to automate: the
 * user holds the mic, says their message, releases, and gets the
 * transcript back to review/send like any other message. Reuses the
 * same MediaRecorder approach and the same
 * POST /api/voice/call/transcribe endpoint the call feature uses —
 * that route has no call-specific logic in it (just auth + ElevenLabs
 * Scribe), so there's nothing call-only to duplicate here.
 */

export type VoiceMessageState = "idle" | "recording" | "transcribing";

function getRecordingSupport(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(navigator.mediaDevices) && typeof window.MediaRecorder !== "undefined";
}

function pickMimeType(): string | undefined {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") return undefined;
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (window.MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return undefined;
}

export function useVoiceMessage(onTranscribed: (text: string) => void) {
  const [state, setState] = useState<VoiceMessageState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(getRecordingSupport);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Kept current via ref so a stale closure from an earlier render can't
  // call a callback the caller has since replaced (same pattern as
  // use-voice-call.ts's stopListeningAndSendRef, for the same reason).
  const onTranscribedRef = useRef(onTranscribed);
  onTranscribedRef.current = onTranscribed;

  const startRecording = useCallback(async () => {
    if (!supported || state !== "idle") return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
    } catch {
      setError("Microphone access was denied — check your browser's site permissions.");
    }
  }, [supported, state]);

  const cancelRecording = useCallback(() => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setState("idle");
  }, []);

  const stopAndTranscribe = useCallback(() => {
    const recorder = recorderRef.current;
    const stream = streamRef.current;
    if (!recorder || recorder.state === "inactive") {
      setState("idle");
      return;
    }

    setState("transcribing");
    recorder.onstop = () => {
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];

      // Same accidental-tap floor as the call's VAD min-speech guard —
      // a clip this short is a mis-tap, not a message.
      if (blob.size < 2000) {
        setState("idle");
        return;
      }

      void (async () => {
        try {
          const form = new FormData();
          form.append("audio", blob, "voice-message.webm");
          const res = await fetch("/api/voice/call/transcribe", { method: "POST", body: form });
          const body = await res.json().catch(() => null);
          setState("idle");

          if (!res.ok || !body?.text) {
            if (res.status !== 400) setError("Couldn't hear that — try again.");
            return;
          }
          const text: string = body.text.trim();
          if (text) onTranscribedRef.current(text);
        } catch {
          setState("idle");
          setError("Couldn't reach the server — try again.");
        }
      })();
    };
    recorder.stop();
  }, []);

  return { state, error, supported, startRecording, stopAndTranscribe, cancelRecording };
}
