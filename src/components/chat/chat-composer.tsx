"use client";

import { useRef, type KeyboardEvent } from "react";
import { Send, Camera, Video, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  isStreaming,
  onStop,
  onGenerateImage,
  onGenerateVideo,
  isGeneratingImage,
  isGeneratingVideo,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  /** True while a reply is streaming in. Swaps the send button for a
   *  stop control (see onStop) instead of just disabling it — previously
   *  there was no way to cancel a reply once it started generating. */
  isStreaming?: boolean;
  onStop?: () => void;
  onGenerateImage?: () => void;
  onGenerateVideo?: () => void;
  isGeneratingImage?: boolean;
  isGeneratingVideo?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSend();
    }
  }

  // KEYBOARD-VISIBILITY HARDENING: the real fix for the composer landing
  // under the keyboard is ViewportHeightSync's --vvh (see that file) —
  // this is a second, independent safety net on top of it, not a
  // replacement. A focus can fire a beat before iOS finishes animating
  // the keyboard in and --vvh's own resize-driven update lands, so this
  // additionally asks the browser to keep the caret's element on-screen
  // once focus lands. `scrollIntoView({ block: "nearest" })` on a
  // sticky-bottom element already at the bottom of its scroll container
  // is a cheap no-op the rest of the time — this never fights the normal
  // layout, it only helps in the exact narrow race window above.
  function handleFocus() {
    requestAnimationFrame(() => {
      textareaRef.current?.scrollIntoView({ block: "nearest" });
    });
  }

  const mediaBusy = Boolean(isGeneratingImage || isGeneratingVideo);

  return (
    // SAFE-AREA FIX: bottom padding is split (pt-3 / pb-<safe-area>)
    // rather than a flat py-3 — this bar's box now reaches the true
    // viewport edge on mobile (see chat-window.tsx's own height-calc
    // comment: the column no longer subtracts the inset itself), so the
    // inset has to live in here instead, pushing the actual controls up
    // above the home-indicator strip while the bg/border still meet the
    // real edge instead of leaving a bare gap beneath them.
    <div className="sticky bottom-0 border-t border-border-hairline bg-base/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
      {/*
        A11Y-FIX (matches tailwind.config.ts's border-interactive rationale):
        this wrapper is the textarea's visible edge, not a decorative
        card/section divider, so border-hairline's 8%-opacity (1.19:1) and
        the old 40%-opacity focus gold (~2.2:1) both missed the WCAG 3:1
        minimum for a UI component boundary. Rest state now matches the
        border-interactive token; focus state now matches gold-500/60,
        the same value every other form field in the app already uses
        (~3.58:1) — this was the one input still on the old value.

        PREMIUM-POLISH PASS: added shadow-card so the bar reads as a
        raised control resting on the page (matches the depth just added
        to message bubbles/header) instead of a flat outline — purely
        cosmetic, same border/radius/padding contract as before.
      */}
      <div className="flex items-end gap-2 rounded-full border border-border-interactive bg-base px-4 py-2.5 shadow-card focus-within:border-gold-500/60 transition-colors ease-premium">
        {onGenerateImage && (
          <button
            type="button"
            onClick={onGenerateImage}
            disabled={mediaBusy || isStreaming}
            aria-label="Send a photo"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors ease-premium hover:bg-white/[0.04] hover:text-gold-400 disabled:opacity-50"
          >
            {isGeneratingImage ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </button>
        )}
        {onGenerateVideo && (
          <button
            type="button"
            onClick={onGenerateVideo}
            disabled={mediaBusy || isStreaming}
            aria-label="Send a video"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors ease-premium hover:bg-white/[0.04] hover:text-gold-400 disabled:opacity-50"
          >
            {isGeneratingVideo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Video className="h-4 w-4" />
            )}
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            autoGrow();
          }}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          rows={1}
          maxLength={4000}
          placeholder="Send a message..."
          // CARET-VISIBILITY: explicit gold caret so the "am I actually
          // typing" signal doesn't depend on text-text-primary alone —
          // a thin default caret against bg-transparent can be easy to
          // lose track of on some Android WebViews; this makes it
          // unmistakable and doubles as a small premium touch.
          className="flex-1 resize-none bg-transparent text-[15px] text-text-primary caret-gold-500 placeholder:text-text-tertiary outline-none max-h-40"
        />
        {isStreaming && onStop ? (
          <Button
            size="icon"
            variant="primary"
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop generating"
            className="rounded-full"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="primary"
            disabled={disabled || !value.trim()}
            onClick={onSend}
            aria-label="Send message"
            className="rounded-full"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
