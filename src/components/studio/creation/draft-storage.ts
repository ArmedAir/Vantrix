import { emptyDraft, STAGES, type CharacterDraft, type StageId } from "./types";

/**
 * Client-side draft persistence for the Character Creation Studio.
 *
 * The wizard collects up to 7 stages of substantive creative work
 * (personality, psychology, voice, appearance, seed memories) before a
 * single POST /api/characters call — which is also the moment
 * CHARACTER_CREATION_COST tokens are charged (see preview-stage.tsx).
 * Until that submit, everything lived in plain useState with nothing
 * backing it: a refresh, an accidental tab close, or a crash mid-wizard
 * silently discarded real, sometimes-lengthy creative work with no way
 * back. For a flow that ultimately produces a monetizable asset, losing
 * a creator's draft is a real cost, not just an inconvenience — so this
 * mirrors the localStorage-persistence pattern already used elsewhere in
 * the app (shell-store.ts's sidebar state, admin-sidebar.tsx's rail
 * width, use-daily-choice.ts's vote fallback) rather than introducing a
 * new persistence mechanism.
 *
 * Deliberately client-only (no new `character_drafts` table / API route):
 * nothing here is billed, moderated, or has a server-side identity yet —
 * it's pre-submission scratch state, which is exactly what localStorage
 * is for elsewhere in this codebase. Scoped per-user (see draftStorageKey)
 * so a shared/public browser can't resurrect one account's in-progress
 * character into another account's wizard.
 */

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = "vantrix-creation-draft";

export interface DraftSnapshot {
  version: number;
  savedAt: string; // ISO — feeds timeAgo() in the resume banner
  activeStage: StageId;
  furthestIndex: number;
  draft: CharacterDraft;
}

export function draftStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

/**
 * True once the draft holds something a creator would be upset to lose —
 * i.e. more than the untouched defaults from emptyDraft(). Gates both
 * whether autosave bothers writing at all and whether a saved draft is
 * worth surfacing a resume banner for; a draft that's still just "female,
 * age 24, romance" isn't worth interrupting a fresh session over.
 */
export function isMeaningfulDraft(draft: CharacterDraft): boolean {
  return (
    draft.name.trim().length > 0 ||
    draft.description.trim().length > 0 ||
    draft.personality.trim().length > 0 ||
    draft.archetype.trim().length > 0 ||
    draft.backstory.trim().length > 0 ||
    draft.scenario.trim().length > 0 ||
    !!draft.imageUrl ||
    draft.memories.length > 0
  );
}

const VALID_STAGE_IDS = new Set<string>(STAGES.map((s) => s.id));

/**
 * Defensive parse — never throws. Merges onto a fresh emptyDraft() rather
 * than trusting the stored shape wholesale, so a draft saved by an older
 * build (before a field was added to CharacterDraft) still loads with
 * sane defaults for whatever's new, instead of crashing the wizard or
 * shipping `undefined` into a controlled input.
 */
export function parseSavedDraft(raw: string | null): DraftSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<DraftSnapshot>;
  if (p.version !== STORAGE_VERSION) return null;
  if (typeof p.savedAt !== "string") return null;
  if (!p.draft || typeof p.draft !== "object") return null;

  const activeStage = VALID_STAGE_IDS.has(p.activeStage as string) ? (p.activeStage as StageId) : "concept";
  const furthestIndex = Number.isFinite(p.furthestIndex) ? Math.max(0, Math.floor(p.furthestIndex as number)) : 0;

  const merged: CharacterDraft = { ...emptyDraft(), ...(p.draft as Partial<CharacterDraft>) };
  if (!isMeaningfulDraft(merged)) return null;

  return { version: STORAGE_VERSION, savedAt: p.savedAt, activeStage, furthestIndex, draft: merged };
}

export function serializeDraft(draft: CharacterDraft, activeStage: StageId, furthestIndex: number): string {
  const snapshot: DraftSnapshot = { version: STORAGE_VERSION, savedAt: new Date().toISOString(), activeStage, furthestIndex, draft };
  return JSON.stringify(snapshot);
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Private-browsing modes / disabled storage can throw on access, not
    // just on write — never let that break the wizard itself.
    return null;
  }
}

export function loadDraft(userId: string): DraftSnapshot | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    return parseSavedDraft(storage.getItem(draftStorageKey(userId)));
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: CharacterDraft, activeStage: StageId, furthestIndex: number): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(draftStorageKey(userId), serializeDraft(draft, activeStage, furthestIndex));
  } catch {
    // Quota exceeded or storage unavailable mid-session — the wizard's
    // in-memory state is untouched either way, so this is silent by
    // design rather than surfacing a scary error for a non-critical
    // convenience feature.
  }
}

export function clearDraft(userId: string): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(draftStorageKey(userId));
  } catch {
    // Nothing actionable if removal fails — worst case a stale draft
    // lingers and gets offered again next visit.
  }
}
