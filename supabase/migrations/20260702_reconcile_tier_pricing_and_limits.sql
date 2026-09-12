-- ─────────────────────────────────────────────────────────────────────────────
-- Reconcile the tiers table against real enforcement — "make payment work
-- correctly for all tiers"
--
-- This table is not decorative. stripe/checkout/route.ts and paystack/
-- initialize/route.ts both read tiers.price_usd / tiers.price_ngn directly
-- as the ACTUAL CHARGE AMOUNT sent to the payment provider, and
-- components/premium/tier-card.tsx — which renders the live /premium
-- pricing page — reads tiers.features / tiers.daily_message_limit /
-- tiers.can_create_characters directly as what the customer sees before
-- paying. Three separate, real mismatches were found between this table's
-- seed data and the values actually enforced in application code:
--
-- 1. price_usd was seeded as whole-dollar approximations (5, 9, 19, 49)
--    while lib/tiers/config.ts — the source used for any other pricing
--    display — has always advertised $4.99 / $9.99 / $19.99 / $49.99.
--    Concretely: a customer sees "$4.99/mo" on the pricing page, clicks
--    subscribe, and Stripe/Paystack silently charges $5.00. price_usd's
--    column type (INTEGER) couldn't even hold the correct value — it's
--    widened to NUMERIC(10,2) here first.
--
-- 2. daily_message_limit (300 / 750 / 2500 / 99999 for spark / basic /
--    premium / elite) was never updated when lib/tiers/limits.ts TIER_LIMITS
--    was corrected in an earlier pass (that fix — see the H-02 comments
--    throughout limits.ts and config.ts — corrected the ENFORCED values to
--    150 / 150 / 300 / 2500, but this table, a completely separate and
--    independently-read source of the same information, was missed).
--    Elite's "Unlimited messages" feature-list claim is the same bug in
--    prose form — elite has always been capped at 2,500/day in code.
--
-- 3. can_create_characters was FALSE for 'basic', but character creation is
--    actually gated by requirePlan(userId, 'basic', ...) — rank-based, so
--    basic and every tier above it already qualifies. The informational
--    column simply never matched the real gate.
--
-- Enterprise is deliberately left untouched: lib/tiers/config.ts shows it
-- as "contact sales" (pricing: null) rather than a self-serve price, so
-- there is no advertised self-serve figure to reconcile it against, and no
-- checkout flow should be reachable for it in practice.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Widen price_usd to hold cents-accurate pricing (was INTEGER).
ALTER TABLE tiers ALTER COLUMN price_usd TYPE NUMERIC(10,2);
-- 2. Correct price_usd to match what the pricing page actually advertises.
UPDATE tiers SET price_usd = 0.00  WHERE slug = 'free';
UPDATE tiers SET price_usd = 4.99  WHERE slug = 'spark';
UPDATE tiers SET price_usd = 9.99  WHERE slug = 'basic';
UPDATE tiers SET price_usd = 19.99 WHERE slug = 'premium';
UPDATE tiers SET price_usd = 49.99 WHERE slug = 'elite';
-- 3. Correct daily_message_limit to match the real enforced values
--    (lib/tiers/limits.ts TIER_LIMITS) — and the matching feature-list text.
UPDATE tiers SET
  daily_message_limit = 150,
  features = ARRAY['150 messages/day','All characters','Community support']
WHERE slug = 'spark';
UPDATE tiers SET
  daily_message_limit = 150,
  features = ARRAY['150 messages/day','All characters','Email support']
WHERE slug = 'basic';
UPDATE tiers SET
  daily_message_limit = 300,
  features = ARRAY['300 messages/day','Create characters','Ad-free','Priority support']
WHERE slug = 'premium';
UPDATE tiers SET
  daily_message_limit = 2500,
  features = ARRAY['2,500 messages/day','Create characters','Ad-free','Live action','Priority support','Dating mode']
WHERE slug = 'elite';
-- 4. Correct can_create_characters to match the real requirePlan('basic', …) gate.
UPDATE tiers SET can_create_characters = TRUE WHERE slug = 'basic';
-- 5. Sanity check — run after applying, expect all six rows with prices
--    matching lib/tiers/config.ts and limits matching lib/tiers/limits.ts:
--    SELECT slug, price_usd, daily_message_limit, can_create_characters FROM tiers ORDER BY price_usd;
