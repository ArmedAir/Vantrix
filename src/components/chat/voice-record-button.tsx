"use client";

import { Mic, Loader2 } from "lucide-react";
import { useVoiceMessage } from "@/hooks/use-voice-message";

/**
 * Hold-to-record voice MESSAGE button for the ordinary chat composer —
 * press and hold, say your message, release. Unlike the live call
 * screen, there's no latency pressure here, so the transcript is handed
 * back to the composer's own draft/onChange (see chat-window.tsx's
 * handleVoiceTranscribed) rather than auto-sent — the user sees exactly
 * what was heard and can edit or clear it before it ever goes out,
 * same as typing.
 */
export function VoiceRecordButton({
  onTranscribed,
  disabled,
}: {
  onTranscribed: (text: string) => void;
  disabled?: boolean;
}) {
  const { state, error, supported, startRecording, stopAndTranscribe, cancelRecording } =
    useVoiceMessage(onTranscribed);

  if (!supported) return null; // no getUserMedia/MediaRecorder — composer just falls back to typing only

  return (
    <button
      type="button"
      onMouseDown={startRecording}
      onMouseUp={stopAndTranscribe}
      onMouseLeave={() => { if (state === "recording") cancelRecording(); }}
      onTouchStart={(e) => { e.preventDefault(); void startRecording(); }}
      onTouchEnd={(e) => { e.preventDefault(); stopAndTranscribe(); }}
      onTouchCancel={() => { if (state === "recording") cancelRecording(); }}
      disabled={disabled || state === "transcribing"}
      aria-label={state === "recording" ? "Release to send voice message" : "Hold to record a voice message"}
      title={error ?? undefined}
      className={
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color] ease-premium disabled:opacity-50 select-none " +
        (state === "recording"
          ? "scale-125 bg-gold-500 text-[#160F02]"
          : "text-text-secondary hover:bg-white/[0.04] hover:text-gold-400")
      }
    >
      {state === "transcribing" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </button>
  );
}
