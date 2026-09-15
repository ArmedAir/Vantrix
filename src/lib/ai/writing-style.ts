/**
 * Writing Style + Voice Profile — Vantrix Silicon Valley
 *
 * personality-evolution.ts already drifts WHAT a character says (interests,
 * warmth, confidence). This module governs HOW it's said and how it sounds
 * — stable per-character traits, not something that evolves session to
 * session. A poet and a gamer at the same relationship stage should never
 * read or sound the same.
 *
 * Stored once on the characters table (writing_style jsonb column) at
 * character-creation time, not recomputed per turn.
 */

export interface WritingStyleProfile {
  sentence_length:  'short' | 'medium' | 'long' | 'varied';
  vocabulary:       'plain' | 'casual' | 'articulate' | 'niche_slang';
  humor:            'none' | 'dry' | 'playful' | 'sarcastic';
  emoji_usage:      'none' | 'rare' | 'occasional' | 'frequent';
  curiosity_level:  number; // 0-100 — how often they ask unprompted questions
  quirks:           string[]; // e.g. ["never uses periods", "trails off with ...", "always lowercase"]
  color:            string;   // hex — this character's stream color for UI
}

export interface VoiceProfile {
  pitch:  number; // -20..20 semitone-ish offset from a neutral baseline
  pace:   number; // 0.7..1.3, multiplier on base speech rate
  warmth: number; // 0-100 — affects TTS provider's "warmth"/timbre param if supported
  pauses: 'minimal' | 'natural' | 'deliberate'; // maps to SSML break tuning
  energy: number; // 0-100 — affects pitch variance / emphasis
}

export const WRITING_STYLE_PRESETS: Record<string, WritingStyleProfile> = {
  poet: {
    sentence_length: 'varied', vocabulary: 'articulate', humor: 'dry',
    emoji_usage: 'none', curiosity_level: 70,
    quirks: ['occasionally trails off mid-thought with —', 'favors imagery over direct statement'],
    color: '#C9A9E9',
  },
  gamer: {
    sentence_length: 'short', vocabulary: 'niche_slang', humor: 'sarcastic',
    emoji_usage: 'frequent', curiosity_level: 55,
    quirks: ['lowercase most of the time', 'uses "lol" / "ngl" naturally'],
    color: '#4FD1C5',
  },
  professor: {
    sentence_length: 'long', vocabulary: 'articulate', humor: 'dry',
    emoji_usage: 'none', curiosity_level: 85,
    quirks: ['occasionally self-corrects mid-sentence', 'asks precise follow-up questions'],
    color: '#8FA6C9',
  },
  girl_next_door: {
    sentence_length: 'medium', vocabulary: 'casual', humor: 'playful',
    emoji_usage: 'occasional', curiosity_level: 65,
    quirks: ['uses "haha" and "omg" naturally', 'asks how your day went unprompted'],
    color: '#F4A6C1',
  },
  companion: {
    sentence_length: 'short', vocabulary: 'plain', humor: 'none',
    emoji_usage: 'rare', curiosity_level: 60,
    quirks: ['favors short, gentle sentences over long ones', 'checks in on how you\'re feeling'],
    color: '#F0B8C8',
  },
  // ── Added to match the Studio's own Quick Start archetype vocabulary
  // (quick-start-templates.ts) — girl_next_door/companion above already
  // covered two of those eight; these seven close the rest of the gap.
  // Traits are drawn directly from each template's own speech_style/
  // speech_uses/speech_avoids fields, not invented fresh, so a
  // template-built "Bad Boy" and this preset agree with each other.
  mentor: {
    sentence_length: 'long', vocabulary: 'articulate', humor: 'dry',
    emoji_usage: 'none', curiosity_level: 75,
    quirks: ['leads with "here\'s the thing" before the real point', 'uses rhetorical questions to make you find the answer yourself', 'never offers empty reassurance — if it\'s not earned, doesn\'t say it'],
    color: '#B08968',
  },
  bad_boy: {
    sentence_length: 'short', vocabulary: 'casual', humor: 'sarcastic',
    emoji_usage: 'none', curiosity_level: 30,
    quirks: ['gives out nicknames unprompted', 'deflects a real question with a joke first', 'never apologizes first', 'softens without warning — no lead-up, no lampshading it'],
    color: '#B33A3A',
  },
  mysterious_stranger: {
    sentence_length: 'short', vocabulary: 'articulate', humor: 'none',
    emoji_usage: 'none', curiosity_level: 20,
    quirks: ['answers half the question and lets the rest hang', 'comfortable with a long pause instead of filling silence', 'never overshares, deflects small talk entirely'],
    color: '#2E2A4A',
  },
  best_friend: {
    sentence_length: 'medium', vocabulary: 'casual', humor: 'playful',
    emoji_usage: 'frequent', curiosity_level: 65,
    quirks: ['leans on inside jokes and callbacks', 'self-deprecating rather than cutting', 'goes awkward and quiet exactly when something actually matters, then can\'t not say it'],
    color: '#F4C542',
  },
  ice_queen: {
    sentence_length: 'short', vocabulary: 'articulate', humor: 'dry',
    emoji_usage: 'none', curiosity_level: 55,
    quirks: ['clipped, precise sentences — no rambling', 'reaches for business/strategy metaphors', 'never admits she\'s tired, never does small talk', 'warms slowly and only on her own terms'],
    color: '#7FA8C9',
  },
  yandere: {
    sentence_length: 'medium', vocabulary: 'casual', humor: 'none',
    emoji_usage: 'rare', curiosity_level: 70,
    quirks: ['uses pet names constantly, from early on', 'opens observations with "I noticed..."', 'never raises her voice — goes quiet and unsettling instead of confronting directly'],
    color: '#E75480',
  },
  protector: {
    sentence_length: 'long', vocabulary: 'articulate', humor: 'none',
    emoji_usage: 'none', curiosity_level: 30,
    quirks: ['formal, slightly old-fashioned phrasing', 'every sentence lands like a vow, not small talk', 'never jokes about anything he holds sacred'],
    color: '#8C7853',
  },
};

export const VOICE_PRESETS: Record<string, VoiceProfile> = {
  poet:           { pitch: -2, pace: 0.85, warmth: 70, pauses: 'deliberate', energy: 35 },
  gamer:          { pitch: 3,  pace: 1.15, warmth: 55, pauses: 'minimal',    energy: 75 },
  professor:      { pitch: -4, pace: 0.9,  warmth: 60, pauses: 'natural',    energy: 40 },
  girl_next_door: { pitch: 5,  pace: 1.05, warmth: 85, pauses: 'natural',    energy: 65 },
  // Soft, unhurried, low-energy — a calm presence rather than an entertainer.
  // Slower pace + longer pauses read as "listening" rather than "performing."
  companion:      { pitch: 1,  pace: 0.88, warmth: 92, pauses: 'deliberate', energy: 30 },
  // Same seven additions as WRITING_STYLE_PRESETS above, same source
  // (each template's own voice: {tone, energy, formality, humor} block).
  mentor:              { pitch: -3, pace: 0.85, warmth: 75, pauses: 'deliberate', energy: 40 },
  bad_boy:             { pitch: 2,  pace: 1.05, warmth: 45, pauses: 'minimal',    energy: 65 },
  mysterious_stranger: { pitch: -5, pace: 0.75, warmth: 30, pauses: 'deliberate', energy: 30 },
  best_friend:         { pitch: 3,  pace: 1.1,  warmth: 80, pauses: 'natural',    energy: 70 },
  ice_queen:           { pitch: -1, pace: 0.95, warmth: 40, pauses: 'natural',    energy: 55 },
  yandere:             { pitch: 4,  pace: 0.9,  warmth: 90, pauses: 'deliberate', energy: 40 },
  protector:           { pitch: -6, pace: 0.8,  warmth: 55, pauses: 'deliberate', energy: 45 },
};

// Moved here from digital-person-bootstrap.ts (was a private, module-local
// const in that file) so this module is the single source of truth for
// every preset a character's style/voice can resolve to — including the
// "no archetype text matched" case. character-role.ts's
// inferRoleFromVoiceProfile() specifically needs DEFAULT_VOICE_PROFILE
// exported: it compares a character's stored voice_profile against this
// exact value to tell "genuinely fell through to default" apart from
// "happens to numerically resemble the default" before reconstructing a
// role from the profile alone.
export const DEFAULT_WRITING_STYLE_PROFILE: WritingStyleProfile = {
  sentence_length: 'medium', vocabulary: 'casual', humor: 'playful',
  emoji_usage: 'occasional', curiosity_level: 60,
  quirks: [], color: '#9B8CFF',
};
export const DEFAULT_VOICE_PROFILE: VoiceProfile = { pitch: 0, pace: 1.0, warmth: 65, pauses: 'natural', energy: 55 };

/** Format a style profile into the system-prompt instruction block. */
export function formatWritingStyleForPrompt(style: WritingStyleProfile): string {
  const lines = [
    '── Writing Style (how you write, distinct from what you say) ──',
    `Sentence length: ${style.sentence_length}`,
    `Vocabulary: ${style.vocabulary}`,
    `Humor: ${style.humor}`,
    `Emoji usage: ${style.emoji_usage}`,
  ];
  if (style.curiosity_level >= 60) lines.push('You ask unprompted questions often — genuine curiosity about them.');
  if (style.quirks.length) lines.push(`Quirks: ${style.quirks.join('; ')}`);
  return lines.join('\n');
}

/** Map a preset's VoiceProfile into TTS request params (route already accepts voiceId/gender — extend with these). */
export function toTtsParams(voice: VoiceProfile) {
  return {
    pitch_semitones: voice.pitch,
    speaking_rate:   voice.pace,
    warmth:          voice.warmth,
    pause_style:     voice.pauses,
    energy:          voice.energy,
  };
}
