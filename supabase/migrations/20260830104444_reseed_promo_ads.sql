-- Re-seed the 5 first-party promo ads originally added by
-- 20260928_seed_hero_promo_ads.sql and 20260930b_seed_additional_promo_ads.sql.
-- Those migrations show as applied in history but the `ads` table is
-- currently empty (rows removed after seeding, outside migration history —
-- e.g. an admin-panel delete), so HeroAdsCarousel/FeedInlineAd, though
-- fully wired on the frontend, currently have nothing to render.
--
-- Two corrections vs. the original seed data: `link` values are updated
-- to routes that actually exist in this app today —
--   /create-character -> /studio/create  (no /create-character route)
--   /pricing           -> /premium       (no /pricing route)
--   /universe          -> /world         (no /universe route)
-- /dating and /premium (coin banner) already matched real routes.
-- image_url values use the local /promos/*.jpg paths matching
-- 20261211_promo_ads_png_to_jpg.sql and the actual files in public/promos/.

INSERT INTO ads (title, image_url, link, position, active)
VALUES
  (
    'Create your own AI Girlfriend',
    '/promos/create-your-own-ai-girlfriend.jpg',
    '/studio/create',
    'hero',
    TRUE
  ),
  (
    'Vantrix Hot Summer — 70% off',
    '/promos/vantrix-hot-summer-sale.jpg',
    '/premium',
    'hero',
    TRUE
  ),
  (
    'Welcome to the Vantrix Universe',
    '/promos/vantrix-universe-welcome.jpg',
    '/world',
    'hero',
    TRUE
  ),
  (
    'Find Your Perfect Match',
    '/promos/vantrix-dating-perfect-match.jpg',
    '/dating',
    'hero',
    TRUE
  ),
  (
    'Vantrix Coin — Gift Love, Earn Her Heart',
    '/promos/vantrix-coin-gift-love.jpg',
    '/premium',
    'inline',
    TRUE
  )
ON CONFLICT (image_url) DO NOTHING;
