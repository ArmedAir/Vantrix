"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useVoicePlayback } from "@/hooks/use-voice-playback";

/**
 * Orchestrates a voice call with a character by composing pieces that
 * already exist, left untouched:
 *
 *   1. Speech-to-text — MediaRecorder captures what the user says,
 *      uploaded to POST /api/voice/call/transcribe, which forwards it
 *      to ElevenLabs Scribe server-side. NOT the browser's built-in
 *      SpeechRecognition — see transcribe/route.ts's own STT-PLATFORM-
 *      FIX doc: that API has zero support on iOS Safari/WebView, which
 *      silently broke the call for every iOS user. MediaRecorder +
 *      getUserMedia work broadly, iOS included.
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
 *      voice (characters.elevenlabs_voice_id) is what speaks on a call —
 *      no voiceId override anywhere in this file, same as
 *      message-bubble.tsx's own onPlayVoice call, so the two can't
 *      diverge: both resolve through the character's one assigned
 *      elevenlabs_voice_id by construction.
 *
 * TURN-TAKING-FIX: previously push-to-talk (hold the mic, release to
 * send) — now hands-free. A real voice-activity detector (Web Audio
 * API AnalyserNode reading live RMS volume off the same mic stream
 * MediaRecorder is capturing) listens continuously once the call is in
 * a listening-eligible state, waits out a short silence after it
 * detects you've actually said something, and sends automatically —
 * see startVadLoop below for the thresholds and reasoning. The mic
 * button is now a mute toggle, not a hold target.
 *
 * STILL NOT ALWAYS-ON DUPLEX: VAD only ever runs while callState is
 * "listening," which — same as the old push-to-talk boundary — never
 * overlaps with "speaking." The mic is never open while the
 * character's own TTS is playing, so there's still no echo-cancellation
 * problem to solve (that would need real WebRTC infrastructure this
 * does not attempt to build). A full-duplex, *interrupt*-capable call
 * (talking over the character mid-reply) is a larger, separate
 * follow-up, not this — this is "no button, but still one voice at a
 * time."
 *
 * iOS AUDIO UNLOCK: with no more per-turn release gesture to hang
 * unlockAudioPlayback() off of, it now runs once, from the explicit
 * "tap to begin" gesture that starts the call (see beginCall below) —
 * WebKit's unlock is page-session-scoped, not per-element, so one real
 * gesture at call start is enough for every later auto-triggered
 * playback in the same call.
 *
 * USAGE BILLING: ticks a POST /api/voice/call/usage call every
 * USAGE_TICK_MS while `callActive` is true, plus once more on explicit
 * end with whatever partial tick remains — see that route's own doc on
 * why ticking beats a single end-of-call report.
 */

const USAGE_TICK_MS = 20_000;

// VAD tuning — see startVadLoop for how each is used.
const VAD_RMS_THRESHOLD   = 0.02;   // amplitude (0-1) above which audio counts as "speech," not room noise
const VAD_SILENCE_MS      = 1200;   // continuous silence after speech before auto-sending
const VAD_MIN_SPEECH_MS   = 350;    // speech shorter than this is treated as a stray noise, not a turn
const VAD_MAX_TURN_MS     = 30_000; // hard cap so a stuck/background mic can't record forever

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

// IOS-AUTOPLAY-FIX: iOS Safari only allows HTMLMediaElement.play() to
// succeed when it's called synchronously inside a genuine user gesture
// (tap/click) — by the time this call's audio is ready to play
// (STT upload -> transcribe -> chat reply, all async), that window has
// long closed, so play() gets silently rejected. The fix most mobile web
// apps use: play (and immediately pause) a near-silent clip synchronously
// inside the gesture itself — on WebKit this "unlocks" audio playback
// for the rest of the page session, not just this one element, so the
// later async-triggered play() in useVoicePlayback succeeds normally for
// every turn afterward. Called once, from beginCall — the call's one
// required tap, since hands-free listening has no per-turn
// press/release gesture to hang this on anymore.
function unlockAudioPlayback() {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;
  try {
    // 1 sample of silence, valid WAV — smallest reliable "something
    // actually played" signal, no network fetch needed.
    const silent = new Audio(
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
    );
    void silent.play().then(() => silent.pause()).catch(() => {});
  } catch {
    // Best-effort — a failure here just means the later real playback
    // might still get blocked, which the watchdog above already covers.
  }
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
  // Mute replaces the old hold-to-talk button — the mic is open and VAD
  // is listening by default once a call is live; muting is the explicit
  // "I don't want to be heard right now" action, not holding a button to
  // opt IN to being heard.
  const [micMuted, setMicMuted] = useState(false);
  // Volume meter (0-1, smoothed) for the UI to react to — see
  // startVadLoop. Not used for any VAD decision itself, purely cosmetic
  // feedback so the screen visibly responds to the user's own voice.
  const [liveVolume, setLiveVolume] = useState(0);

  const mediaStreamRef  = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const callActiveRef  = useRef(false);
  const micMutedRef    = useRef(false);
  const unbilledSecondsRef = useRef(0);
  const tickTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // VAD plumbing — all torn down together in stopVadLoop.
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef     = useRef<AnalyserNode | null>(null);
  const vadRafRef       = useRef<number | null>(null);
  const speechStartedAtRef = useRef<number | null>(null);
  const lastVoiceAtRef     = useRef<number | null>(null);
  const turnStartedAtRef   = useRef<number>(0);

  const { sendMessage, onDoneRef } = useChatStreamForCall(conversationId, characterId);
  const { play, playingId, error: playbackError } = useVoicePlayback();
  const speakingMessageIdRef = useRef<string | null>(null);
  // RACE-FIX: distinguishes "hasn't started playing yet" from "finished
  // playing" — see the playingId effect below for the bug this closes.
  const speakingStartedRef = useRef(false);
  const speakingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const stopVadLoop = useCallback(() => {
    if (vadRafRef.current !== null) cancelAnimationFrame(vadRafRef.current);
    vadRafRef.current = null;
    analyserRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    speechStartedAtRef.current = null;
    lastVoiceAtRef.current = null;
    setLiveVolume(0);
  }, []);

  const stopMediaStream = useCallback(() => {
    stopVadLoop();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  }, [stopVadLoop]);

  /**
   * Runs continuously while callState is "listening," reading live RMS
   * volume off the same mic stream MediaRecorder is capturing. Three
   * things it watches for, in order:
   *   1. Volume crosses VAD_RMS_THRESHOLD for the first time -> marks
   *      speech as started (speechStartedAtRef).
   *   2. After speech has started, volume stays below threshold for
   *      VAD_SILENCE_MS straight -> the user has stopped talking;
   *      auto-sends, but only if total speech so far exceeds
   *      VAD_MIN_SPEECH_MS (otherwise it was a stray noise/cough, not a
   *      turn — reset and keep listening instead of sending nothing).
   *   3. VAD_MAX_TURN_MS elapses regardless -> force-send whatever's
   *      been said so far, so a stuck mic or a very long ramble can't
   *      record forever.
   * `stopListeningAndSend` (called from here) does the actual upload —
   * same function the old push-to-talk release used, unchanged.
   */
  const startVadLoop = useCallback((stream: MediaStream, onTurnEnd: () => void) => {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return; // no Web Audio support — falls back to VAD_MAX_TURN_MS never firing; mute button is still the manual escape hatch

    const audioContext = new AudioCtx();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    speechStartedAtRef.current = null;
    lastVoiceAtRef.current = null;
    turnStartedAtRef.current = Date.now();

    const tick = () => {
      if (!analyserRef.current) return; // torn down mid-loop
      analyserRef.current.getByteTimeDomainData(data);

      // RMS of the centered (0 = silence at 128 in byte-domain) signal.
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const centered = (data[i] - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      setLiveVolume((prev) => prev * 0.6 + Math.min(1, rms * 6) * 0.4); // smoothed, just for the UI meter

      const now = Date.now();
      if (!micMutedRef.current && rms > VAD_RMS_THRESHOLD) {
        if (speechStartedAtRef.current === null) speechStartedAtRef.current = now;
        lastVoiceAtRef.current = now;
      }

      const elapsedSinceTurnStart = now - turnStartedAtRef.current;
      const hasSpokenLongEnough =
        speechStartedAtRef.current !== null &&
        (lastVoiceAtRef.current ?? speechStartedAtRef.current) - speechStartedAtRef.current >= VAD_MIN_SPEECH_MS;
      const silenceLongEnough =
        lastVoiceAtRef.current !== null && now - lastVoiceAtRef.current >= VAD_SILENCE_MS;

      if ((hasSpokenLongEnough && silenceLongEnough) || elapsedSinceTurnStart >= VAD_MAX_TURN_MS) {
        onTurnEnd();
        return; // don't schedule another frame — the caller takes over
      }
      vadRafRef.current = requestAnimationFrame(tick);
    };
    vadRafRef.current = requestAnimationFrame(tick);
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
    speakingStartedRef.current = false;
    setCallState("speaking");
    void play(id, text, characterId);

    // WATCHDOG: covers every way playback can fail to ever start —
    // iOS Safari's autoplay-gesture policy rejecting audio.play() since
    // it's no longer inside the synchronous scope of a tap by the time
    // this runs (upload -> transcribe -> chat reply all happened first),
    // a slow/failed /api/voice/tts call, or any other silent failure in
    // useVoicePlayback. Without this, a playback that never starts left
    // the call stuck on "speaking" forever (mic disabled, nothing
    // happens) — indistinguishable from "the character isn't
    // responding" even though a reply WAS generated.
    if (speakingWatchdogRef.current) clearTimeout(speakingWatchdogRef.current);
    speakingWatchdogRef.current = setTimeout(() => {
      if (speakingMessageIdRef.current === id && !speakingStartedRef.current) {
        speakingMessageIdRef.current = null;
        setError("Couldn't play the reply — try again.");
        setCallState(callActiveRef.current ? "idle" : "ended");
      }
    }, 8000);
  }, [play, characterId]);

  // RACE-FIX: the old version of this effect checked only
  // `playingId !== speakingMessageIdRef.current`, which is true both
  // "before playback has started" (playingId is still null/someone
  // else's id) and "after it finished" — so it fired the instant
  // speak() set callState to "speaking", before any audio had even
  // started loading, snapping the call straight back to idle with
  // nothing audibly played. speakingStartedRef now tracks whether
  // playingId has actually matched our message at least once; only a
  // transition AWAY from that counts as "finished."
  useEffect(() => {
    if (!speakingMessageIdRef.current || callState !== "speaking") return;

    if (playingId === speakingMessageIdRef.current) {
      speakingStartedRef.current = true;
      return;
    }
    if (speakingStartedRef.current) {
      if (speakingWatchdogRef.current) clearTimeout(speakingWatchdogRef.current);
      speakingMessageIdRef.current = null;
      setCallState(callActiveRef.current ? "idle" : "ended");
    }
  }, [playingId, callState]);

  // Surfaces useVoicePlayback's own error (e.g. a DOMException from a
  // blocked audio.play(), "Voice playback failed.") into the call's
  // error state — previously read nowhere in this hook, so a playback
  // failure had no visible explanation at all beyond the watchdog above
  // eventually timing out.
  useEffect(() => {
    if (playbackError) setError(playbackError);
  }, [playbackError]);

  useEffect(() => () => {
    if (speakingWatchdogRef.current) clearTimeout(speakingWatchdogRef.current);
  }, []);

  // Opens the mic, starts recording into memory, and starts the VAD
  // loop watching for when to stop automatically — called whenever the
  // call becomes listening-eligible (auto-resume effect below), not by
  // a button press anymore.
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
      startVadLoop(stream, () => stopListeningAndSendRef.current());
    } catch {
      setError("Microphone access was denied — check your browser's site permissions.");
    }
  }, [sttSupported, callState, startVadLoop]);

  // Called by the VAD loop once it decides the user has finished
  // talking (or a mute mid-turn aborts it) — stops the recording,
  // uploads the clip for transcription, then hands the resulting text
  // off to the exact same reply pipeline text chat uses.
  const stopListeningAndSend = useCallback(() => {
    stopVadLoop();
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
  }, [sendMessage, onDoneRef, speak, stopVadLoop]);

  // Ref indirection so startVadLoop/startListening (defined above, for
  // readability) can always call the CURRENT stopListeningAndSend
  // without a circular useCallback dependency between the two.
  const stopListeningAndSendRef = useRef(stopListeningAndSend);
  useEffect(() => { stopListeningAndSendRef.current = stopListeningAndSend; }, [stopListeningAndSend]);

  // Gates the auto-resume effect below until the explicit "tap to
  // begin" gesture has unlocked audio playback (see beginCall) — without
  // this, the hook would request mic access the instant startCall()
  // runs, which the call screen currently does from a mount effect, not
  // a tap. Requesting the mic before the user has done anything would
  // both surprise them with a permission prompt on load and, for TTS
  // playback specifically, happen outside any user gesture at all.
  const canAutoListenRef = useRef(false);

  /**
   * TURN-TAKING-FIX / iOS AUDIO UNLOCK: the call screen's one required
   * tap, replacing the old per-turn press-and-release gesture as the
   * thing unlockAudioPlayback() hangs off of. Call this from a real
   * onClick, not an effect.
   */
  const beginCall = useCallback(() => {
    unlockAudioPlayback();
    canAutoListenRef.current = true;
    if (callState === "idle" && callActiveRef.current && !micMutedRef.current) {
      void startListening();
    }
  }, [callState, startListening]);

  // Auto-resume: once the call is live and unmuted, re-opens the mic
  // every time callState returns to "idle" — right after beginCall's
  // first tap, and again after every "speaking" finishes (the
  // playingId effect above sets callState back to "idle", not
  // "listening," specifically so this one effect is the single place
  // that decides whether to start listening again, rather than
  // duplicating that decision at every call site that can produce
  // "idle").
  useEffect(() => {
    if (callState === "idle" && callActiveRef.current && !micMuted && canAutoListenRef.current) {
      void startListening();
    }
  }, [callState, micMuted, startListening]);

  const toggleMute = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      micMutedRef.current = next;
      if (next && callState === "listening") {
        // Muting mid-turn aborts rather than sends — the user muted
        // because they don't want to be heard right now, not because
        // they finished a thought.
        stopVadLoop();
        mediaRecorderRef.current?.stop();
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];
        setCallState(callActiveRef.current ? "idle" : "ended");
      }
      return next;
    });
  }, [callState, stopVadLoop]);

  useEffect(() => () => endCall(), [endCall]);

  return {
    callState, transcript, error, sttSupported, elapsedSeconds,
    micMuted, liveVolume,
    startCall, beginCall, endCall, toggleMute,
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
