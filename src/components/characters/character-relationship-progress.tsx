"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { useCharacterPage } from "@/hooks/use-character-page";

interface ProgressState {
  stage: string;
  stageXp: number;
  stageXpCap: number;
}

/**
 * ENGAGEMENT-RETENTION: surfaces character_relationships.stage/stage_xp/
 * stage_xp_cap — real columns the relationship engine already writes on
 * every chat turn (relationship-engine.ts), returned by the GET
 * /api/characters/[id]/relationship route (extended this pass to include
 * them alongside the nicknames it already returned) but never shown
 * anywhere on this page before now. Same "bond meter" idea the dating
 * deck's chemistry-card.tsx gives matches, applied here to the ordinary
 * companion relationship every character already tracks — a concrete,
 * growing reason to come back to *this* character specifically, not a
 * generic engagement nudge.
 *
 * Fails soft: renders nothing for a signed-out visitor (401) or on error,
 * same posture as daily-progress-card.tsx — this is a bonus status
 * widget, not core profile content, so a failed fetch shouldn't leave a
 * broken-looking gap on the page.
 */
export function CharacterRelationshipProgress({ characterId }: { characterId: string }) {
  const { getRelationship } = useCharacterPage();
  const [state, setState] = useState<ProgressState | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRelationship(characterId).then((result) => {
      if (cancelled) return;
      if (result.status !== "ok") {
        setHidden(true);
        return;
      }
      setState({
        stage: result.data.stage,
        stageXp: result.data.stageXp,
        stageXpCap: result.data.stageXpCap,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, getRelationship]);

  if (hidden || !state) return null;

  const { stage, stageXp, stageXpCap } = state;
  // stage_xp_cap is a plain NOT NULL integer column — pinnacle stages
  // (best_friend/partner) don't have a further cap to progress toward,
  // so "reached or passed the cap" is treated as maxed rather than
  // trusting any particular sentinel value in that column.
  const maxed = stageXpCap <= 0 || stageXp >= stageXpCap;
  const pct = maxed ? 100 : Math.round((stageXp / stageXpCap) * 100);
  const label = stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Card interactive={false} className="mx-auto mt-6 max-w-xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">{label}</span>
        <span className="text-xs text-text-tertiary tabular-nums">
          {maxed ? "Max stage" : `${stageXp} / ${stageXpCap} XP`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full bg-gradient-to-r from-gold-400 to-gold-600 transition-all duration-500 ease-premium"
          style={{ width: `${pct}%` }}
        />
      </div>
      {!maxed && (
        <p className="mt-2 text-xs text-text-secondary">Keep chatting to grow your bond.</p>
      )}
    </Card>
  );
}
