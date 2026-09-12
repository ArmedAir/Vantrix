-- ═══════════════════════════════════════════════════════════════════════
-- Creator marketplace monetization.
--
-- GAP (per product audit): creators/profile.ts and the following/follow
-- pages are purely social — bio, avatar, character list. Zero payouts,
-- revenue share, or platform-token economy for creators. This migration
-- adds the ledger + payout schema; the earning/payout logic lives in
-- src/lib/creators/revenue-share.ts, and the cron that releases+pays out
-- lives at /api/cron/creator-payouts (mirrors /api/cron/referral-payouts,
-- see 2026071702_referral_system.sql, almost line-for-line on purpose —
-- same hold-then-release, same claim-before-transfer race guard, same
-- Paystack transfer plumbing).
--
-- APPROACH:
--   creator_earnings   — append-only ledger, one row per revenue-share
--                         event (a fan spending tokens on a creator's
--                         character: voice note, in-chat image, gift).
--                         Same append-only + block-mutation-trigger shape
--                         as token_ledger (20261212_token_ledger.sql) —
--                         corrections are compensating rows, not edits.
--   creator_payout_accounts — one row per creator, their saved Paystack
--                         bank details. Separate from `profiles` (a huge,
--                         broadly-read table) rather than adding payout
--                         columns there — same reasoning referral_partners
--                         keeps its own payout_* columns instead of
--                         profiles carrying them for every user.
--   creator_payouts     — one row per batch payout run, same shape as
--                         referral_payouts.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS creator_earnings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  character_id    UUID        REFERENCES characters(id) ON DELETE SET NULL,
  user_id         UUID        REFERENCES profiles(id) ON DELETE SET NULL, -- the fan whose spend generated this
  source          TEXT        NOT NULL, -- 'voice_tts' | 'chat_image' | 'image_batch' | 'gift'
  gross_tokens    INTEGER     NOT NULL CHECK (gross_tokens > 0),
  share_bps       INTEGER     NOT NULL CHECK (share_bps >= 0 AND share_bps <= 10000), -- basis points, snapshotted at write time
  creator_tokens  NUMERIC(10,2) NOT NULL CHECK (creator_tokens >= 0),
  usd_value       NUMERIC(10,4) NOT NULL CHECK (usd_value >= 0),
  status          TEXT        NOT NULL CHECK (status IN ('held','available','paid','clawed_back')) DEFAULT 'held',
  payout_id       UUID,       -- set when claimed into a creator_payouts batch (FK added below, after that table exists)
  held_until      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_earnings_creator      ON creator_earnings (creator_id, status);
CREATE INDEX IF NOT EXISTS idx_creator_earnings_held_until   ON creator_earnings (held_until) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_creator_earnings_payout       ON creator_earnings (payout_id) WHERE payout_id IS NOT NULL;

ALTER TABLE creator_earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "creator_earnings_own_read" ON creator_earnings;
DROP POLICY IF EXISTS "creator_earnings_service"  ON creator_earnings;
CREATE POLICY "creator_earnings_own_read" ON creator_earnings FOR SELECT USING (creator_id = auth.uid());
CREATE POLICY "creator_earnings_service"  ON creator_earnings FOR ALL TO service_role USING (TRUE);

CREATE TABLE IF NOT EXISTS creator_payout_accounts (
  creator_id              UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  payout_bank_code        TEXT,
  payout_account_no       TEXT,
  payout_account_name     TEXT,
  paystack_recipient_code TEXT,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE creator_payout_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "creator_payout_accounts_own"     ON creator_payout_accounts;
DROP POLICY IF EXISTS "creator_payout_accounts_service" ON creator_payout_accounts;
CREATE POLICY "creator_payout_accounts_own" ON creator_payout_accounts
  FOR ALL USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());
CREATE POLICY "creator_payout_accounts_service" ON creator_payout_accounts FOR ALL TO service_role USING (TRUE);

CREATE TABLE IF NOT EXISTS creator_payouts (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id              UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_tokens            NUMERIC(10,2) NOT NULL,
  total_ngn               NUMERIC(12,2) NOT NULL,
  status                  TEXT        NOT NULL CHECK (status IN ('queued','sent','failed')) DEFAULT 'queued',
  paystack_transfer_code  TEXT,
  failure_reason          TEXT,
  requested_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at                 TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_creator_payouts_creator ON creator_payouts (creator_id, status);

ALTER TABLE creator_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "creator_payouts_own_read" ON creator_payouts;
DROP POLICY IF EXISTS "creator_payouts_service"  ON creator_payouts;
CREATE POLICY "creator_payouts_own_read" ON creator_payouts FOR SELECT USING (creator_id = auth.uid());
CREATE POLICY "creator_payouts_service"  ON creator_payouts FOR ALL TO service_role USING (TRUE);

ALTER TABLE creator_earnings
  DROP CONSTRAINT IF EXISTS creator_earnings_payout_id_fkey;
ALTER TABLE creator_earnings
  ADD CONSTRAINT creator_earnings_payout_id_fkey
  FOREIGN KEY (payout_id) REFERENCES creator_payouts(id) ON DELETE SET NULL;

