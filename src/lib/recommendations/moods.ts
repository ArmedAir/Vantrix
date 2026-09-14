// src/lib/recommendations/moods.ts
// ─────────────────────────────────────────────────────────────────────────────
// User-facing "how are you feeling right now?" moods for the Discover mood
// picker — distinct from a character's own evolving character_mood in
// dating_matches (see lib/dating/engine.ts). Split into this tiny file
// (rather than living in recommendations/engine.ts) specifically so
// client components can import the type/list without pulling in
// engine.ts's supabaseAdmin/server-only dependencies into the client
// bundle.
// ─────────────────────────────────────────────────────────────────────────────

export const USER_MOODS = [
  'playful', 'romantic', 'comforted', 'adventurous', 'intellectual', 'relaxed',
] as const;

export type UserMood = (typeof USER_MOODS)[number];

export function isUserMood(v: unknown): v is UserMood {
  return typeof v === 'string' && (USER_MOODS as readonly string[]).includes(v);
}

/** Short label + emoji for the mood picker UI. */
export const MOOD_LABELS: Record<UserMood, { label: string; emoji: string }> = {
  playful:      { label: 'Playful',      emoji: '😄' },
  romantic:     { label: 'Romantic',     emoji: '💕' },
  comforted:    { label: 'Comforted',    emoji: '🤗' },
  adventurous:  { label: 'Adventurous',  emoji: '🚀' },
  intellectual: { label: 'Intellectual', emoji: '🧠' },
  relaxed:      { label: 'Relaxed',      emoji: '😌' },
};

/**
 * MOOD-TAGS-SHARE FIX: this was previously a private `MOOD_TAG_MAP` inside
 * recommendations/engine.ts (server-only — pulls in supabaseAdmin) with no
 * client-safe equivalent, so nothing outside the personalized /api/
 * recommendations pipeline could filter or boost by the same vocabulary.
 * Moved here (this file is deliberately dependency-free — see header
 * comment) and re-exported so both the personalized recommender and any
 * client-side "filter by vibe" UI stay on the exact same tag list rather
 * than maintaining two copies that quietly drift apart. engine.ts now
 * imports this instead of defining its own.
 */
export const MOOD_TAGS: Record<UserMood, string[]> = {
  playful:       ['playful', 'funny', 'flirty', 'tease', 'archetype:tsundere', 'archetype:girl-next-door'],
  romantic:      ['romantic', 'affectionate', 'sweet', 'archetype:girlfriend', 'archetype:soulmate'],
  comforted:     ['caring', 'warm', 'gentle', 'supportive', 'archetype:caretaker', 'archetype:mom-friend'],
  adventurous:   ['adventurous', 'bold', 'spontaneous', 'archetype:adventurer', 'archetype:free-spirit'],
  intellectual:  ['intellectual', 'witty', 'deep', 'curious', 'archetype:mentor', 'archetype:nerd'],
  relaxed:       ['chill', 'calm', 'laid-back', 'cozy', 'archetype:best-friend'],
};
