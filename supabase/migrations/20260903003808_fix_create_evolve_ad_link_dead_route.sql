-- 20261218_seed_code_promo_ads.sql linked the "Create. Evolve. Become
-- Legendary." hero ad to /create-character, which is not a real route in
-- this codebase (no matching page under src/app; the actual character
-- creation route is /studio/create per nav-config.ts). Fixing the link so
-- the ad doesn't 404.
UPDATE ads
SET link = '/studio/create'
WHERE image_url = 'code:create-evolve-legendary'
  AND link = '/create-character';
