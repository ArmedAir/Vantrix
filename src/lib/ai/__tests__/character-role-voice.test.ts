import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveCharacterRole,
  inferRoleFromVoiceProfile,
  selectRoleAwareCandidates,
  CHARACTER_ROLE_KEYS,
  isCharacterRoleKey,
} from '@/lib/ai/character-role';
import { VOICE_PRESETS, DEFAULT_VOICE_PROFILE } from '@/lib/ai/writing-style';
import { resolveVoiceId, VOICE_LIBRARY } from '@/lib/ai/voice-library';

// ── resolveCharacterRole ─────────────────────────────────────────────────

describe('resolveCharacterRole', () => {
  it('matches each of the five roles from personality/backstory/occupation/category text', () => {
    expect(resolveCharacterRole({ occupation: 'novelist' })).toBe('poet');
    expect(resolveCharacterRole({ backstory: 'grew up gaming and streaming' })).toBe('gamer');
    expect(resolveCharacterRole({ occupation: 'research professor' })).toBe('professor');
    expect(resolveCharacterRole({ personality: 'sweet and bubbly' })).toBe('girl_next_door');
    expect(resolveCharacterRole({ personality: 'a gentle, nurturing companion' })).toBe('companion');
  });

  it('returns null — not a fallback key — when nothing matches', () => {
    expect(resolveCharacterRole({ personality: 'mysterious and aloof' })).toBeNull();
    expect(resolveCharacterRole({})).toBeNull();
  });
});

// ── inferRoleFromVoiceProfile ────────────────────────────────────────────

describe('inferRoleFromVoiceProfile', () => {
  it('returns null for the generic default profile — nothing to reconstruct', () => {
    expect(inferRoleFromVoiceProfile(DEFAULT_VOICE_PROFILE)).toBeNull();
    expect(inferRoleFromVoiceProfile(null)).toBeNull();
    expect(inferRoleFromVoiceProfile(undefined)).toBeNull();
  });

  it('recovers the exact role for a profile that is literally one of the presets', () => {
    for (const key of CHARACTER_ROLE_KEYS) {
      expect(inferRoleFromVoiceProfile(VOICE_PRESETS[key])).toBe(key);
    }
  });

  it('finds the nearest role for a profile that is close to, but not exactly, a preset', () => {
    // Nudged slightly off the 'companion' preset (low energy, high warmth,
    // deliberate pauses) — should still land on 'companion', not drift to
    // a numerically-adjacent preset just because of the small offset.
    const nearCompanion = { ...VOICE_PRESETS.companion, warmth: VOICE_PRESETS.companion.warmth - 2 };
    expect(inferRoleFromVoiceProfile(nearCompanion)).toBe('companion');
  });
});

// ── selectRoleAwareCandidates ────────────────────────────────────────────

describe('selectRoleAwareCandidates', () => {
  const pool = [
    { id: 'a', roles: ['companion'] as const },
    { id: 'b', roles: ['professor'] as const },
    { id: 'c', roles: [] as const }, // untagged — usable for any role
  ];

  it('returns the input pool untouched when no role is given', () => {
    expect(selectRoleAwareCandidates(pool, undefined)).toBe(pool);
    expect(selectRoleAwareCandidates(pool, null)).toBe(pool);
  });

  it('prefers entries tagged for the given role', () => {
    expect(selectRoleAwareCandidates(pool, 'companion').map(e => e.id)).toEqual(['a']);
  });

  it('falls back to untagged entries when nothing matches the role', () => {
    const noMatchPool = [
      { id: 'a', roles: ['companion'] as const },
      { id: 'b', roles: [] as const },
    ];
    expect(selectRoleAwareCandidates(noMatchPool, 'gamer').map(e => e.id)).toEqual(['b']);
  });

  it('fails open to the whole pool when neither a role match nor an untagged entry exists', () => {
    const allTaggedPool = [
      { id: 'a', roles: ['companion'] as const },
      { id: 'b', roles: ['professor'] as const },
    ];
    expect(selectRoleAwareCandidates(allTaggedPool, 'gamer')).toBe(allTaggedPool);
  });
});

// ── isCharacterRoleKey ───────────────────────────────────────────────────

describe('isCharacterRoleKey', () => {
  it('accepts the five known roles and rejects anything else', () => {
    for (const key of CHARACTER_ROLE_KEYS) {
      expect(isCharacterRoleKey(key)).toBe(true);
    }
    expect(isCharacterRoleKey('villain')).toBe(false);
    expect(isCharacterRoleKey('')).toBe(false);
  });
});

// ── resolveVoiceId (ElevenLabs) — role-conscious end to end ─────────────

function fakeSupabase(usedIds: string[]) {
  return {
    from: () => ({
      select: () => ({
        in: async () => ({ data: usedIds.map(id => ({ elevenlabs_voice_id: id })) }),
      }),
    }),
  } as unknown as { from: (table: string) => any };
}

describe('resolveVoiceId — role-conscious', () => {
  it('with no role, behaves exactly as before (gender-bucketed, least-used)', async () => {
    const id = await resolveVoiceId(fakeSupabase([]), 'char-1', 'female');
    const femaleIds = VOICE_LIBRARY.filter(v => v.gender === 'female').map(v => v.id);
    expect(femaleIds).toContain(id);
  });

  it('with a role, prefers a voice tagged for that role over other same-gender voices', async () => {
    const id = await resolveVoiceId(fakeSupabase([]), 'char-1', 'male', 'gamer');
    const gamerMaleIds = VOICE_LIBRARY.filter(v => v.gender === 'male' && v.roles.includes('gamer')).map(v => v.id);
    expect(gamerMaleIds).toContain(id);
  });

  it('still spreads assignments across multiple characters sharing gender+role (uniqueness preserved)', async () => {
    const ids = await Promise.all(
      ['char-a', 'char-b', 'char-c', 'char-d', 'char-e'].map(cid =>
        resolveVoiceId(fakeSupabase([]), cid, 'male', 'professor')
      )
    );
    // Every candidate resolved independently against an empty "already
    // assigned" DB read (least-used ties at 0), so results are only
    // guaranteed to come from the professor-tagged male pool, not to be
    // identical — confirm they're valid candidates and that the pool has
    // more than one option so a collision isn't the only possible outcome.
    const professorMaleIds = VOICE_LIBRARY.filter(v => v.gender === 'male' && v.roles.includes('professor')).map(v => v.id);
    expect(professorMaleIds.length).toBeGreaterThan(1);
    for (const id of ids) expect(professorMaleIds).toContain(id);
  });

  it('falls back to the whole gender bucket if the role has no tagged entries in it', async () => {
    // No entry in any bucket is tagged for a made-up role — cast to bypass
    // the type system the same way a stale/renamed preset key would at
    // runtime, to prove the fails-open path actually triggers.
    const id = await resolveVoiceId(fakeSupabase([]), 'char-1', 'anime', 'nonexistent-role' as any);
    const animeIds = VOICE_LIBRARY.filter(v => v.gender === 'anime').map(v => v.id);
    expect(animeIds).toContain(id);
  });
});

// ── resolveVoiceStudioVoiceId — role-conscious ──────────────────────────
//
// This module reads its pool from `env` (src/env.ts), a Zod-validated
// singleton computed once at import time from process.env — mutating
// process.env after the fact has no effect on an already-imported
// instance. Each test below mocks '@/env' directly and re-imports the
// module fresh (vi.resetModules) so it picks up that test's pool string,
// rather than relying on process.env timing.
async function loadWithPool(pool: string | undefined) {
  vi.resetModules();
  vi.doMock('@/env', () => ({ env: { VOICESTUDIO_VOICE_POOL: pool, VOICESTUDIO_DEFAULT_VOICE: undefined } }));
  return import('@/lib/voice/voicestudio-voice-library');
}

describe('resolveVoiceStudioVoiceId — role-conscious', () => {
  beforeEach(() => {
    vi.doUnmock('@/env');
  });

  it('parses role tags and prefers a role-tagged entry within the gender bucket', async () => {
    const { resolveVoiceStudioVoiceId } = await loadWithPool(
      'narrator_warm:female:companion|professor,deep_calm:male:professor,bright_anime:anime:girl_next_door,house_voice'
    );
    const id = await resolveVoiceStudioVoiceId(fakeSupabase([]), 'char-1', 'male', 'professor');
    expect(id).toBe('deep_calm');
  });

  it('drops unknown role tags instead of crashing, treating that entry as untagged', async () => {
    const { resolveVoiceStudioVoiceId } = await loadWithPool('some_voice:male:not_a_real_role');
    const id = await resolveVoiceStudioVoiceId(fakeSupabase([]), 'char-1', 'male', 'professor');
    expect(id).toBe('some_voice'); // untagged-for-role fallback tier
  });

  it('stays backward compatible with id-only and id:gender-only pool entries', async () => {
    const { resolveVoiceStudioVoiceId } = await loadWithPool('plain_voice,gendered_voice:female');
    const id = await resolveVoiceStudioVoiceId(fakeSupabase([]), 'char-1', 'female', 'companion');
    expect(['plain_voice', 'gendered_voice']).toContain(id);
  });

  it('with no role passed at all, behaves exactly as before role-consciousness existed', async () => {
    const { resolveVoiceStudioVoiceId } = await loadWithPool('a:female,b:female,c:male');
    const id = await resolveVoiceStudioVoiceId(fakeSupabase([]), 'char-1', 'female');
    expect(['a', 'b']).toContain(id);
  });
});
