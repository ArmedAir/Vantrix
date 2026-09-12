-- ── Character portrait images storage bucket ─────────────────────────────
--
-- Mirrors the ad-images bucket pattern (20260938_ad_images_bucket.sql):
-- the app's one existing bucket ('uploads') is PRIVATE and per-user
-- scoped, so getPublicUrl() against it 400s for anyone but the owner —
-- unusable for a character portrait that needs to render for every
-- visitor (Discover grid, chat header, dating deck, etc., all
-- unauthenticated-readable). This bucket is PUBLIC read / admin-only
-- write, same as ad-images.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('character-images', 'character-images', TRUE, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "character_images_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "character_images_admin_write"  ON storage.objects;
DROP POLICY IF EXISTS "character_images_admin_delete" ON storage.objects;

CREATE POLICY "character_images_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'character-images');

CREATE POLICY "character_images_admin_write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'character-images' AND is_admin());

CREATE POLICY "character_images_admin_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'character-images' AND is_admin());

