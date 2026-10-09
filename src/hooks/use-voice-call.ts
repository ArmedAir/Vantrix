"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useVoicePlayback } from "@/hooks/use-voice-playback";

/**
 * Orchestrates a voice call with a character by composing pieces that
 * already exist, left untouched:
 *
 *   1. Speech-to-text — MediaRecorder captures a push-to-talk clip
 *      (hold to speak, release to send), uploaded to
 *      POST /api/voice/call/transcribe, which forwards it to
 *      ElevenLabs Scribe server-side. NOT the browser's built-in
 *      SpeechRecognition — see transcribe/route.ts's own STT-PLATFORM-
 *      FIX doc: that API has zero support on iOS Safari/WebView, which
 *      silently broke the call for every iOS user (the mic would
 *      "listen" and never produce a transcript — exactly "the character
 *      doesn't react"). MediaRecorder + getUserMedia work broadly,
 *      iOS included.
 *   2. The reply — useChatStream, the SAME hook and SAME
 *      /api/chat/stream endpoint ordinary text chat uses, with the same
 *      conversationId. This is the whole reason a character on a call
 *      sounds like itself and not generic: it IS the same personality/
 *      memory/continuity/Voice-Discipline/Continuity-Discipline pipeline
 *      text chat already gets, nothing reimplemented or approximated
 *      for calls specifically.
 *   3. Speech playback — useVoicePlayback, the SAME hook and SAME
 *      /api/voice/tts endpoint message bubbles already use for the
 *      speaker-icon playback, so the same per-character ElevenLabs
 *      voice (characters.elevenlabs_voice_id) is what speaks on a call.
 *
 * PUSH-TO-TALK, NOT ALWAYS-ON DUPLEX: a continuously-listening mic would
 * pick up the character's own TTS audio as it plays (no echo
 * cancellation in this pipeline — that needs real WebRTC infrastructure,
 * which this does not attempt to build). Push-to-talk sidesteps the
 * whole echo problem by construction: the mic is only ever recording
 * while TTS playback is stopped. A full-duplex, interrupt-capable call
 * (closer to ElevenLabs' own Conversational AI agent product) is a
 * larger, separate follow-up, not this.
 *
 * USAGE BILLING: ticks a POST /api/voice/call/usage call every
 * USAGE_TICK_MS while `callActive` is true, plus once more on explicit
 * end with whatever partial tick remains — see that route's own doc on
 * why ticking beats a single end-of-call report.
 */

const USAGE_TICK_MS = 20_000;

export type CallState = "idle" | "listening" | "transcribing" | "thinking" | "speaking" | "ended";

interface UseVoiceCallOptions {
  conversationId: string;
  characterId: string;
  onInsufficientBalance?: () => void;
}

function getSttSupport(): boolean {
  if (typeof window === "undefined") return false;
  // navigator.mediaDevices itself (not just .getUserMedia, which the DOM
  // types declare as always-present on the MediaDevices interface) is
  // what's actually missing in a non-secure context or an older WebView
  // — checking the parent object is the real feature-detection here.
  return Boolean(navigator.mediaDevices) && typeof window.MediaRecorder !== "undefined";
}

// Picked in preference order — not every browser's MediaRecorder
// supports every container; Chrome/Firefox take webm/opus, Safari
// (desktop and iOS) only takes mp4. Falls through to the browser's
// default (undefined mimeType) if neither is supported, rather than
// throwing — ElevenLabs Scribe accepts a broad range of containers, so
// an unlisted-but-supported type still works.
function pickRecorderMimeType(): string | undefined {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") return undefined;
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (window.MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return undefined;
}

export function useVoiceCall({ conversationId, characterId, onInsufficientBalance }: UseVoiceCallOptions) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState("");
  const [sttSupported] = useState(getSttSupport);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const mediaStreamRef  = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const callActiveRef  = useRef(false);
  const unbilledSecondsRef = useRef(0);
  const tickTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { sendMessage, onDoneRef } = useChatStreamForCall(conversationId, characterId);
  const { play, playingId } = useVoicePlayback();
  const speakingMessageIdRef = useRef<string | null>(null);

  const reportUsage = useCallback(async (seconds: number) => {
    if (seconds <= 0) return;
    try {
      const res = await fetch("/api/voice/call/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds }),
      });
      const body = await res.json().catch(() => null);
      if (body?.insufficientTokens) {
        onInsufficientBalance?.();
      }
    } catch {
      // Fail open client-side too — a billing-tick network hiccup
      // shouldn't drop an otherwise-fine call. Unbilled seconds are
      // simply folded into the next tick's report.
      unbilledSecondsRef.current += seconds;
    }
  }, [onInsufficientBalance]);

  const stopMediaStream = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  const endCall = useCallback(() => {
    callActiveRef.current = false;
    stopMediaStream();
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    if (unbilledSecondsRef.current > 0) {
      void reportUsage(unbilledSecondsRef.current);
      unbilledSecondsRef.current = 0;
    }
    setCallState("ended");
  }, [reportUsage, stopMediaStream]);

  const startCall = useCallback(() => {
    callActiveRef.current = true;
    setCallState("idle");
    setElapsedSeconds(0);
    unbilledSecondsRef.current = 0;

    elapsedTimerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    tickTimerRef.current = setInterval(() => {
      if (unbilledSecondsRef.current > 0) {
        const toReport = unbilledSecondsRef.current;
        unbilledSecondsRef.current = 0;
        void reportUsage(toReport);
      }
    }, USAGE_TICK_MS);
  }, [reportUsage]);

  // Every elapsed second of an active call is billable — tracked
  // separately from the UI's display timer so a paused/not-yet-ticked
  // amount is never lost, only reported on whatever cadence the tick
  // timer above runs on.
  useEffect(() => {
    if (!callActiveRef.current) return;
    unbilledSecondsRef.current += 1;
  }, [elapsedSeconds]);

  const speak = useCallback((text: string) => {
    const id = `call-${Date.now()}`;
    speakingMessageIdRef.current = id;
    setCallState("speaking");
    void play(id, text, characterId);
  }, [play, characterId]);

  // Playback actually ending (playingId clearing for OUR message) is
  // what returns the call to idle/listening-ready, not play() resolving
  // — see use-voice-playback.ts, play() kicks playback off rather than
  // awaiting its completion.
  useEffect(() => {
    if (speakingMessageIdRef.current && playingId !== speakingMessageIdRef.current && callState === "speaking") {
      speakingMessageIdRef.current = null;
      setCallState(callActiveRef.current ? "idle" : "ended");
    }
  }, [playingId, callState]);

  // Hold-to-talk start: opens the mic and begins recording into memory.
  // No live partial transcript — unlike SpeechRecognition, server-side
  // transcription has nothing to show until the clip is actually
  // uploaded, so `transcript` here is set only once, after release (see
  // stopListeningAndSend), not updated continuously while held.
  const startListening = useCallback(async () => {
    if (!sttSupported || callState === "speaking" || callState === "thinking" || callState === "transcribing") return;
    setError(null);
    setTranscript("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: pickRecorderMimeType() });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setCallState("listening");
    } catch {
      setError("Microphone access was denied — check your browser's site permissions.");
    }
  }, [sttSupported, callState]);

  // Release-to-send: stops the recording, uploads the clip for
  // transcription, then hands the resulting text off to the exact same
  // reply pipeline text chat uses.
  const stopListeningAndSend = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const stream = mediaStreamRef.current;
    if (!recorder || recorder.state === "inactive") {
      setCallState(callActiveRef.current ? "idle" : "ended");
      return;
    }

    setCallState("transcribing");
    recorder.onstop = () => {
      stream?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;

      const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
      recordedChunksRef.current = [];

      // A clip under ~400ms is almost certainly an accidental tap, not
      // real speech — skip the upload rather than charging a
      // transcription call for silence.
      if (blob.size < 2000) {
        setCallState(callActiveRef.current ? "idle" : "ended");
        return;
      }

      void (async () => {
        try {
          const form = new FormData();
          form.append("audio", blob, "call-clip.webm");
          const res = await fetch("/api/voice/call/transcribe", { method: "POST", body: form });
          const body = await res.json().catch(() => null);

          if (!res.ok || !body?.text) {
            if (res.status !== 400) setError("Couldn't hear that — try again.");
            setCallState(callActiveRef.current ? "idle" : "ended");
            return;
          }

          const text: string = body.text.trim();
          setTranscript(text);
          if (!text) {
            setCallState(callActiveRef.current ? "idle" : "ended");
            return;
          }

          setCallState("thinking");
          onDoneRef.current = (fullText: string) => {
            if (fullText.trim()) speak(fullText);
            else setCallState(callActiveRef.current ? "idle" : "ended");
          };
          void sendMessage(text, 0).then((ok) => {
            // sendMessage resolving false means it failed before ever
            // streaming a reply (network/validation/rate-limit) — onDone
            // never fires in that case, so without this the call would be
            // stuck on "thinking" forever instead of recovering.
            if (!ok) {
              setError("Couldn't reach the character — try again.");
              setCallState(callActiveRef.current ? "idle" : "ended");
            }
          });
        } catch {
          setError("Couldn't reach the server — try again.");
          setCallState(callActiveRef.current ? "idle" : "ended");
        }
      })();
    };
    recorder.stop();
  }, [sendMessage, onDoneRef, speak]);

  useEffect(() => () => endCall(), [endCall]);

  return {
    callState, transcript, error, sttSupported, elapsedSeconds,
    startCall, endCall, startListening, stopListeningAndSend,
  };
}

/**
 * Thin wrapper around useChatStream exposing a mutable onDone ref instead
 * of a fixed callback, since each call turn needs a fresh closure over
 * that specific turn's `speak()` call — useChatStream's own onDone is
 * fixed at hook-mount time, which a single long-lived call session
 * doesn't fit.
 */
function useChatStreamForCall(conversationId: string, characterId: string) {
  const onDoneRef = useRef<(fullText: string) => void>(() => {});
  const { sendMessage } = useChatStream({
    conversationId,
    characterId,
    onDone: (fullText) => onDoneRef.current(fullText),
  });
  return { sendMessage, onDoneRef };
}
