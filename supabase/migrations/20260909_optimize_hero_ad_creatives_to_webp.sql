-- 20260909_optimize_hero_ad_creatives_to_webp.sql
--
-- IMAGE OPTIMIZATION: the 5 baked hero ad creatives seeded by
-- 20261220_seed_baked_hero_ad_creatives.sql were stored as JPEG
-- (120-179KB each, re-encoded from the original 1592x988 PNG exports).
-- Re-exporting the same source art as WebP (quality 82, same 1280px
-- width) cuts each file 30-45% with no visible quality loss — see
-- public/promos/*.webp — matching the format every *other* promo
-- creative in this table already uses (only these 5 baked-hero rows
-- were still on JPEG).
--
-- Not editing the original seed migration in place — migrations that
-- already ran in production stay immutable; this is the follow-up that
-- repoints existing rows. UPDATE (not the seed migration's INSERT ...
-- ON CONFLICT) because these rows already exist in every environment
-- that ran the 2026-12-20 migration.
--
-- The old vantrix-*.jpg files have been removed from public/promos/ —
-- this migration and that file swap ship together.

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
