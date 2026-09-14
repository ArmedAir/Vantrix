/**
 * character-role.ts — Shared "role" classification for character voice
 *
 * SINGLE SOURCE OF TRUTH for what a character's "role" is, in the specific
 * sense that matters for voice assignment. Three call sites used to each
 * carry their own copy of this idea (or none at all):
 *
 *   1. digital-person-bootstrap.ts's selectPreset() already matched a new
 *      character's personality/backstory/occupation/category text against
 *      five patterns to pick its WritingStyleProfile + VoiceProfile
 *      (writing-style.ts) — but that match happened in a private, inline
 *      array, and the result was used ONLY for style/tuning, never passed
 *      to resolveVoiceId/resolveVoiceStudioVoiceId. Moved here so it has
 *      one home and can be reused instead of re-derived or ignored.
 *
 *   2. voice-library.ts / voicestudio-voice-library.ts now call
 *      resolveCharacterRole() at CREATE time (personality/backstory text
 *      is on hand) so the literal voice-pool pick can prefer an entry
 *      actually tagged for this character's role, not just their gender.
 *
 *   3. voicestudio-voice-library.ts's LAZY BACKFILL path — a pre-existing
 *      character reaching /api/voice/tts with no voicestudio_voice_id yet
 *      — has no personality/backstory text in hand (that route selects
 *      voice_profile, not the raw text columns, and re-fetching the text
 *      just for this would be a wasted round trip on every such request).
 *      That path instead calls inferRoleFromVoiceProfile() on the
 *      character's ALREADY-SELECTED voice_profile column — the numeric
 *      pitch/pace/warmth/energy tuple selectPreset() stored at creation
 *      FROM this exact role match — and finds the nearest of the five
 *      VOICE_PRESETS by distance. This reconstructs the original role
 *      signal from data already paid for, rather than taking a second,
 *      independent (and possibly contradictory) guess at it.
 *
 * CharacterRoleKey is derived from VOICE_PRESETS's own keys
 * (`keyof typeof VOICE_PRESETS`) instead of being redeclared — adding a
 * sixth preset to writing-style.ts automatically becomes a valid role
 * here with zero risk of the two lists silently drifting apart.
 */

import {
  VOICE_PRESETS,
  DEFAULT_VOICE_PROFILE,
  type VoiceProfile,
} from './writing-style';

export type CharacterRoleKey = keyof typeof VOICE_PRESETS;

export const CHARACTER_ROLE_KEYS = Object.keys(VOICE_PRESETS) as CharacterRoleKey[];

export function isCharacterRoleKey(value: string): value is CharacterRoleKey {
  return (CHARACTER_ROLE_KEYS as readonly string[]).includes(value);
}

// ── Layer 1: text → role, at character-creation time ───────────────────────
// Moved verbatim from digital-person-bootstrap.ts's old inline `rules`
// array — same five patterns, same order (first match wins), just given a
// name other modules can import instead of re-declaring their own copy.
const ROLE_RULES: ReadonlyArray<[RegExp, CharacterRoleKey]> = [
  [/poet|writer|novelist|literary/, 'poet'],
  [/gam(er|ing)|streamer|esports/, 'gamer'],
  [/professor|academic|research|scientist|teacher/, 'professor'],
  [/girl.?next.?door|sweet|bubbly|cheerful/, 'girl_next_door'],
  [/companion|devoted|caring|nurtur|gentle|soothing|comfort/, 'companion'],
];

export interface CharacterRoleTextInput {
  personality?: string | null;
  backstory?:   string | null;
  occupation?:  string | null;
  category?:    string | null;
}

/** Returns null (not a fallback key) when nothing matches — "no strong role
 *  signal" is a real, distinct outcome from any of the five named roles,
 *  and callers (voice resolvers, selectPreset) each decide their own
 *  no-role default rather than this function guessing one for them. */
export function resolveCharacterRole(input: CharacterRoleTextInput): CharacterRoleKey | null {
  const text = `${input.personality ?? ''} ${input.backstory ?? ''} ${input.occupation ?? ''} ${input.category ?? ''}`.toLowerCase();
  for (const [pattern, key] of ROLE_RULES) {
    if (pattern.test(text)) return key;
  }
  return null;
}

// ── Layer 2: stored VoiceProfile → nearest role, for the lazy-backfill call
// site that only has the already-resolved numeric profile on hand, not the
// original text. ─────────────────────────────────────────────────────────

const NUMERIC_AXES = ['pitch', 'pace', 'warmth', 'energy'] as const;
type NumericAxis = (typeof NUMERIC_AXES)[number];

// Normalize each axis by the actual spread the five presets + the default
// span, rather than hardcoded magic numbers — if a preset's numbers ever
// change, this range recomputes itself instead of silently going stale.
const AXIS_RANGE: Record<NumericAxis, { min: number; max: number }> = (() => {
  const all: VoiceProfile[] = [DEFAULT_VOICE_PROFILE, ...Object.values(VOICE_PRESETS)];
  const ranges = {} as Record<NumericAxis, { min: number; max: number }>;
  for (const axis of NUMERIC_AXES) {
    const values = all.map(v => v[axis]);
    ranges[axis] = { min: Math.min(...values), max: Math.max(...values) };
  }
  return ranges;
})();

function normalizedDistance(a: VoiceProfile, b: VoiceProfile): number {
  let sumSq = 0;
  for (const axis of NUMERIC_AXES) {
    const { min, max } = AXIS_RANGE[axis];
    const span = max - min || 1; // guard divide-by-zero if a range ever collapses to one value
    const diff = (a[axis] - b[axis]) / span;
    sumSq += diff * diff;
  }
  // 'pauses' is categorical (minimal/natural/deliberate), not part of the
  // same normalized numeric space — a coarse flat penalty when they differ
  // is enough to matter for close numeric calls without dominating them.
  if (a.pauses !== b.pauses) sumSq += 0.15;
  return Math.sqrt(sumSq);
}

/**
 * Reconstructs which role a character's VoiceProfile most resembles,
 * without re-reading the personality/backstory text that originally
 * produced it.
 *
 * Returns null if the profile IS DEFAULT_VOICE_PROFILE — meaning no role
 * matched at creation time, nothing to reconstruct — so callers fail open
 * to "no role preference" instead of fabricating a false-confidence match
 * against whichever preset happens to be numerically nearest an arbitrary
 * default.
 */
export function inferRoleFromVoiceProfile(profile: VoiceProfile | null | undefined): CharacterRoleKey | null {
  if (!profile) return null;

  const isDefault =
    NUMERIC_AXES.every(axis => profile[axis] === DEFAULT_VOICE_PROFILE[axis]) &&
    profile.pauses === DEFAULT_VOICE_PROFILE.pauses;
  if (isDefault) return null;

  let bestKey: CharacterRoleKey | null = null;
  let bestDistance = Infinity;
  for (const key of CHARACTER_ROLE_KEYS) {
    const distance = normalizedDistance(profile, VOICE_PRESETS[key]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestKey = key;
    }
  }
  return bestKey;
}

// ── Shared role-aware candidate narrowing ───────────────────────────────────
// Used by both voice-library.ts (ElevenLabs) and voicestudio-voice-library.ts
// (VoiceStudio) so the two providers apply the identical cascade instead of
// two hand-rolled, potentially-diverging copies.

export interface RoleTaggedEntry {
  roles: readonly CharacterRoleKey[];
}

/**
 * Three-tier cascade, each tier only consulted if the previous one is
 * empty — same "fails open" shape as the existing gender-bucket fallback
 * in both voice-library.ts and voicestudio-voice-library.ts:
 *   1. Entries explicitly tagged for this role.
 *   2. Untagged entries (roles: []) — "usable for any role," the same
 *      convention voicestudio-voice-library.ts already uses for an
 *      untagged gender.
 *   3. The whole input pool, if neither tier above produced anything —
 *      e.g. an operator's VoiceStudio pool that only tags gender, never
 *      role. A role-conscious pick is preferred, never required, so a
 *      character never goes without a voice merely because nothing in
 *      the pool happens to be tagged for their role.
 */
export function selectRoleAwareCandidates<T extends RoleTaggedEntry>(
  pool: readonly T[],
  role: CharacterRoleKey | null | undefined,
): readonly T[] {
  if (!role || pool.length === 0) return pool;

  const exact = pool.filter(entry => entry.roles.includes(role));
  if (exact.length > 0) return exact;

  const untagged = pool.filter(entry => entry.roles.length === 0);
  if (untagged.length > 0) return untagged;

  return pool;
}
