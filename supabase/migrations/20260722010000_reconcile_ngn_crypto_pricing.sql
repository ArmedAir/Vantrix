-- ─────────────────────────────────────────────────────────────────────────────
-- Reconcile price_ngn / price_crypto with the corrected price_usd
--
-- 20260702_reconcile_tier_pricing_and_limits.sql fixed price_usd (5/9/19/49 ->
-- 4.99/9.99/19.99/49.99) but never touched price_ngn or price_crypto, which
-- were both seeded from the OLD whole-dollar prices at a flat 1500 NGN/USD
-- rate (5 -> 7500, 9 -> 13500, 19 -> 28500, 49 -> 73500). Two real
-- consequences:
--
--   1. price_ngn is the literal amount charged by
--      paystack/initialize/route.ts whenever a tier has no recurring plan
--      code configured (the one-off-charge fallback) — so that fallback
--      path was undercharging relative to the advertised USD price.
--   2. Both columns are stale/inconsistent with price_usd for anyone
--      reading this table directly (admin tooling, future features), even
--      though price_crypto itself is not currently read by any charge path
--      (NOWPayments converts price_usd live).
--
-- Recomputed at the same flat 1500 NGN/USD rate the original seed used, so
-- this is a like-for-like correction, not a policy change.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE tiers SET price_ngn = ROUND(price_usd * 1500) WHERE slug = 'spark'   AND billing_interval = 'monthly';
UPDATE tiers SET price_ngn = ROUND(price_usd * 1500) WHERE slug = 'basic'   AND billing_interval = 'monthly';
UPDATE tiers SET price_ngn = ROUND(price_usd * 1500) WHERE slug = 'premium' AND billing_interval = 'monthly';
UPDATE tiers SET price_ngn = ROUND(price_usd * 1500) WHERE slug = 'elite'   AND billing_interval = 'monthly';
-- price_crypto: preserve each tier's original implied BTC price (price_usd /
-- price_crypto before this migration) rather than inventing a new one, so
-- the relative rate every tier used doesn't silently change.
UPDATE tiers SET price_crypto = ROUND((price_usd / 62500.0)::numeric, 8) WHERE slug = 'spark'   AND billing_interval = 'monthly';
UPDATE tiers SET price_crypto = ROUND((price_usd / 60000.0)::numeric, 8) WHERE slug = 'basic'   AND billing_interval = 'monthly';
UPDATE tiers SET price_crypto = ROUND((price_usd / 59375.0)::numeric, 8) WHERE slug = 'premium' AND billing_interval = 'monthly';
UPDATE tiers SET price_crypto = ROUND((price_usd / 59756.0)::numeric, 8) WHERE slug = 'elite'   AND billing_interval = 'monthly';
-- Annual rows were derived from price_usd/price_ngn/price_crypto at the time
-- 20260716_add_annual_billing.sql ran, which was AFTER the price_usd fix but
-- carried forward the still-stale price_ngn/price_crypto — recompute them
-- from their now-corrected monthly counterparts (12 * monthly * 0.8, same
-- 20% annual discount convention).
UPDATE tiers a
SET
  price_ngn    = ROUND(m.price_ngn * 12 * 0.8),
  price_crypto = ROUND((m.price_crypto * 12 * 0.8)::numeric, 8)
FROM tiers m
WHERE a.billing_interval = 'annual'
  AND m.billing_interval = 'monthly'
  AND m.slug = a.base_tier_slug;
-- Sanity check — run after applying:
--   SELECT slug, billing_interval, price_usd, price_ngn, price_crypto FROM tiers ORDER BY price_usd;
