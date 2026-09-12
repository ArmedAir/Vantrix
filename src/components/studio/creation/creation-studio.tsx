"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EASE_VANTRIX, DURATION } from "@/components/immersive/motion";
import { StageRail } from "./stage-rail";
import { CharacterCanvas } from "./character-canvas";
import { DraftResumeBanner } from "./draft-resume-banner";
import { STAGES, emptyDraft, type CharacterDraft, type StageId } from "./types";
import { overallCompleteness } from "./completeness";
import { isMeaningfulDraft, loadDraft, saveDraft, clearDraft, type DraftSnapshot } from "./draft-storage";
import { timeAgo } from "@/lib/utils";
import { ConceptStage } from "./stages/concept-stage";
import { IdentityStage } from "./stages/identity-stage";
import { PersonalityStage } from "./stages/personality-stage";
import { PsychologyStage } from "./stages/psychology-stage";
import { VoiceStage } from "./stages/voice-stage";
import { AppearanceStage } from "./stages/appearance-stage";
import { MemoryStage } from "./stages/memory-stage";
import { PreviewStage } from "./stages/preview-stage";

const STAGE_ORDER: StageId[] = STAGES.map((s) => s.id);
const AUTOSAVE_DEBOUNCE_MS = 600;

export function CreationStudio({ userId = null }: { userId?: string | null }) {
  const [draft, setDraft] = useState<CharacterDraft>(emptyDraft());
  const [activeStage, setActiveStage] = useState<StageId>("concept");
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [appearanceNotice, setAppearanceNotice] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion();

  // ── Draft autosave / resume ──────────────────────────────────────────
  // See draft-storage.ts's header for why this exists. `hydrated` gates
  // autosave until the initial "is there a saved draft?" check has run
  // and, if one was found, the creator has chosen resume-vs-discard —
  // otherwise the very first autosave tick would silently overwrite a
  // real saved draft with the fresh emptyDraft() state.
  const [pendingResume, setPendingResume] = useState<DraftSnapshot | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setHydrated(true);
      return;
    }
    const saved = loadDraft(userId);
    if (saved) {
      setPendingResume(saved);
    } else {
      setHydrated(true);
    }
    // Intentionally run once per mount — userId doesn't change mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autosaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!userId || !hydrated || pendingResume) return;
    if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
    autosaveTimeout.current = setTimeout(() => {
      if (isMeaningfulDraft(draft)) {
        saveDraft(userId, draft, activeStage, furthestIndex);
        setLastSavedAt(new Date().toISOString());
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
    };
  }, [draft, activeStage, furthestIndex, userId, hydrated, pendingResume]);

  function resumeSavedDraft() {
    if (!pendingResume) return;
    setDraft(pendingResume.draft);
    setActiveStage(pendingResume.activeStage);
    setFurthestIndex(pendingResume.furthestIndex);
    setLastSavedAt(pendingResume.savedAt);
    setPendingResume(null);
    setHydrated(true);
  }

  function discardSavedDraft() {
    if (userId) clearDraft(userId);
    setPendingResume(null);
    setHydrated(true);
  }

  function handlePublished() {
    if (userId) clearDraft(userId);
  }

  // ── Wizard navigation ────────────────────────────────────────────────
  function patch(p: Partial<CharacterDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function goToStage(stage: StageId) {
    setActiveStage(stage);
  }

  function advance(next: StageId) {
    const idx = STAGE_ORDER.indexOf(next);
    setFurthestIndex((f) => Math.max(f, idx));
    setActiveStage(next);
  }

  const currentIndex = STAGE_ORDER.indexOf(activeStage);
  const canGoBack = currentIndex > 0;
  const nextStage = STAGE_ORDER[currentIndex + 1];
  const completeness = overallCompleteness(draft);

  return (
    <div className="min-h-screen bg-base flex flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border-hairline px-4 md:px-8 py-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display text-sm tracking-wide text-text-tertiary shrink-0">VANTRIX</span>
          <span className="text-text-tertiary/40 shrink-0">/</span>
          <span className="font-display text-sm text-text-primary shrink-0">Create Character</span>
        </div>

        {/* Visible at every breakpoint — CharacterCanvas's own completeness
            bar is desktop-only (lg:block), so mobile/tablet creators
            otherwise never see this signal at all. */}
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 w-28">
            <div className="flex-1 h-1 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-gold-500 transition-[width] duration-300 ease-premium"
                style={{ width: `${completeness}%` }}
              />
            </div>
            <span className="text-[11px] text-text-tertiary tabular-nums shrink-0">{completeness}%</span>
          </div>
          {lastSavedAt && (
            <span className="text-[11px] text-text-tertiary whitespace-nowrap">Draft saved {timeAgo(lastSavedAt, true)}</span>
          )}
        </div>

        <Link href="/studio" className="text-text-tertiary hover:text-text-primary transition-colors ease-premium shrink-0">
          <X className="h-5 w-5" />
        </Link>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[200px_1fr] lg:grid-cols-[220px_320px_1fr] gap-6 lg:gap-8 px-4 md:px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="md:order-1">
          <StageRail draft={draft} activeStage={activeStage} onSelect={goToStage} furthestIndex={furthestIndex} />
        </div>

        <div className="hidden lg:block lg:order-2">
          <div className="sticky top-6 rounded-md overflow-hidden border border-border-hairline bg-white/[0.015]">
            <CharacterCanvas draft={draft} />
          </div>
        </div>

        <main className="md:order-3 lg:order-3 min-w-0">
          {pendingResume && (
            <DraftResumeBanner savedAt={pendingResume.savedAt} onResume={resumeSavedDraft} onDiscard={discardSavedDraft} />
          )}

          {/* Each stage change reads as a deliberate step forward rather
              than a DOM swap — same page-duration/EASE_VANTRIX language
              as every other transition in the app (see motion.ts).
              mode="wait" fully clears the previous stage before the next
              mounts, which matters here since stages vary a lot in
              height — overlapping enter/exit would cause a layout jump. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStage}
              initial={shouldReduceMotion ? undefined : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, x: -10 }}
              transition={{ duration: DURATION.page, ease: EASE_VANTRIX }}
            >
              {activeStage === "concept" && (
                <ConceptStage
                  draft={draft}
                  onChange={setDraft}
                  onContinue={() => advance("identity")}
                  onJumpToPreview={() => advance("preview")}
                  onJumpToAppearance={(notice) => {
                    setAppearanceNotice(notice);
                    advance("appearance");
                  }}
                />
              )}
              {activeStage === "identity" && <IdentityStage draft={draft} onChange={patch} />}
              {activeStage === "personality" && <PersonalityStage draft={draft} onChange={patch} />}
              {activeStage === "psychology" && <PsychologyStage draft={draft} onChange={patch} />}
              {activeStage === "voice" && <VoiceStage draft={draft} onChange={patch} />}
              {activeStage === "appearance" && (
                <AppearanceStage
                  draft={draft}
                  onChange={patch}
                  notice={appearanceNotice}
                  onDismissNotice={() => setAppearanceNotice(null)}
                />
              )}
              {activeStage === "memory" && <MemoryStage draft={draft} onChange={patch} />}
              {activeStage === "preview" && <PreviewStage draft={draft} onPublished={handlePublished} />}

              {activeStage !== "concept" && activeStage !== "preview" && (
                <div className="flex items-center justify-between pt-6 mt-8 border-t border-border-hairline">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => canGoBack && setActiveStage(STAGE_ORDER[currentIndex - 1])}
                    disabled={!canGoBack}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button type="button" onClick={() => nextStage && advance(nextStage)}>
                    Continue
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
