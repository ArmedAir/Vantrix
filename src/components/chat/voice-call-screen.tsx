"use client";

import { useEffect, useState } from "react";
import { PhoneOff, Mic, Loader2 } from "lucide-react";
import { resolveImageSrc } from "@/lib/utils";
import { usePaywall } from "@/components/paywall/paywall-provider";
import { useVoiceCall } from "@/hooks/use-voice-call";

/**
 * OWN-PAGE FIX: was a client-side modal mounted over the chat screen
 * (voice-call-button.tsx held an `open` boolean and rendered this on
 * top of everything). Now rendered by its own route,
 * (app)/call/[id]/page.tsx, reached by navigating there rather than by
 * toggling local state — a real "screen" the back button/history/deep
 * links all work with normally, not an overlay a page refresh or a
 * shared link would lose. Same component either way; `onClose` is now
 * "navigate back to the conversation" (passed in by the page) rather
 * than "flip a boolean."
 *
 * Premium + balance gating happens via a POST /api/voice/call/start
 * preflight before this even mounts the real call state — this
 * component assumes it's only ever reached for a call that's allowed to
 * happen, same "gate before the expensive UI mounts" posture as the
 * rest of this app's premium surfaces.
 *
 * Push-to-talk: press-and-hold the mic button to speak, release to send
 * — see use-voice-call.ts's own doc for why this isn't always-on duplex,
 * and for why speech-to-text is a server round-trip (transcribe/route.ts)
 * rather than the browser's own SpeechRecognition.
 */
export function VoiceCallScreen({
  conversationId,
  characterId,
  characterName,
  characterImage,
  onClose,
}: {
  conversationId: string;
  characterId: string;
  characterName: string;
  characterImage: string | null;
  /** Navigate back to the conversation — see the page component, which
   *  passes `() => router.push(`/chat/${conversationId}`)`. */
  onClose: () => void;
}) {
  const { openPaywallForError } = usePaywall();
  const [starting, setStarting] = useState(true);
  const [startError, setStartError] = useState<string | null>(null);
  const [freeSecondsRemaining, setFreeSecondsRemaining] = useState<number | null>(null);

  const {
    callState, transcript, error, sttSupported, elapsedSeconds,
    startCall, endCall, startListening, stopListeningAndSend,
  } = useVoiceCall({
    conversationId,
    characterId,
    onInsufficientBalance: () => {
      openPaywallForError("CALL_LIMIT_EXCEEDED", { characterName, reasonOverride: "call" });
      onClose();
    },
  });

  // Preflight: premium + balance check before the mic is ever touched.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/voice/call/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId }),
        });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          const handled = openPaywallForError(body?.code, { characterName, reasonOverride: "call" });
          if (!handled) setStartError(body?.error ?? "Couldn't start the call.");
          onClose();
          return;
        }
        setFreeSecondsRemaining(body.freeSecondsRemaining ?? null);
        setStarting(false);
        startCall();
      } catch {
        if (!cancelled) {
          setStartError("Couldn't reach the server — check your connection.");
          onClose();
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once on mount only
  }, []);

  function handleClose() {
    endCall();
    onClose();
  }

  const minutesLeft = freeSecondsRemaining !== null ? Math.floor(freeSecondsRemaining / 60) : null;
  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const ss = String(elapsedSeconds % 60).padStart(2, "0");

  if (startError) return null; // paywall or inline toast already surfaced it via onClose

  const isLive = callState === "listening" || callState === "speaking";
  const statusLine =
    starting ? "Connecting…"
    : callState === "idle" ? "Hold to talk"
    : callState === "listening" ? "Listening…"
    : callState === "transcribing" ? "Hearing you out…"
    : callState === "thinking" ? `${characterName} is thinking`
    : callState === "speaking" ? `${characterName} is speaking`
    : "";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black animate-fade-in">
      {/* FULL-BLEED PORTRAIT: the character's own image as the entire
          screen, not a small avatar on a plain panel — the call itself
          is the scene. `animate-sway` is the same slow perspective tilt
          LivingPortrait already gives every large character portrait
          site-wide (tailwind.config.ts) — reused here rather than
          inventing a second "living image" treatment, so a call feels
          like a continuation of the character's presence elsewhere in
          the app, not a different product bolted on. Swapped for a
          faster, more pronounced version of the same keyframe while
          `isLive`, so the portrait visibly quickens when the character
          is actually present in the conversation (listening/speaking)
          versus idly waiting. */}
      {characterImage && (
        // eslint-disable-next-line @next/next/no-img-element -- full-bleed call background, not worth a next/image fill-layout round-trip for a fixed-position overlay
        <img
          src={resolveImageSrc(characterImage)}
          alt=""
          aria-hidden
          className={
            "absolute inset-0 h-full w-full object-cover transform-gpu " +
            (isLive ? "animate-sway-live" : "animate-sway")
          }
        />
      )}

      {/* SCRIM: asymmetric — heavier at the bottom, where the glass
          control bar needs real contrast underneath it, lighter at the
          top where only the name/status/timer sit. A flat single
          overlay would either wash out the portrait or leave the
          controls illegible; this is the same two-stop gradient logic
          character-hero.tsx already uses for its own scrim, stretched
          across a full screen instead of one card. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/10 to-black/85" aria-hidden />

      {/* PRESENCE RING: a soft gold glow breathing at the screen's own
          edges while the character is listening or speaking — the full-
          screen analog of the small ring this component used to draw
          around a tiny avatar, now felt rather than seen as a discrete
          shape, in keeping with "immersive" meaning the whole screen
          responds, not one element on it. */}
      <div
        className={
          "pointer-events-none absolute inset-0 transition-opacity duration-700 ease-premium " +
          (isLive ? "opacity-100" : "opacity-0")
        }
        style={{ boxShadow: "inset 0 0 120px 10px rgba(var(--gold-500), 0.22)" }}
        aria-hidden
      />

      {/* TOP: name + live status, no chrome beyond what the scrim and
          type treatment themselves provide — the brief asked for
          immersive and luxurious, and a bordered card or label pill up
          here would be exactly the "template chrome" that undercuts
          that. */}
      <div className="absolute inset-x-0 top-0 flex flex-col items-center pt-14 px-6">
        <p className="font-display text-[28px] leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
          {characterName}
        </p>
        <p className="mt-1.5 text-[13px] tracking-wide text-white/70">
          {starting ? "Connecting…" : `${mm}:${ss}`}
        </p>
        {minutesLeft !== null && minutesLeft <= 3 && !starting && (
          <span className="mt-3 rounded-full border border-gold-500/30 bg-black/30 px-3 py-1 text-[11px] text-gold-300 backdrop-blur-md">
            {minutesLeft} min left this month
          </span>
        )}
      </div>

      {/* BOTTOM: status line, live transcript caption, controls — one
          glass surface the eye reads as a single control bar, rather
          than several separate floating pieces. */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-5 px-6 pb-10 pt-16">
        {!sttSupported && (
          <p className="text-sm text-danger text-center max-w-xs">
            Voice input isn&apos;t supported in this browser — try Chrome, Edge, or Safari.
          </p>
        )}
        {error && <p className="text-sm text-danger text-center max-w-xs">{error}</p>}

        {transcript && (callState === "thinking" || callState === "speaking") ? (
          <p className="max-w-sm text-center text-[15px] text-white/90 italic">
            &ldquo;{transcript}&rdquo;
          </p>
        ) : (
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">{statusLine}</p>
        )}

        <div className="flex items-center gap-10">
          <button
            onMouseDown={startListening}
            onMouseUp={stopListeningAndSend}
            onTouchStart={(e) => { e.preventDefault(); startListening(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopListeningAndSend(); }}
            disabled={starting || !sttSupported || callState === "thinking" || callState === "speaking" || callState === "transcribing"}
            aria-label="Hold to talk"
            className={
              "relative flex h-[72px] w-[72px] select-none items-center justify-center rounded-full border transition-[transform,background-color,border-color,box-shadow] duration-200 ease-premium disabled:opacity-40 " +
              (callState === "listening"
                ? "scale-110 border-gold-400 bg-gold-500 shadow-gold-glow"
                : "border-white/20 bg-white/[0.06] backdrop-blur-md hover:border-gold-500/40")
            }
          >
            {starting || callState === "thinking" || callState === "transcribing" ? (
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            ) : (
              <Mic className={"h-6 w-6 " + (callState === "listening" ? "text-[#160F02]" : "text-white")} />
            )}
          </button>

          <button
            onClick={handleClose}
            aria-label="End call"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/90 transition-colors ease-premium hover:bg-danger"
          >
            <PhoneOff className="h-6 w-6 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
