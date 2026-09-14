/**
 * Voice Library — Vantrix
 *
 * Single source of truth for "which real ElevenLabs voice does this
 * character actually sound like." Zero imports — safe in both server
 * (digital-person-bootstrap.ts, voice/tts route) and client (Studio's
 * voice picker) bundles.
 *
 * BEFORE THIS MODULE: /api/voice/tts had exactly 3 hardcoded voices
 * (Rachel/Adam/Bella) keyed only by a `gender` bucket, and the client
 * never even sent `gender` — so in practice every character in the app,
 * regardless of who they were, was voiced as "Rachel." voice_profile
 * (pitch/pace/warmth) only shaped stability/style on top of that one
 * shared voice; it never changed WHICH voice was speaking. This module
 * is what actually gives each character a distinct, real voice identity.
 *
 * IDs are ElevenLabs' classic premade-voice-library IDs — the same
 * family as the 3 already hardcoded elsewhere in this codebase before
 * this change, cross-checked against ElevenLabs' current voice docs as
 * of this writing. Voice availability can still vary by ElevenLabs
 * account/plan and IDs can be deprecated on their end — if a stored ID
 * ever 404s, /api/voice/tts already fails open to the Web Speech
 * fallback (see that route's circuit-breaker path), so a stale ID
 * degrades gracefully rather than breaking voice messages outright.
 * Sanity-check against GET https://api.elevenlabs.io/v1/voices for your
 * account before relying on this list in production.
 */

import type { CharacterRoleKey } from './character-role';
import { selectRoleAwareCandidates } from './character-role';

export interface VoiceLibraryEntry {
  id:          string;   // ElevenLabs voice_id
  name:        string;   // display name in the Studio picker
  gender:      'female' | 'male' | 'anime';
  description: string;   // one-line timbre/energy hint, shown next to the name
  // ROLE-CONSCIOUS VOICE FIX (2026-09-14): which of writing-style.ts's five
  // role presets (character-role.ts's CharacterRoleKey) this voice's own
  // timbre/energy actually reads as, derived from `description` above —
  // Rachel's "calm, warm, even-paced" is a companion or professor voice,
  // not a gamer one, and pretending otherwise (or ignoring role entirely,
  // as this list did before) produces a technically-unique but
  // tonally-wrong pairing. Every entry gets at least one tag; none are
  // empty, so untagged/"any role" fallback (see selectRoleAwareCandidates)
  // never actually triggers for this curated list today, but the
  // mechanism supports it for future entries added without a clear tag.
  roles:       readonly CharacterRoleKey[];
}

// GENDER-BUCKET FIX: these three pools are now strictly non-overlapping —
// no ID appears in more than one bucket. Previously 'anime' had no pool of
// its own at all (resolveVoiceId collapsed it into 'female'), so every
// anime character was voiced from the same pool as female characters.
// Anime now gets its own two IDs (Bella, Elli — the brighter/younger-
// reading voices), removed from the female pool so the pools never cross.
export const VOICE_LIBRARY: readonly VoiceLibraryEntry[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',  gender: 'female', description: 'Calm, warm, even-paced — natural narrator', roles: ['companion', 'professor'] },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi',    gender: 'female', description: 'Strong, confident, energetic', roles: ['gamer', 'girl_next_door'] },
  { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', gender: 'female', description: 'Pleasant, precise, articulate', roles: ['professor', 'poet'] },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',   gender: 'anime',  description: 'Soft, youthful, friendly', roles: ['girl_next_door', 'companion'] },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli',    gender: 'anime',  description: 'Emotional, expressive, gentle', roles: ['companion', 'poet'] },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',    gender: 'male',   description: 'Deep, rich, grounded', roles: ['professor', 'poet'] },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni',  gender: 'male',   description: 'Well-rounded, warm, professional', roles: ['companion', 'professor'] },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold',  gender: 'male',   description: 'Crisp, confident, assured', roles: ['gamer', 'professor'] },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh',    gender: 'male',   description: 'Deep, authoritative, steady', roles: ['professor', 'poet'] },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam',     gender: 'male',   description: 'Raspy, casual, easygoing', roles: ['gamer', 'companion'] },
] as const;

export function voiceLibraryEntry(id: string | null | undefined): VoiceLibraryEntry | undefined {
  if (!id) return undefined;
  return VOICE_LIBRARY.find(v => v.id === id);
}

export type VoiceGenderBucket = 'female' | 'male' | 'anime';

export const VOICE_LIBRARY_BY_GENDER: Record<VoiceGenderBucket, readonly VoiceLibraryEntry[]> = {
  female: VOICE_LIBRARY.filter(v => v.gender === 'female'),
  male:   VOICE_LIBRARY.filter(v => v.gender === 'male'),
  anime:  VOICE_LIBRARY.filter(v => v.gender === 'anime'),
};

/**
 * Gender-bucket fallback used only when a character has no
 * elevenlabs_voice_id of its own yet (pre-migration rows that haven't
 * been backfilled, or a request that arrives before bootstrap finishes).
 */
export const DEFAULT_ELEVENLABS_VOICE_IDS: Record<VoiceGenderBucket, string> = {
  female: '21m00Tcm4TlvDq8ikWAM', // Rachel
  male:   'pNInz6obpgDQGcFmaJgB', // Adam
  anime:  'EXAVITQu4vr4xnSDxMaL', // Bella
};

function normalizeGenderBucket(gender: string | null | undefined): VoiceGenderBucket {
  if (gender === 'male') return 'male';
  if (gender === 'anime') return 'anime';
  return 'female'; // covers 'female', 'other', and anything unrecognized
}

/**
 * UNIQUE-VOICE FIX: this used to be `resolveVoiceId(archetypeKey, gender)`,
 * a pure/synchronous function returning one FIXED id per
 * (archetype, gender) pair — 5 archetypes × 2 gender buckets (anime wasn't
 * even a bucket) = at most 10 possible outcomes, shared identically across
 * every character that matched the same archetype+gender combo. A "companion"
 * female character and every other "companion" female character all got
 * Elli, forever — voices were never actually unique to a character, and
 * anime characters were silently voiced from the female pool.
 *
 * Fixed on two axes:
 *   1. Strict gender bucketing — pulls only from that gender's own pool
 *      (VOICE_LIBRARY_BY_GENDER), so male/female/anime can never cross.
 *   2. Least-used-first assignment — queries how many existing characters
 *      in that same bucket already hold each candidate id and picks the
 *      one currently used by the fewest characters (ties broken by a
 *      stable hash of the character id, not array order, so ties don't
 *      all pile onto the same first entry). This spreads real, in-use
 *      characters as evenly as possible across the whole pool instead of
 *      clustering on one archetype-locked id — voices only repeat once
 *      every id in the bucket is already equally represented, rather than
 *      by construction.
 *
 * ROLE-CONSCIOUS VOICE FIX (2026-09-14): the above two axes made voices
 * unique and gender-correct, but completely blind to WHO the character
 * is — a brooding poet and a hyperactive gamer of the same gender were
 * exactly as likely to land on the same voice, because "role" was never
 * consulted at all after the archetype-locked table above was removed.
 * This reintroduces role — but as a PREFERENCE within the existing
 * gender-bucketed, least-used-first mechanism, not a return to a fixed
 * lookup table:
 *   3. Role narrowing (character-role.ts's selectRoleAwareCandidates) —
 *      within the gender bucket, prefer entries whose `roles` include
 *      this character's own resolved role (see digital-person-
 *      bootstrap.ts / character-role.ts), falling back to untagged
 *      entries, then the full gender bucket, if nothing matches. This
 *      preference is applied BEFORE least-used-first below, so
 *      uniqueness-across-characters is still enforced on whatever set
 *      role-narrowing produced — a role never collapses back to a single
 *      fixed id the way the old table did, because least-used-first still
 *      spreads assignments across every voice tagged for that role.
 *
 * Still bounded by pool size (3 female / 5 male / 2 anime real, verified
 * ElevenLabs ids) — with more characters than ids in a bucket, exact
 * global uniqueness isn't physically possible with a fixed premade-voice
 * pool. See this file's header re: pulling a larger live library from
 * GET https://api.elevenlabs.io/v1/voices if/when more distinct ids are
 * needed per bucket.
 */
export async function resolveVoiceId(
  supabase: { from: (table: string) => any },
  characterId: string,
  gender: string | null | undefined,
  role?: CharacterRoleKey | null,
): Promise<string> {
  const bucket = normalizeGenderBucket(gender);
  const genderPool = VOICE_LIBRARY_BY_GENDER[bucket];
  const pool = selectRoleAwareCandidates(genderPool, role);

  try {
    const { data } = await supabase
      .from('characters')
      .select('elevenlabs_voice_id')
      .in('elevenlabs_voice_id', pool.map((v) => v.id));

    const counts = new Map<string, number>(pool.map((v) => [v.id, 0]));
    for (const row of (data ?? []) as { elevenlabs_voice_id: string | null }[]) {
      if (row.elevenlabs_voice_id && counts.has(row.elevenlabs_voice_id)) {
        counts.set(row.elevenlabs_voice_id, (counts.get(row.elevenlabs_voice_id) ?? 0) + 1);
      }
    }

    const minCount = Math.min(...counts.values());
    const leastUsed = pool.filter((v) => counts.get(v.id) === minCount);

    // Stable tie-break across an arbitrary number of equally-least-used
    // candidates, keyed on the new character's own id so it's
    // deterministic (same character always resolves the same way if this
    // ever needs to be recomputed) without every tie collapsing onto
    // whichever entry happens to be first in the array.
    let hash = 0;
    for (let i = 0; i < characterId.length; i++) {
      hash = (hash * 31 + characterId.charCodeAt(i)) >>> 0;
    }
    return leastUsed[hash % leastUsed.length].id;
  } catch {
    // DB read failed — fail open to the plain default for this bucket
    // rather than blocking character creation on a voice-assignment query.
    return DEFAULT_ELEVENLABS_VOICE_IDS[bucket];
  }
}
