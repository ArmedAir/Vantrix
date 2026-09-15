-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION-ORDER-FIX: 20260909_optimize_hero_ad_creatives_to_webp.sql's own
-- header says it repoints the 5 rows seeded by
-- "20261220_seed_baked_hero_ad_creatives.sql" — but Supabase (like any
-- timestamp-prefixed migration tool) applies migrations in filename order,
-- and "20260909" sorts BEFORE "20261220". On any environment that runs the
-- full migration history from scratch (a new deploy, a fresh CI database, a
-- reset staging environment), the webp-conversion UPDATE runs first, finds
-- zero matching rows (the .jpg rows it's looking for don't exist yet), and
-- silently no-ops; the seed migration then inserts the 5 rows as .jpg.
-- Nothing after that ever converts them, because the one migration that
-- would have already ran.
--
-- The .jpg source files no longer exist on disk (see public/promos/ — only
-- the .webp versions were kept, per 20260909's own comment that they were
-- "removed"), so on a from-scratch environment this leaves all 5 baked hero
-- ad creatives ("She Remembers Everything," "Build Her From Scratch," "See
-- Her Your Way," "Her Voice," "Some Doors Are Still Locked") pointing at
-- image files that 404.
--
-- Not renaming/renumbering 20260909 in place — it may have already run (in
-- its broken, no-op form) on environments provisioned before this fix, and
-- migrations that already applied in production stay immutable (same
-- policy 20260909's own header cites for not editing an earlier migration).
-- This is the idempotent follow-up instead: identical UPDATEs, timestamped
-- to run after the seed migration on every environment, guaranteed. Already
-- writing to .webp is a no-op wherever 20260909 happened to run correctly.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE ads SET image_url = '/promos/vantrix-she-remembers-everything.webp'
  WHERE image_url = '/promos/vantrix-she-remembers-everything.jpg';

UPDATE ads SET image_url = '/promos/vantrix-build-her-from-scratch.webp'
  WHERE image_url = '/promos/vantrix-build-her-from-scratch.jpg';

UPDATE ads SET image_url = '/promos/vantrix-see-her-your-way.webp'
  WHERE image_url = '/promos/vantrix-see-her-your-way.jpg';

UPDATE ads SET image_url = '/promos/vantrix-her-voice.webp'
  WHERE image_url = '/promos/vantrix-her-voice.jpg';

UPDATE ads SET image_url = '/promos/vantrix-some-doors-locked.webp'
  WHERE image_url = '/promos/vantrix-some-doors-locked.jpg';
