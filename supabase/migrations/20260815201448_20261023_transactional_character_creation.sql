-- P0/P1: Character creation as an atomic state machine.
--
-- Prior flow (src/app/api/characters/route.ts) was three sequential,
-- independently-failable network round trips from the API route to
-- Postgres:
--   1. deduct_tokens()               — charge
--   2. INSERT INTO characters        — persist
--   3. (on failure) refund_tokens()  — compensate
-- plus a second compensating pair around brain-init:
--   4. DELETE FROM characters        — rollback
--   5. refund_tokens()               — compensate
--
-- Steps 1+2 and 4+5 are each "two things that must happen together" but
-- were two separate RPC calls from application code, meaning a crash,
-- timeout, or network blip between them left the system in a state no
-- single row could describe: charged-but-uncreated, or deleted-but-
-- unrefunded. The BILLING-FIX pass (20261021) made the refund call
-- itself succeed instead of erroring, but a failure *between* charge and
-- insert, or between delete and refund, was still possible and still
-- unrecoverable without a human reading logs.
--
-- This migration collapses each pair into one plpgsql function running
-- in one transaction, and adds an explicit `creation_status` column so
-- a character's state machine position is queryable instead of being
-- inferred from "does a token ledger row exist / does a log line exist".
--
-- States:
--   pending_brain_init  → row exists, charge succeeded, brain-init not
--                          yet confirmed. A character MUST NOT be shown
--                          to other users or be chattable in this state.
--   active               → brain-init confirmed, character is live.
--   failed               → terminal; row is about to be deleted by the
--                          same transaction that refunds the charge, so
--                          in practice 'failed' rows should not persist,
--                          but the state exists for observability if the
--                          delete step is ever changed to a soft-delete.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS creation_status TEXT NOT NULL DEFAULT 'active'
    CHECK (creation_status IN ('pending_brain_init', 'active', 'failed'));

-- Records what was actually charged for this specific creation, so the
-- reaper (and fail_character_creation, for a human-triggered retry) can
-- refund the true amount instead of assuming a hardcoded constant that
-- can drift from CHARACTER_CREATION_COST in application code.
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS creation_cost_paid INTEGER;

CREATE INDEX IF NOT EXISTS characters_creation_status_pending_idx
  ON characters (created_at)
  WHERE creation_status = 'pending_brain_init';

COMMENT ON COLUMN characters.creation_status IS
  'State machine position for the create_character_transactional() flow. '
  'pending_brain_init rows are mid-creation and must be excluded from '
  'public/chat surfaces — see is_public/active/moderation_status gating, '
  'which this column supplements rather than replaces.';

-- ── create_character_transactional ──────────────────────────────────────
--
-- Atomically: check the caller can afford p_cost, deduct it, and insert
-- the character row with creation_status = 'pending_brain_init'. Either
-- both happen or neither does — a Postgres exception in the INSERT
-- (constraint violation, etc.) rolls back the deduction automatically
-- because it's the same transaction, no compensating refund_tokens()
-- call needed for this step anymore.
--
-- p_character is the full column set as jsonb so this stays adaptable
-- to the wizard's field set without a migration every time a field is
-- added — validated against actual column types by the INSERT itself
-- (a bad key/type throws and rolls back, same as before).
CREATE OR REPLACE FUNCTION create_character_transactional(
  p_user_id   UUID,
  p_character JSONB,
  p_cost      INTEGER
)
RETURNS TABLE (
  character_id UUID,
  remaining_tokens INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tokens INTEGER;
  v_char_id UUID;
BEGIN
  IF p_cost <= 0 THEN
    RAISE EXCEPTION 'invalid_amount'
      USING HINT = 'p_cost must be positive';
  END IF;

  -- Charge first, same as before — insufficient balance short-circuits
  -- before any row is written.
  UPDATE profiles
  SET tokens = tokens - p_cost
  WHERE id = p_user_id AND tokens >= p_cost
  RETURNING tokens INTO v_tokens;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_tokens'
      USING HINT = 'User does not have enough tokens';
  END IF;

  INSERT INTO characters (
    name, age, gender, category, description, personality, backstory,
    scenario, speech_style, occupation, image_url, tags, is_nsfw,
    creator_id, active, is_public, moderation_status,
    visibility_requested, dating_enabled, is_new, is_premium,
    tokens_cost, like_count, total_swipes, creation_status,
    creation_cost_paid
  )
  SELECT
    p_character->>'name',
    (p_character->>'age')::INTEGER,
    p_character->>'gender',
    p_character->>'category',
    p_character->>'description',
    p_character->>'personality',
    p_character->>'backstory',
    p_character->>'scenario',
    p_character->>'speech_style',
    p_character->>'occupation',
    p_character->>'image_url',
    ARRAY(SELECT jsonb_array_elements_text(p_character->'tags')),
    (p_character->>'is_nsfw')::BOOLEAN,
    p_user_id,
    FALSE,   -- active (legacy flag; creation_status is the real gate now)
    FALSE,   -- is_public
    'pending',
    p_character->>'visibility_requested',
    (p_character->>'dating_enabled')::BOOLEAN,
    TRUE,    -- is_new
    FALSE,   -- is_premium
    1,       -- tokens_cost (per-message cost, distinct from p_cost)
    0, 0,
    'pending_brain_init',
    p_cost
  RETURNING id INTO v_char_id;

  RETURN QUERY SELECT v_char_id, v_tokens;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_character_transactional(UUID, JSONB, INTEGER) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION create_character_transactional(UUID, JSONB, INTEGER) TO service_role;

-- ── activate_character_creation ─────────────────────────────────────────
--
-- Flips a character from pending_brain_init → active once brain-init has
-- been confirmed by the caller. Idempotent (WHERE guards against double-
-- activation) and scoped to the owning user as a defense-in-depth check
-- even though this is service_role-only.
CREATE OR REPLACE FUNCTION activate_character_creation(
  p_character_id UUID,
  p_user_id      UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE characters
  SET creation_status = 'active',
      active = TRUE
  WHERE id = p_character_id
    AND creator_id = p_user_id
    AND creation_status = 'pending_brain_init';

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION activate_character_creation(UUID, UUID) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION activate_character_creation(UUID, UUID) TO service_role;

-- ── fail_character_creation ─────────────────────────────────────────────
--
-- Atomically deletes the pending character row and refunds the charge —
-- one transaction instead of the previous DELETE-then-refund_tokens()
-- pair, so a crash between the two steps can no longer happen. Scoped to
-- pending_brain_init rows only: this must never be callable against an
-- already-active character (that would be a data-loss bug, not a
-- creation-failure compensation).
-- Refund amount is read from the row's own creation_cost_paid, not passed
-- in by the caller — this closes off a class of bug where the caller's
-- idea of "what was charged" has drifted from what was actually deducted
-- (e.g. a pricing change mid-flight, or a caller bug passing the wrong
-- constant). The row is the source of truth for its own charge.
CREATE OR REPLACE FUNCTION fail_character_creation(
  p_character_id UUID,
  p_user_id      UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted_id UUID;
  v_cost_paid INTEGER;
  v_tokens INTEGER;
BEGIN
  DELETE FROM characters
  WHERE id = p_character_id
    AND creator_id = p_user_id
    AND creation_status = 'pending_brain_init'
  RETURNING id, COALESCE(creation_cost_paid, 0) INTO v_deleted_id, v_cost_paid;

  IF v_deleted_id IS NULL THEN
    RAISE EXCEPTION 'character_not_pending'
      USING HINT = 'Character does not exist or is not in pending_brain_init state — refusing to refund/delete an active character';
  END IF;

  IF v_cost_paid <= 0 THEN
    -- Nothing to refund (shouldn't happen in practice — creation_cost_paid
    -- is always set by create_character_transactional — but don't call
    -- add_tokens with a non-positive amount if it somehow is unset).
    SELECT tokens INTO v_tokens FROM profiles WHERE id = p_user_id;
    RETURN v_tokens;
  END IF;

  UPDATE profiles
  SET tokens = tokens + v_cost_paid
  WHERE id = p_user_id
  RETURNING tokens INTO v_tokens;

  RETURN v_tokens;
END;
$$;

REVOKE EXECUTE ON FUNCTION fail_character_creation(UUID, UUID) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION fail_character_creation(UUID, UUID) TO service_role;

-- ── Reaper for stuck pending rows ────────────────────────────────────────
--
-- If the API process crashes/times out after create_character_transactional
-- succeeds but before either activate_ or fail_ runs, a row is left
-- permanently in pending_brain_init with the user's coins already spent
-- and no character to show for it. This is the same class of problem the
-- transaction just eliminated for the charge+insert pair, but it can't be
-- eliminated for the brain-init step because brain-init is an external
-- HTTP call to services/brain — it cannot live inside the same Postgres
-- transaction as the token charge.
--
-- reap_stuck_character_creations() is the compensating control for that
-- remaining gap: anything still pending_brain_init after 10 minutes is
-- treated as failed and refunded. Intended to be invoked by a cron
-- heartbeat (see HEARTBEAT_* env vars) alongside the existing tick jobs,
-- not called from request-serving code.
CREATE OR REPLACE FUNCTION reap_stuck_character_creations(p_older_than_minutes INTEGER DEFAULT 10)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT id, creator_id
    FROM characters
    WHERE creation_status = 'pending_brain_init'
      AND created_at < now() - (p_older_than_minutes || ' minutes')::INTERVAL
  LOOP
    PERFORM fail_character_creation(v_row.id, v_row.creator_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION reap_stuck_character_creations(INTEGER) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION reap_stuck_character_creations(INTEGER) TO service_role;

