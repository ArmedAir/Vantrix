"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LivingPortrait } from "@/components/immersive/living-portrait";
import { CinematicBackground } from "@/components/immersive/cinematic-background";
import {
  CharacterReactionProvider,
  useTriggerCharacterReaction,
} from "@/components/immersive/character-reaction-context";
import { CharacterReactionBurst } from "@/components/immersive/character-reaction-burst";
import { EASE_VANTRIX, DURATION } from "@/components/immersive/motion";

interface CharacterBirthRevealProps {
  name: string;
  imageUrl?: string | null;
  /** Set when creation itself succeeded but a later detail-save step
      partially failed. Replaces the celebratory line with the warning
      text so it's guaranteed to be seen, instead of the previous
      behavior (set + an immediate redirect that could carry the user
      away before they ever read it). */
  warning?: string | null;
  onContinue: () => void;
}

function BirthRevealInner({ name, imageUrl, warning, onContinue }: CharacterBirthRevealProps) {
  const shouldReduceMotion = useReducedMotion();
  const triggerReaction = useTriggerCharacterReaction();

  // Escape-to-close, matching match-celebration.tsx's overlay pattern.
  // There's nothing to "cancel" here (the character already exists), so
  // dismissing is just an alternate path to the same onContinue as the
  // button.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onContinue();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onContinue]);

  useEffect(() => {
    // A direct consequence of the "Create Companion" click that put this
    // overlay on screen, not an ambient auto-play — stays consistent with
    // this app's "motion responds to a direct interaction" rule (see
    // living-portrait.tsx's own note on this).
    const id = window.setTimeout(() => triggerReaction("milestone"), shouldReduceMotion ? 0 : 260);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={`${name || "Your companion"} has been created`}
    >
      <CinematicBackground intensity="premium" />

      <motion.div
        className="relative z-10 w-full max-w-sm flex flex-col items-center text-center gap-5"
        initial={shouldReduceMotion ? undefined : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.cinematic, ease: EASE_VANTRIX }}
      >
        <div className="relative h-40 w-40 rounded-full overflow-hidden border border-gold-500/40 shadow-gold-glow bg-white/[0.03]">
          {imageUrl ? (
            <LivingPortrait src={imageUrl} alt={name || "Character portrait"} sizes="160px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Sparkles className="h-8 w-8 text-gold-400" />
            </div>
          )}
          <CharacterReactionBurst />
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary mb-1.5">
            {warning ? "Created with a note" : "Say hello to"}
          </p>
          <h1 className="font-display text-2xl text-text-primary">{name || "Your new companion"}</h1>
        </div>

        <p className="text-sm text-text-secondary max-w-xs">
          {warning ?? "They\u2019re ready to meet you."}
        </p>

        <Button type="button" size="lg" onClick={onContinue} className="mt-1">
          Meet {name || "them"}
        </Button>
      </motion.div>
    </div>
  );
}

/**
 * The ceremonial "your companion is born" moment, shown once character
 * creation succeeds — replaces what used to be an instant redirect
 * (see preview-stage.tsx). Mounted only for that brief window, not a
 * persistent UI element: a deliberate one-time beat, not ambient chrome.
 *
 * Reuses the same immersive primitives as the rest of the app
 * (CinematicBackground, LivingPortrait, CharacterReactionBurst via its
 * own CharacterReactionProvider) so this one-off moment still belongs to
 * the same design language as the character detail page it's about to
 * hand off to, rather than introducing new visual language just for
 * this screen. No auto-advance/timed redirect: the person decides when
 * to move on, via "Meet {name}" or Escape, never on a clock — consistent
 * with how every other full-screen overlay in this app behaves
 * (match-celebration.tsx, media-lightbox.tsx, etc.).
 */
export function CharacterBirthReveal(props: CharacterBirthRevealProps) {
  return (
    <CharacterReactionProvider>
      <BirthRevealInner {...props} />
    </CharacterReactionProvider>
  );
}
