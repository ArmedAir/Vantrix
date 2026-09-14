/**
 * VoiceStudio Voice Library — Vantrix
 *
 * Same purpose as src/lib/ai/voice-library.ts, for the self-hosted
 * VoiceStudio fallback tier (src/lib/voice/voicestudio-tts.ts) instead of
 * ElevenLabs: gives each character a distinct, real VoiceStudio voice
 * profile id, instead of every character sharing one flat
 * VOICESTUDIO_DEFAULT_VOICE whenever the app falls through to that tier.
 *
 * WHY THIS CAN'T HARDCODE A FIXED ID TABLE THE WAY voice-library.ts DOES:
 * ElevenLabs' premade-voice-library ids (Rachel, Adam, ...) are the same
 * for every ElevenLabs account, so voice-library.ts can ship a fixed,
 * curated list. VoiceStudio has no equivalent universal catalog — its
 * voice profiles are whatever the operator has cloned or designed on
 * their own self-hosted instance (see VoiceStudio's Voice Cloning / Voice
 * Design / Model Catalogue). This module instead reads that instance's
 * actual available profiles from VOICESTUDIO_VOICE_POOL (a deploy-time env
 * var the operator fills in with their own instance's real voice ids), and
 * applies the same least-used-first assignment strategy voice-library.ts
 * uses for ElevenLabs.
 *
 * ROLE-CONSCIOUS VOICE FIX (2026-09-14): the pool format now has a third,
 * optional segment for role tags, on top of the existing id/gender —
 *   VOICESTUDIO_VOICE_POOL format: comma-separated entries, each
 *     id[:gender][:role1|role2|...]
 *   e.g.
 *     VOICESTUDIO_VOICE_POOL="narrator_warm:female:companion|professor,deep_calm:male:professor|poet,bright_anime:anime:girl_next_door,house_voice"
 *   - `:gender` is optional per entry — omitted, an entry is usable for
 *     any gender bucket (unchanged from before this fix).
 *   - `:role1|role2` is optional per entry and pipe-delimited when there's
 *     more than one — omitted, an entry is usable for any role. Role tags
 *     must be one of character-role.ts's five CharacterRoleKey values
 *     (poet / gamer / professor / girl_next_door / companion); an unknown
 *     tag is dropped rather than rejecting the whole entry, so a typo in
 *     the operator's env var degrades to "untagged for role" instead of
 *     silently losing the voice or crashing assignment.
 *   Both suffixes are purely additive and optional — an existing
 *     operator's `id` or `id:gender`-only pool string keeps working
 *     completely unchanged; nothing about this fix requires re-tagging an
 *     already-configured pool to keep functioning.
 * If the pool is empty/unset, every character falls back to
 * VOICESTUDIO_DEFAULT_VOICE (or 'default'), exactly as before this module
 * existed.
 */

import { env } from '@/env';
import {
  type CharacterRoleKey,
  isCharacterRoleKey,
  selectRoleAwareCandidates,
} from '@/lib/ai/character-role';

export type VoiceStudioGenderBucket = 'female' | 'male' | 'anime';

interface PoolEntry {
  id: string;
  gender: VoiceStudioGenderBucket | 'any';
  // ROLE-CONSCIOUS VOICE FIX (2026-09-14): parallels VoiceLibraryEntry's
  // `roles` in voice-library.ts. Empty array = untagged = usable for any
  // role, same "no suffix means any" convention `gender` above already
  // uses — see selectRoleAwareCandidates in character-role.ts for how
  // this is actually consulted.
  roles: CharacterRoleKey[];
}

function parsePoolUncached(raw: string | undefined): PoolEntry[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const [id, genderRaw, rolesRaw] = entry.split(':').map(s => s.trim());
      const gender: PoolEntry['gender'] =
        genderRaw === 'female' || genderRaw === 'male' || genderRaw === 'anime'
          ? genderRaw
          : 'any';
      // Unknown/misspelled role tags are silently dropped, not rejected —
      // consistent with this module's overall fail-open posture (see
      // resolveVoiceStudioVoiceId's own doc comment). A pool entry an
      // operator meant to tag "companion" but mistyped still gets
      // assigned normally, just without a role preference on it, rather
      // than losing the whole voice or throwing at parse time.
      const roles: CharacterRoleKey[] = (rolesRaw ?? '')
        .split('|')
        .map(r => r.trim())
        .filter(isCharacterRoleKey);
      return { id, gender, roles };
    })
    .filter(e => e.id.length > 0);
}

// PERF: VOICESTUDIO_VOICE_POOL is a deploy-time env var — it cannot change
// for the lifetime of this module instance (env.ts validates it once at
// process start). Previously every single call to resolveVoiceStudioVoiceId
// (i.e. every character bootstrap AND every lazy-backfill /api/voice/tts
// request for a pre-existing character) re-split and re-mapped the raw
// string from scratch. Memoized here — parsed exactly once per module
// instance, keyed on the raw string so the one legitimate case where it
// differs (tests re-mocking '@/env' and reloading the module fresh via
// vi.resetModules) still gets a correct, freshly-parsed pool rather than a
// stale cross-test value.
let cachedPool: { raw: string | undefined; entries: PoolEntry[] } | null = null;
function parsePool(raw: string | undefined): PoolEntry[] {
  if (!cachedPool || cachedPool.raw !== raw) {
    cachedPool = { raw, entries: parsePoolUncached(raw) };
  }
  return cachedPool.entries;
}

function normalizeGenderBucket(gender: string | null | undefined): VoiceStudioGenderBucket {
  if (gender === 'male') return 'male';
  if (gender === 'anime') return 'anime';
  return 'female'; // covers 'female', 'other', and anything unrecognized — same convention as voice-library.ts
}

/**
 * Resolves (and persists) a VoiceStudio voice id for a character.
 *
 * Read path: if characters.voicestudio_voice_id is already set, callers
 * should just use that directly — this function is only for the
 * assignment step itself (character creation, or a lazy first-use
 * backfill for a character that predates this column).
 *
 * `role` should be:
 *   - The character's freshly-resolved CharacterRoleKey at CREATE time
 *     (digital-person-bootstrap.ts already has the personality/backstory
 *     text on hand via character-role.ts's resolveCharacterRole()).
 *   - The result of character-role.ts's inferRoleFromVoiceProfile() at
 *     LAZY-BACKFILL time (the /api/voice/tts route only has the
 *     character's already-stored numeric voice_profile on hand, not the
 *     original text — see that module's header for why this is a
 *     reconstruction of the same signal, not an independent guess).
 *   - Omitted/null if no role signal is available at all — the function
 *     degrades gracefully to the pre-role-aware gender+least-used
 *     behavior in that case, it does not require a role to function.
 *
 * Assignment strategy, applied to the configured pool:
 *   1. Prefer entries tagged for this character's own gender bucket.
 *   2. If that bucket is empty (operator didn't tag any pool entries, or
 *      tagged none for this gender), fall back to the whole pool —
 *      including `:any`-tagged and untagged entries — rather than
 *      refusing to assign a distinct voice at all.
 *   3. ROLE-CONSCIOUS VOICE FIX (2026-09-14): within that gender-scoped
 *      set, prefer entries tagged for this character's own role
 *      (character-role.ts's selectRoleAwareCandidates) — falling back to
 *      untagged-for-role entries, then the full gender-scoped set, if
 *      nothing matches. This step is a no-op (returns its input
 *      unchanged) when `role` isn't provided, so existing callers that
 *      don't pass one see no behavior change.
 *   4. Within the resulting candidate set, least-used-first: counts how
 *      many existing characters already hold each candidate id and picks
 *      the one currently used by the fewest, tie-broken by a stable hash
 *      of the character id (same pattern as voice-library.ts's
 *      resolveVoiceId) so ties don't all collapse onto the first entry.
 *      Running this last, on the role-narrowed set rather than the whole
 *      gender bucket, is what keeps a role preference from regressing
 *      into the old fixed-lookup-table bug (see voice-library.ts's
 *      ROLE-CONSCIOUS VOICE FIX comment): a role is a preference among
 *      several still-eligible voices, never a hardcoded single answer.
 *
 * Fails open to VOICESTUDIO_DEFAULT_VOICE (or 'default') if the pool is
 * empty or the DB read fails — a character always gets *some* voice id
 * back, never blocks on this assignment step.
 */
export async function resolveVoiceStudioVoiceId(
  supabase: { from: (table: string) => any },
  characterId: string,
  gender: string | null | undefined,
  role?: CharacterRoleKey | null,
): Promise<string> {
  const pool = parsePool(env.VOICESTUDIO_VOICE_POOL);
  const fallback = env.VOICESTUDIO_DEFAULT_VOICE ?? 'default';
  if (pool.length === 0) return fallback;

  const bucket = normalizeGenderBucket(gender);
  const bucketed = pool.filter(e => e.gender === bucket);
  const genderCandidates = bucketed.length > 0 ? bucketed : pool;
  const candidates = selectRoleAwareCandidates(genderCandidates, role);

  try {
    const ids = candidates.map(e => e.id);
    const { data } = await supabase
      .from('characters')
      .select('voicestudio_voice_id')
      .in('voicestudio_voice_id', ids);

    const counts = new Map<string, number>(ids.map(id => [id, 0]));
    for (const row of (data ?? []) as { voicestudio_voice_id: string | null }[]) {
      if (row.voicestudio_voice_id && counts.has(row.voicestudio_voice_id)) {
        counts.set(row.voicestudio_voice_id, (counts.get(row.voicestudio_voice_id) ?? 0) + 1);
      }
    }

    const minCount = Math.min(...counts.values());
    const leastUsed = candidates.filter(e => counts.get(e.id) === minCount);

    let hash = 0;
    for (let i = 0; i < characterId.length; i++) {
      hash = (hash * 31 + characterId.charCodeAt(i)) >>> 0;
    }
    return leastUsed[hash % leastUsed.length].id;
  } catch {
    // DB read failed — fail open to the first configured candidate rather
    // than blocking assignment on a voice-distribution query.
    return candidates[0]?.id ?? fallback;
  }
}
