/**
 * Media-Milestone Engine
 *
 * Ties voice-note and portrait-angle generation to relationship depth —
 * the missing "unlock as you level up" mechanic the product spec calls
 * for, alongside secret-tier-engine.ts's existing narrative/dialogue gate.
 * Neither media surface checked relationship stage before this:
 * /api/voice/tts was NSFW/token-gated only, /api/chat/image was
 * tier/token/NSFW-gated only. This is a fully separate, orthogonal gate —
 * a free-tier user at best_friend gets full access here; a premium-tier
 * user still on stranger does not, exactly like narrative secrets already
 * work in secret-tier-engine.ts.
 *
 * STAGE_RANK below is a deliberate copy of secret-tier-engine.ts's own
 * private STAGE_RANK, not an import from it — "reuse the stage-rank
 * logic" means reuse the *approach* (a small friendship/romance rank
 * table gating a feature by floor), not couple two independently-scoped
 * engines to one file's internal implementation detail. Both tables must
 * stay in sync with RelationshipStage by construction (TS would fail to
 * compile a stage this table doesn't cover), so drift risk is the same
 * either way.
 */

import type { RelationshipStage } from '@/lib/ai/relationship-engine';

const STAGE_RANK: Record<string, number> = {
  stranger: 0, match: 0,
  acquaintance: 1,
  friend: 2, dating: 2,
  close_friend: 3, exclusive: 3,
  best_friend: 4, partner: 4,
};

function rankOf(stage: RelationshipStage): number {
  return STAGE_RANK[stage] ?? 0;
}

// ── Voice notes ──────────────────────────────────────────────────────────
//
// Whole-feature gate: below this floor, she hasn't warmed up enough to
// send a voice message at all, not just a specific style of one — same
// "Known Secret unlocks at acquaintance" floor secret-tier-engine.ts uses
// for its first tier, since a voice note is a comparable first step up
// from text-only.
const VOICE_UNLOCK_FLOOR: RelationshipStage = 'acquaintance';

export function canGenerateVoiceNote(stage: RelationshipStage): boolean {
  return rankOf(stage) >= rankOf(VOICE_UNLOCK_FLOOR);
}

// ── Portrait angles ──────────────────────────────────────────────────────
//
// Only the closer/more personal framings are gated — 'portrait',
// 'full_body', and 'selfie' stay available from stranger onward (unchanged
// behavior, matches the existing "casual creator/user, no friction" chat-
// photo flow the second audit doc already praised). 'close_up' and
// 'over_shoulder' read as a level of visual closeness that hasn't been
// earned yet below 'friend'. Deliberately independent of the mature/NSFW
// gate (checkMatureContentAccess) — this is about relationship depth, not
// content rating; the two can and do apply at the same time.
const INTIMATE_ANGLES = new Set(['close_up', 'over_shoulder']);
const INTIMATE_ANGLE_FLOOR: RelationshipStage = 'friend';

type Angle = 'portrait' | 'full_body' | 'close_up' | 'over_shoulder' | 'selfie';

export function isAngleUnlocked(stage: RelationshipStage, angle: Angle | undefined): boolean {
  if (!angle || !INTIMATE_ANGLES.has(angle)) return true;
  return rankOf(stage) >= rankOf(INTIMATE_ANGLE_FLOOR);
}

/**
 * Downgrades a locked angle to the safe, always-unlocked default rather
 * than hard-failing the whole photo request — a photo is still sent, just
 * not framed the way that hasn't been earned yet, in keeping with
 * secret-tier-engine's own preference for graceful degradation over a
 * hard error on a single locked element of a larger request.
 */
export function clampAngleToStage(stage: RelationshipStage, angle: Angle | undefined): Angle | undefined {
  return isAngleUnlocked(stage, angle) ? angle : 'portrait';
}
