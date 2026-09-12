UPDATE tiers a
SET
  price_usd    = ROUND((m.price_usd * 12 * 0.3)::numeric, 2),
  price_ngn    = ROUND((m.price_ngn * 12 * 0.3)::numeric, 0),
  price_crypto = ROUND((m.price_crypto * 12 * 0.3)::numeric, 8)
FROM tiers m
WHERE a.billing_interval = 'annual'
  AND m.billing_interval = 'monthly'
  AND m.slug = a.base_tier_slug
  AND a.base_tier_slug IN ('spark', 'basic', 'premium', 'elite', 'enterprise')
  AND m.price_usd IS NOT NULL;

COMMENT ON COLUMN tiers.price_usd IS 'For any *_annual row this is the full annual charge amount (not a monthly-equivalent). ALL *_annual rows (spark/basic/premium/elite/enterprise) are at 70% off as of 20260926. enterprise_annual is display-only (never reaches checkout, see 20260811_enterprise_annual_tier_row.sql). Paystack recurring plans require a MANUAL Dashboard price update — this column does not drive Paystack plan-based billing amounts, see this migration''s header comment.';
