-- Preserve creator earnings/payout financial records on account deletion.
--
-- CONTEXT: /api/user/delete (GDPR right-to-be-forgotten) deletes the
-- Supabase Auth user, which CASCADEs to profiles and every FK'd table.
-- creator_id (and, on raas_creator_earnings, buyer_id) on the earnings and
-- payout ledgers were ON DELETE CASCADE -- so a creator's entire earnings
-- history, including any unpaid pending balance, was silently destroyed
-- the instant they (or one of their paying customers, via buyer_id)
-- deleted their account. No warning, no block, no remaining record.
--
-- Switched to ON DELETE SET NULL: the financial record (amounts, dates,
-- status) survives with the identity link detached, same treatment
-- characters.creator_id already gets. This also matches the general
-- principle that transaction/payout records are usually something you're
-- required to retain regardless of a deletion request, not something that
-- should vanish with it.
--
-- creator_payout_accounts (bank name/account number/Paystack recipient
-- code) is deliberately left as CASCADE -- that table is payment PII with
-- no record-retention need once the account and its payouts are gone; the
-- payout rows themselves (creator_payouts) no longer depend on it.

-- raas_creator_earnings: the active RaaS marketplace ledger
-- (src/lib/commerce/raas.ts's getCreatorEarnings()).
ALTER TABLE raas_creator_earnings
  ALTER COLUMN creator_id DROP NOT NULL,
  ALTER COLUMN buyer_id   DROP NOT NULL,
  DROP CONSTRAINT raas_creator_earnings_creator_id_fkey,
  DROP CONSTRAINT raas_creator_earnings_buyer_id_fkey,
  ADD CONSTRAINT raas_creator_earnings_creator_id_fkey
    FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT raas_creator_earnings_buyer_id_fkey
    FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- creator_earnings: older referral/payout-pipeline ledger. Confirmed via
-- codebase-wide grep that no current app code reads or writes this table
-- (it exists live in prod with no corresponding CREATE TABLE migration in
-- this repo either -- separate schema-drift note, not fixed here). Still
-- carries the same cascade risk for any historical rows, so fixed anyway.
ALTER TABLE creator_earnings
  ALTER COLUMN creator_id DROP NOT NULL,
  DROP CONSTRAINT creator_earnings_creator_id_fkey,
  ADD CONSTRAINT creator_earnings_creator_id_fkey
    FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- creator_payouts: record of money actually transferred (Paystack transfer
-- code, amount, status). Same treatment -- this is the row you'd need for
-- accounting/tax purposes even after the recipient's account is gone.
ALTER TABLE creator_payouts
  ALTER COLUMN creator_id DROP NOT NULL,
  DROP CONSTRAINT creator_payouts_creator_id_fkey,
  ADD CONSTRAINT creator_payouts_creator_id_fkey
    FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE SET NULL;
