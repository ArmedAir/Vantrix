-- 1. Widen billing_interval to allow 'quarterly' alongside monthly/annual.
ALTER TABLE tiers DROP CONSTRAINT IF EXISTS tiers_billing_interval_check;
ALTER TABLE tiers
  ALTER COLUMN billing_interval SET DEFAULT 'monthly',
  ADD CONSTRAINT tiers_billing_interval_check
    CHECK (billing_interval IN ('monthly', 'quarterly', 'annual'));

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_interval_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_billing_interval_check
    CHECK (billing_interval IN ('monthly', 'quarterly', 'annual'));

-- paystack_plan_code_quarterly, mirroring the existing _annual column.
ALTER TABLE tiers ADD COLUMN IF NOT EXISTS paystack_plan_code_quarterly TEXT;

-- 2. Remove every paid tier row except the single plan we're keeping
DELETE FROM tiers WHERE slug NOT IN ('free', 'spark', 'spark_quarterly', 'spark_annual');

-- 3. Upsert the three billing-length rows for the one paid plan.
INSERT INTO tiers (name, slug, price_usd, price_ngn, price_crypto, features, daily_message_limit, can_create_characters, tokens_per_month, billing_interval, base_tier_slug)
VALUES
  ('Premium — Monthly',   'spark',           9.99,  ROUND(9.99  * 1500), ROUND((9.99  / 62500.0)::numeric, 8), '{}'::text[], 2000, true, 0, 'monthly',   'spark'),
  ('Premium — 3 Months',  'spark_quarterly', 19.47, ROUND(19.47 * 1500), ROUND((19.47 / 62500.0)::numeric, 8), '{}'::text[], 2000, true, 0, 'quarterly', 'spark'),
  ('Premium — 1 Year',    'spark_annual',    35.88, ROUND(35.88 * 1500), ROUND((35.88 / 62500.0)::numeric, 8), '{}'::text[], 2000, true, 0, 'annual',    'spark')
ON CONFLICT (slug) DO UPDATE SET
  name                = EXCLUDED.name,
  price_usd            = EXCLUDED.price_usd,
  price_ngn            = EXCLUDED.price_ngn,
  price_crypto         = EXCLUDED.price_crypto,
  billing_interval      = EXCLUDED.billing_interval,
  base_tier_slug        = EXCLUDED.base_tier_slug;

COMMENT ON COLUMN tiers.price_usd IS 'Monthly row: per-month charge. Quarterly/annual rows: full charge for that billing length, not a monthly-equivalent (see tiers/config.ts getBillingPlans() for the per-month display figure).';

-- 4. Any profile still carrying a legacy tier value collapses to 'spark'.
UPDATE profiles
SET tier = 'spark'
WHERE tier IS NOT NULL AND tier NOT IN ('free', 'spark');

