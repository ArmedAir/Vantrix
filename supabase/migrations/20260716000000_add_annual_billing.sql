-- Annual billing support
--
-- DESIGN: profiles.tier stays as the existing 5 slugs (spark/basic/premium/
-- elite/enterprise) unchanged — every feature gate (TIER_LIMITS,
-- SUBSCRIPTION_TOKEN_CREDITS, VALID_TIERS, etc.) keys off that slug and none
-- of it needs to change. Billing interval (monthly vs annual) is tracked
-- separately:
--   - tiers catalog gets annual-priced ROWS (own price, own Paystack plan
--     code, own billing_interval) so the checkout picker can list them
--   - subscriptions.billing_interval records which cadence was actually
--     purchased, driving the correct expires_at instead of a hardcoded
--     30 days for every subscriber regardless of what they paid for
--
-- A 20% discount is applied to annual pricing vs. 12x the monthly price
-- (i.e. ~2.4 months free) — adjust ANNUAL_DISCOUNT below if a different
-- discount is wanted; these are one-time seed values, not computed live.

ALTER TABLE tiers
  ADD COLUMN IF NOT EXISTS billing_interval TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS base_tier_slug TEXT,  -- for annual rows: which monthly slug this maps to for feature-gating (e.g. 'spark')
  ADD COLUMN IF NOT EXISTS paystack_plan_code_annual TEXT;
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'annual'));
-- Backfill: existing monthly tier rows point base_tier_slug at themselves.
UPDATE tiers SET base_tier_slug = slug WHERE base_tier_slug IS NULL;
-- Seed annual variants — 20% off (12 * monthly * 0.8), rounded to .99.
-- price_usd/price_ngn/price_crypto here are the FULL ANNUAL charge amount,
-- not a monthly-equivalent — same convention as the existing monthly rows.
INSERT INTO tiers (name, slug, price_usd, price_ngn, price_crypto, features, daily_message_limit, can_create_characters, tokens_per_month, billing_interval, base_tier_slug)
SELECT
  name || ' (Annual)',
  slug || '_annual',
  ROUND(price_usd * 12 * 0.8),
  ROUND(price_ngn * 12 * 0.8),
  ROUND(price_crypto * 12 * 0.8, 8),
  features,
  daily_message_limit,
  can_create_characters,
  tokens_per_month * 12,   -- annual subscribers get 12 months of token credit up front on activation
  'annual',
  slug
FROM tiers
WHERE slug IN ('spark', 'basic', 'premium', 'elite')
  AND billing_interval = 'monthly'
ON CONFLICT (slug) DO NOTHING;
COMMENT ON COLUMN tiers.base_tier_slug IS 'For annual rows: the monthly slug (spark/basic/premium/elite) this maps to for feature-gating. profiles.tier is always set to this value, never to the "_annual" slug.';
COMMENT ON COLUMN subscriptions.billing_interval IS 'Actual cadence purchased — drives expires_at (30d vs 365d) in activatePaystackSubscription, replacing the previous hardcoded +30 days applied to every subscription regardless of what was paid for.'
