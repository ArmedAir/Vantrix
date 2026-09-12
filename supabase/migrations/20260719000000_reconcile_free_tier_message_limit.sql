-- ─────────────────────────────────────────────────────────────────────────────
-- Reconcile the 'free' row in `tiers` — the one row the earlier
-- 20260702_reconcile_tier_pricing_and_limits.sql migration missed.
--
-- That migration fixed the daily_message_limit / features mismatch for
-- spark / basic / premium / elite (DB said one number, lib/tiers/limits.ts
-- TIER_LIMITS enforced another), explicitly because
-- components/premium/tier-card.tsx — the live /premium checkout page —
-- reads tiers.daily_message_limit / tiers.features directly as what the
-- customer sees before paying. It never touched 'free', which was still
-- sitting on its original 20240101_production.sql seed value of 75.
--
-- lib/tiers/limits.ts TIER_LIMITS.free.dailyMessages has been 30 for some
-- time now (see that file's own "PRODUCT DECISION" comment — 30/day total,
-- 5/day per character) — and that's what checkDailyMessageCap actually
-- enforces (confirmed live: a free user hit the daily-limit 429 with the
-- app's own usage HUD showing "17/30 msgs left", not 75). So /premium has
-- been promising free signups 75 messages/day while enforcement only ever
-- granted 30 — the exact false-advertising gap the prior migration's
-- comment described, just missed for this one row.
--
-- Sanity check after applying — expect free's daily_message_limit = 30,
-- matching lib/tiers/limits.ts TIER_LIMITS.free.dailyMessages:
--   SELECT slug, daily_message_limit, features FROM tiers WHERE slug = 'free';
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE tiers SET
  daily_message_limit = 30,
  features = ARRAY['30 messages/day','Basic characters','Community support']
WHERE slug = 'free'
