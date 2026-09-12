-- ═══════════════════════════════════════════════════════════════════════
-- Backfill: redistribute existing characters' elevenlabs_voice_id.
--
-- ROOT CAUSE (see src/lib/ai/voice-library.ts's ARCHETYPE_VOICE_IDS,
-- removed by this same change): every character's voice was previously
-- assigned as a FIXED lookup of (archetype, gender) — only 5 archetypes x
-- 2 gender buckets ('anime' had no bucket of its own and silently fell
-- into 'female'). Every character sharing an archetype+gender got the
-- IDENTICAL ElevenLabs voice id, forever — voices were never actually
-- unique per character, and anime characters were never distinct from
-- female characters. New character creation now assigns from a strict,
-- non-overlapping per-gender pool via a least-used-in-DB pick (see
-- resolveVoiceId() in voice-library.ts) — but every character created
-- before this fix still holds its old, collision-prone id. This backfill
-- re-assigns all of them under the same corrected pool rules.
--
-- APPROACH: for each gender bucket (female/male/anime), take every
-- character currently in that bucket (by characters.gender, same mapping
-- normalizeGenderBucket() in voice-library.ts uses: 'male' -> male,
-- 'anime' -> anime, anything else -> female) and round-robin them evenly
-- across that bucket's pool of ids, ordered by id for a stable, reproducible
-- assignment. This is the same "spread evenly across the pool" goal the
-- new least-used-first runtime logic pursues, just applied once, in bulk,
-- to existing rows instead of incrementally as new characters are created.
--
-- Safe to re-run: fully deterministic per bucket/pool-size, so re-running
-- this migration produces the same assignment again rather than drifting
-- further on each run.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  female_pool TEXT[] := ARRAY['21m00Tcm4TlvDq8ikWAM', 'AZnzlk1XvdvUeBnXmlld', 'ThT5KcBeYPX3keUQqHPh']; -- Rachel, Domi, Dorothy
  male_pool   TEXT[] := ARRAY['pNInz6obpgDQGcFmaJgB', 'ErXwobaYiN019PkySvjV', 'VR6AewLTigWG4xSOukaG', 'TxGEqnHWrfWFTfGW9XjX', 'yoZ06aMxZJJ28mfd3POQ']; -- Adam, Antoni, Arnold, Josh, Sam
  anime_pool  TEXT[] := ARRAY['EXAVITQu4vr4xnSDxMaL', 'MF3mGyEYCl7XYWbV9V6O']; -- Bella, Elli
BEGIN
  -- Female bucket: characters.gender = 'female' (or NULL/'other' — same
  -- default the runtime normalizeGenderBucket() falls back to).
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn
    FROM characters
    WHERE gender IS DISTINCT FROM 'male' AND gender IS DISTINCT FROM 'anime'
  )
  UPDATE characters c
  SET elevenlabs_voice_id = female_pool[(ranked.rn % array_length(female_pool, 1)) + 1]
  FROM ranked
  WHERE c.id = ranked.id;

  -- Male bucket.
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn
    FROM characters
    WHERE gender = 'male'
  )
  UPDATE characters c
  SET elevenlabs_voice_id = male_pool[(ranked.rn % array_length(male_pool, 1)) + 1]
  FROM ranked
  WHERE c.id = ranked.id;

  -- Anime bucket — previously had no pool of its own at all; every one of
  -- these rows currently holds a female-pool id and is being moved off it
  -- here for the first time.
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn
    FROM characters
    WHERE gender = 'anime'
  )
  UPDATE characters c
  SET elevenlabs_voice_id = anime_pool[(ranked.rn % array_length(anime_pool, 1)) + 1]
  FROM ranked
  WHERE c.id = ranked.id;
END $$;
