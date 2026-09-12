-- ─────────────────────────────────────────────────────────────────────────────
-- H-02-B: Reconcile the `tiers` table with the actual enforced daily cap.
--
-- WHY THIS MIGRATION EXISTS
--   H-02 (prior audit) made src/lib/tiers/limits.ts the single source of
--   truth for daily message caps and pointed everything at it — except this
--   table. The `tiers` table is what /premium actually queries
--   (`supabase.from("tiers").select("*")`, rendered by <TierCard>), so the
--   live pricing page was still promising the OLD numbers while
--   checkDailyMessageCap() enforced the NEW (lower) ones underneath it:
--
--       tier         promised (DB, live)   actually enforced (limits.ts)
--       free          75                    75      (matches)
--       spark         300                   150     (2x overpromise)
--       basic         750                   300     (2.5x overpromise)
--       premium       2,500                 300     (8.3x overpromise)
--       elite         "Unlimited"           2,500   (not actually unlimited)
--       enterprise    "Unlimited" (99999)   99999   (matches, both unbounded)
--
--   Because the original seed used `ON CONFLICT (slug) DO NOTHING`, any
--   environment where that INSERT already ran still has the stale numbers
--   sitting in the table — a fresh INSERT will not fix it. This migration
--   explicitly UPDATEs the existing rows.
--
-- ⚠️  PRODUCT DECISION ALREADY MADE HERE — CONFIRM BEFORE DEPLOYING:
--   This migration lowers the customer-facing promise to match the existing
--   enforced cap (the safe direction — it removes a false-advertising /
--   billing-dispute exposure rather than loosening enforcement to match the
--   inflated promise). Raising enforcement instead would re-open the Elite
--   PEAK-model unit-economics problem documented in src/lib/peak-budget.ts.
--   If premium/spark/basic users are already relying on the higher number
--   in production, you may want a grandfather clause or a customer comms
--   plan before this ships — that's a business call, not a code one.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE tiers SET
  daily_message_limit = 150,
  features = ARRAY['150 messages/day','All characters','Community support']
WHERE slug = 'spark';
UPDATE tiers SET
  daily_message_limit = 300,
  features = ARRAY['300 messages/day','All characters','Email support']
WHERE slug = 'basic';
UPDATE tiers SET
  daily_message_limit = 300,
  features = ARRAY['300 messages/day','Create characters','Ad-free','Priority support']
WHERE slug = 'premium';
UPDATE tiers SET
  daily_message_limit = 2500,
  features = ARRAY['2,500 messages/day','Create characters','Ad-free','Live action','Priority support','Dating mode']
WHERE slug = 'elite';
-- free (75) and enterprise (99999/"Unlimited") already matched — no change.

-- Belt-and-suspenders: if this is a brand-new environment where the original
-- seed never ran at all, insert the (now-correct) rows instead of relying on
-- the old INSERT in 20240101_production.sql.
INSERT INTO tiers (name, slug, price_usd, price_ngn, price_crypto, features, daily_message_limit, can_create_characters, tokens_per_month)
VALUES
  ('Free',       'free',       0,  0,       0,        ARRAY['75 messages/day','Basic characters','Community support'],                                          75,    FALSE, 0),
  ('Spark',      'spark',      5,  7500,    0.00008,  ARRAY['150 messages/day','All characters','Community support'],                                           150,   FALSE, 100),
  ('Basic',      'basic',      9,  13500,   0.00015,  ARRAY['300 messages/day','All characters','Email support'],                                               300,   FALSE, 500),
  ('Premium',    'premium',    19, 28500,   0.00032,  ARRAY['300 messages/day','Create characters','Ad-free','Priority support'],                                300,   TRUE,  2000),
  ('Elite',      'elite',      49, 73500,   0.00082,  ARRAY['2,500 messages/day','Create characters','Ad-free','Live action','Priority support','Dating mode'], 2500,  TRUE,  10000),
  ('Enterprise', 'enterprise', 99, 148500,  0.00165,  ARRAY['Unlimited messages','Create characters','Ad-free','API access','Dedicated support'],               99999, TRUE,  50000)
ON CONFLICT (slug) DO NOTHING
