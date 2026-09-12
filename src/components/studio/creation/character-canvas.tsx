"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { LivingPortrait } from "@/components/immersive/living-portrait";
import { CinematicBackground } from "@/components/immersive/cinematic-background";
import { EASE_VANTRIX, DURATION } from "@/components/immersive/motion";
import type { CharacterDraft } from "./types";
import { overallCompleteness } from "./completeness";

/**
 * Always-visible center panel — the doc's "character canvas." Reflects
 * whatever's been filled in so far, including before a portrait exists,
 * so the studio never feels like a blank form.
 *
 * Reuses the same immersive primitives the character detail page's hero
 * already uses (CinematicBackground, LivingPortrait) — so the one moment
 * in the app where a companion doesn't exist yet still reads as part of
 * the same premium surface as the moment it does, rather than a plain
 * settings-style form preview. Portrait swaps crossfade (page-duration,
 * EASE_VANTRIX) instead of popping instantly; skipped for
 * prefers-reduced-motion via useReducedMotion, same as every other
 * immersive primitive in the app.
 */
export function CharacterCanvas({ draft }: { draft: CharacterDraft }) {
  const completeness = overallCompleteness(draft);
  const shouldReduceMotion = useReducedMotion();
  const traits = [
    { label: "Warmth", value: draft.char_warmth },
    { label: "Openness", value: draft.char_openness },
    { label: "Adventure", value: draft.char_adventure },
    { label: "Depth", value: draft.char_depth },
  ];

  return (
    <div className="relative flex flex-col items-center text-center gap-5 py-8 px-4">
      <CinematicBackground intensity="subtle" />

      <div className="relative h-56 w-56 rounded-md overflow-hidden border border-border-hairline bg-white/[0.02] shrink-0">
        <AnimatePresence mode="wait">
          {draft.imageUrl ? (
            <motion.div
              key={draft.imageUrl}
              className="absolute inset-0"
              initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 1.03 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: DURATION.page, ease: EASE_VANTRIX }}
            >
              <LivingPortrait src={draft.imageUrl} alt={draft.name || "Character portrait"} sizes="224px" />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="absolute inset-0 flex items-center justify-center"
              initial={shouldReduceMotion ? undefined : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.micro }}
            >
              <Sparkles className="h-8 w-8 text-text-tertiary" />
            </motion.div>
          )}
        </AnimatePresence>
        {draft.identity_locked && draft.imageUrl && (
          <span className="absolute bottom-2 right-2 z-10 rounded-sm bg-black/60 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-400 border border-gold-500/40">
            Identity Locked
          </span>
        )}
      </div>

      <div>
        <h2 className="font-display text-xl text-text-primary">
          {draft.name || "Unnamed Character"}
        </h2>
        {(draft.occupation || draft.archetype) && (
          <p className="text-sm text-text-secondary mt-0.5">
            {[draft.occupation, draft.archetype].filter(Boolean).join(" \u00b7 ")}
          </p>
        )}
      </div>

      {draft.description && (
        <p className="text-sm text-text-tertiary max-w-xs line-clamp-3">{draft.description}</p>
      )}

      {draft.opening_line && (
        <p className="text-sm italic text-text-secondary max-w-xs">
          &ldquo;{draft.opening_line}&rdquo;
        </p>
      )}

      <div className="w-full max-w-[220px] space-y-2 pt-2">
        {traits.map((t) => (
          <div key={t.label} className="flex items-center gap-2">
            <span className="text-[11px] text-text-tertiary w-16 text-left shrink-0">{t.label}</span>
            <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-gold-500/70 transition-[width] duration-500 ease-premium"
                style={{ width: `${t.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="w-full max-w-[220px] pt-4 border-t border-border-hairline">
        <div className="flex items-center justify-between text-[11px] text-text-tertiary mb-1.5">
          <span>Character completeness</span>
          <span className="text-gold-400 font-semibold tabular-nums">{completeness}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full bg-gold-500 transition-[width] duration-300 ease-premium" style={{ width: `${completeness}%` }} />
        </div>
      </div>
    </div>
  );
}
