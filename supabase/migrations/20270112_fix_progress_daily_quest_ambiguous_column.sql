-- Fix: progress_daily_quest() failing on every call in production with
-- Postgres error 42702, "column reference \"quests\" is ambiguous"
-- (observed repeatedly on /api/chat/stream — see
-- "progressQuest: progress_daily_quest RPC failed" in runtime logs).
--
-- ROOT CAUSE: the function is declared
--   RETURNS TABLE(completed_quest_id TEXT, xp_earned INTEGER,
--                 bonus_earned INTEGER, quests JSONB)
-- In plpgsql, every column named in RETURNS TABLE(...) is implicitly
-- declared as an OUT-parameter variable scoped to the whole function body
-- — so `quests` exists simultaneously as that OUT parameter AND as the
-- daily_quests.quests table column. The original
--   SELECT quests, bonus_claimed, completed_count
--   INTO   v_quests, v_bonus_claimed, v_completed_ct
--   FROM   daily_quests ...
-- has a bare, unqualified `quests` in the SELECT list, which Postgres
-- cannot resolve between the two — hence 42702 on every single
-- invocation, meaning daily quest progress has never actually advanced
-- via this path since it shipped.
--
-- FIX: qualify the column with the table name so it's unambiguous. The
-- UPDATE ... SET quests = v_quests below was never affected (an UPDATE's
-- SET target is resolved against the target table only, not local/OUT
-- variables), so it's left untouched. Function body is otherwise
-- byte-identical to 20260720b_daily_unlock_hardening.sql.
CREATE OR REPLACE FUNCTION progress_daily_quest(
  p_user_id UUID, p_date DATE, p_quest_type TEXT, p_amount INTEGER DEFAULT 1
)
RETURNS TABLE(completed_quest_id TEXT, xp_earned INTEGER, bonus_earned INTEGER, quests JSONB) AS $$
DECLARE
  v_quests        JSONB;
  v_bonus_claimed BOOLEAN;
  v_completed_ct  INTEGER;
  v_idx           INTEGER;
  v_q             JSONB;
  v_xp            INTEGER := 0;
  v_bonus         INTEGER := 0;
  v_completed_id  TEXT    := NULL;
BEGIN
  SELECT daily_quests.quests, daily_quests.bonus_claimed, daily_quests.completed_count
  INTO   v_quests, v_bonus_claimed, v_completed_ct
  FROM   daily_quests
  WHERE  user_id = p_user_id AND date = p_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::TEXT, 0, 0, '[]'::JSONB;
    RETURN;
  END IF;

  FOR v_idx IN 0 .. jsonb_array_length(v_quests) - 1 LOOP
    v_q := v_quests -> v_idx;
    IF (v_q ->> 'type') = p_quest_type AND (v_q ->> 'completed')::BOOLEAN IS NOT TRUE THEN
      v_q := jsonb_set(v_q, '{progress}',
               to_jsonb(LEAST((COALESCE(v_q ->> 'progress', '0'))::INTEGER + p_amount,
                               (v_q ->> 'target')::INTEGER)));
      IF (v_q ->> 'progress')::INTEGER >= (v_q ->> 'target')::INTEGER THEN
        v_q            := jsonb_set(v_q, '{completed}', 'true');
        v_xp           := v_xp + (v_q ->> 'xpReward')::INTEGER;
        v_completed_id := v_q ->> 'id';
        v_completed_ct := v_completed_ct + 1;
      END IF;
      v_quests := jsonb_set(v_quests, ARRAY[v_idx::TEXT], v_q);
      EXIT; -- one quest progressed per call, mirrors prior JS behaviour
    END IF;
  END LOOP;

  IF v_completed_ct >= 3 AND NOT v_bonus_claimed THEN
    v_bonus         := 200;
    v_bonus_claimed := TRUE;
    v_xp            := v_xp + v_bonus;
  END IF;

  UPDATE daily_quests
  SET quests          = v_quests,
      completed_count = v_completed_ct,
      bonus_claimed   = v_bonus_claimed
  WHERE user_id = p_user_id AND date = p_date;

  IF v_xp > 0 THEN
    PERFORM increment_xp(p_user_id, v_xp,
      CASE WHEN v_completed_id IS NOT NULL THEN 'quest_' || v_completed_id ELSE 'quest_progress' END);
  END IF;

  RETURN QUERY SELECT v_completed_id, v_xp, v_bonus, v_quests;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Re-apply the same grants 20260930b_lock_privileged_rpcs.sql already
-- established (service_role only) — CREATE OR REPLACE FUNCTION does not
-- touch existing grants, so this is a no-op confirmation, not a widening.
GRANT EXECUTE ON FUNCTION progress_daily_quest(UUID, DATE, TEXT, INTEGER) TO service_role;
