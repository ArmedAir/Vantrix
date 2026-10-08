"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useVoicePlayback } from "@/hooks/use-voice-playback";

/**
 * Orchestrates a voice call with a character by composing three pieces
 * that already exist and are left completely untouched:
 *
 *   1. Speech-to-text — the browser's native SpeechRecognition API,
 *      push-to-talk (hold to speak, release to send). No new backend
 *      cost (runs client-side), no new STT pipeline to build or
 *      maintain.
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
 * whole echo problem by construction: the mic is only ever listening
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

export type CallState = "idle" | "listening" | "thinking" | "speaking" | "ended";

interface UseVoiceCallOptions {
  conversationId: string;
  characterId: string;
  onInsufficientBalance?: () => void;
}

// Minimal ambient types for the two vendor-prefixed SpeechRecognition
// globals — not in lib.dom.d.ts, and this app has no @types package for
// it. Kept local to this file rather than a global.d.ts since nothing
// else in the codebase uses the Web Speech API.
interface MinimalSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => MinimalSpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => MinimalSpeechRecognition;
    webkitSpeechRecognition?: new () => MinimalSpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceCall({ conversationId, characterId, onInsufficientBalance }: UseVoiceCallOptions) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState("");
  const [sttSupported] = useState(() => getSpeechRecognitionCtor() !== null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
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

  const endCall = useCallback(() => {
    callActiveRef.current = false;
    recognitionRef.current?.stop();
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    if (unbilledSecondsRef.current > 0) {
      void reportUsage(unbilledSecondsRef.current);
      unbilledSecondsRef.current = 0;
    }
    setCallState("ended");
  }, [reportUsage]);

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

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || callState === "speaking" || callState === "thinking") return;
    setError(null);
    setTranscript("");

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0]?.transcript ?? "";
      setTranscript(text);
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(
        event.error === "not-allowed"
          ? "Microphone access was denied — check your browser's site permissions."
          : "Couldn't hear that — try again.",
      );
    };
    recognition.onend = () => {
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setCallState("listening");
    recognition.start();
  }, [callState]);

  // Release-to-send: stops recognition, then hands whatever transcript
  // accumulated off to the exact same reply pipeline text chat uses.
  const stopListeningAndSend = useCallback(() => {
    recognitionRef.current?.stop();
    const text = transcript.trim();
    setTranscript("");
    if (!text) {
      setCallState("idle");
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
  }, [transcript, sendMessage, onDoneRef, speak]);

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
