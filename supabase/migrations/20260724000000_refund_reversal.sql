-- ─────────────────────────────────────────────────────────────────────────
-- Refund / chargeback reversal support
--
-- CONTEXT: All three payment webhooks (Stripe charge.refunded /
-- charge.dispute.created, NOWPayments payment_status='refunded', Paystack
-- refund.processed / charge.dispute.create) previously only clawed back the
-- referral commission on a refund or dispute. They never reversed the
-- subscription tokens that were credited, nor downgraded the tier —
-- meaning a user could pay, receive tokens, spend/keep them, then file a
-- chargeback and keep everything until the subscription's own expires_at
-- naturally lapsed (up to 365 days for annual plans). This migration adds
-- the missing debit primitive; src/lib/payments/refund-reversal.ts is the
-- application-layer function that calls it from all three webhook handlers.
-- ─────────────────────────────────────────────────────────────────────────

-- Mirrors credit_subscription_tokens' shape exactly, just subtracting
-- instead of adding. Clamped at 0 (GREATEST) rather than allowed to go
-- negative — a user who already spent the tokens before the refund/dispute
-- posted should not end up with a negative balance blocking normal use;
-- the deterrent here is the tier downgrade + loss of any *unspent* tokens,
-- not manufacturing debt.
CREATE OR REPLACE FUNCTION debit_subscription_tokens(p_user_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET tokens = GREATEST(0, tokens - GREATEST(0, p_amount))
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- 'refunded' is a distinct terminal state from 'cancelled' (user-initiated,
-- in good standing) — worth being able to tell apart in admin/analytics
-- views and for any future re-subscription risk scoring.
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'cancelled', 'canceled', 'expired', 'refunded'))
