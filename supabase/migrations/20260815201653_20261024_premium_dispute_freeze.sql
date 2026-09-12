ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('pending', 'active', 'cancelled', 'canceled', 'expired', 'disputed'));

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS pre_dispute_tier TEXT;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ;

COMMENT ON COLUMN subscriptions.pre_dispute_tier IS
  'Snapshot of the tier this subscription granted at the moment it was '
  'frozen for refund/dispute — used to restore the exact tier (not just '
  '"Premium" generically) if the dispute resolves in the user''s favor.';

CREATE INDEX IF NOT EXISTS subscriptions_disputed_idx
  ON subscriptions (disputed_at)
  WHERE status = 'disputed';

CREATE OR REPLACE FUNCTION restore_disputed_subscription(p_subscription_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT * INTO v_sub FROM subscriptions
  WHERE id = p_subscription_id AND status = 'disputed';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE subscriptions
  SET status = 'active', disputed_at = NULL
  WHERE id = p_subscription_id;

  IF v_sub.pre_dispute_tier IS NOT NULL THEN
    UPDATE profiles
    SET tier = v_sub.pre_dispute_tier
    WHERE id = v_sub.user_id;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION restore_disputed_subscription(UUID) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION restore_disputed_subscription(UUID) TO service_role;

