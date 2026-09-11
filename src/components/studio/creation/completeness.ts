import type { CharacterDraft, StageId } from "./types";

/**
 * Per-stage completeness — pure function, easy to test, no side effects.
 * Each stage is "done" once its load-bearing fields are filled; optional
 * flourishes (secrets, friends, daily routine…) don't gate the checkmark,
 * matching how forgiving the doc's own "readiness" meter is meant to feel
 * — a creator shouldn't be blocked from Preview by an empty "friends" tag
 * list.
 */
export function stageComplete(draft: CharacterDraft, stage: StageId): boolean {
  switch (stage) {
    case "concept":
      return draft.description.trim().length > 0;
    case "identity":
      return draft.name.trim().length > 0 && draft.description.trim().length >= 10;
    case "personality":
      return draft.personality.trim().length > 0 || draft.archetype.trim().length > 0;
    case "psychology":
      return draft.backstory.trim().length > 0;
    case "voice":
      return draft.speech_style.trim().length > 0;
    case "appearance":
      return !!draft.imageUrl;
    case "memory":
      return draft.memories.length > 0;
    case "preview":
      return false; // never "done" on its own — it's the destination, not a fillable stage
    default:
      return false;
  }
}

/** Overall completeness 0-100, weighted evenly across the 7 fillable stages (Preview excluded). */
export function overallCompleteness(draft: CharacterDraft): number {
  const fillable: StageId[] = ["concept", "identity", "personality", "psychology", "voice", "appearance", "memory"];
  const done = fillable.filter((s) => stageComplete(draft, s)).length;
  return Math.round((done / fillable.length) * 100);
}

/** True once the two hard requirements for actually creating the character are met. */
export function canPublish(draft: CharacterDraft): boolean {
  return (
    draft.name.trim().length > 0 &&
    draft.description.trim().length >= 10 &&
    !!draft.imageUrl
  );
}

export interface FundReadinessCheck {
  key: string;
  label: string;
  met: boolean;
}

export interface FundReadiness {
  checks: FundReadinessCheck[];
  metCount: number;
  total: number;
  score: number; // 0-100
}

/**
 * A second, separate bar from canPublish() — canPublish is the hard
 * minimum the API will accept; this is what actually predicts whether a
 * character can hold someone's attention once it's public and enrolled
 * in the Creator Fund (see lib/commerce/character-fund.ts). That program
 * pays out on *engagement-weighted* signals — returning conversations,
 * saves, follows, retention — not on the character merely existing, so a
 * character that clears canPublish with just a name/description/portrait
 * is legally publishable but has nothing in it yet that would make a
 * stranger come back a second time.
 *
 * Deliberately advisory, not a gate: nudging a creator toward more depth
 * before they spend the creation fee is worth doing in the UI, but
 * hard-blocking creation on it would be a real product/business decision
 * (and moderation/eligibility rules already live server-side) — this
 * stays a Preview-stage checklist, never wired into canPublish itself.
 */
export function fundReadiness(draft: CharacterDraft): FundReadiness {
  const checks: FundReadinessCheck[] = [
    {
      key: "personality",
      label: "Personality or archetype defined",
      met: draft.personality.trim().length > 0 || draft.archetype.trim().length > 0,
    },
    { key: "backstory", label: "Backstory written", met: draft.backstory.trim().length > 0 },
    { key: "voice", label: "Speech style set", met: draft.speech_style.trim().length > 0 },
    { key: "opening_line", label: "Opening line written", met: draft.opening_line.trim().length > 0 },
    { key: "memory", label: "At least one seed memory", met: draft.memories.length > 0 },
    {
      key: "portrait_locked",
      label: "Portrait generated and identity-locked",
      met: !!draft.imageUrl && draft.identity_locked,
    },
  ];
  const metCount = checks.filter((c) => c.met).length;
  return { checks, metCount, total: checks.length, score: Math.round((metCount / checks.length) * 100) };
}
