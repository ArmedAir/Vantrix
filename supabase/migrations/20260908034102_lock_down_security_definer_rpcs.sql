
-- ============================================================================
-- Security hardening: several SECURITY DEFINER functions were exposed as
-- public RPC endpoints (/rest/v1/rpc/<name>) via PostgREST with NO check that
-- the calling user actually owned the p_user_id row they were mutating. Any
-- authenticated user could call these directly (bypassing the Next.js app
-- entirely) with someone else's UUID and mutate that user's data.
-- ============================================================================

-- 1. consume_streak_shield: add caller-ownership check before touching any
--    row. Falls back to the function's existing "no-op" shape (FALSE, 0)
--    instead of raising, so legitimate callers (which always pass their own
--    id) see no behavior change.
CREATE OR REPLACE FUNCTION public.consume_streak_shield(p_user_id uuid, p_restore_streak integer DEFAULT NULL::integer)
 RETURNS TABLE(consumed boolean, restored_streak integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_had_shield BOOLEAN;
  v_current    INTEGER;
  v_restore    INTEGER;
BEGIN
  IF auth.role() <> 'service_role' AND p_user_id <> auth.uid() THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  SELECT streak_shield, current_streak INTO v_had_shield, v_current
  FROM user_streaks WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND OR NOT v_had_shield THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  -- Clamp caller-supplied restore value: never allow a streak to be set
  -- higher than it already was (prevents self-serve streak inflation via
  -- a crafted p_restore_streak on top of the auth fix above).
  v_restore := LEAST(COALESCE(p_restore_streak, GREATEST(v_current, 1)), GREATEST(v_current, 1));

  UPDATE user_streaks
  SET streak_shield  = FALSE,
      current_streak = v_restore,
      updated_at     = NOW()
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT TRUE, v_restore;
END;
$function$;

-- 2. get_or_create_daily_quests: same ownership check. No graceful "empty
--    row" shape exists for this return type, so an unauthorized call raises
--    instead (a legitimate caller never passes another user's id, so this
--    is unreachable in normal operation).
CREATE OR REPLACE FUNCTION public.get_or_create_daily_quests(p_user_id uuid, p_date date, p_default_quests jsonb)
 RETURNS daily_quests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row daily_quests;
BEGIN
  IF auth.role() <> 'service_role' AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO daily_quests (user_id, date, quests)
  VALUES (p_user_id, p_date, p_default_quests)
  ON CONFLICT (user_id, date) DO NOTHING;

  SELECT * INTO v_row FROM daily_quests WHERE user_id = p_user_id AND date = p_date;
  RETURN v_row;
END;
$function$;

-- 3. progress_daily_quest: same ownership check, reusing the function's
--    existing "nothing progressed" shape. Also clamps p_amount so a crafted
--    call (even one a user makes against their own id) can't award more XP
--    than a single legitimate progress tick should.
CREATE OR REPLACE FUNCTION public.progress_daily_quest(p_user_id uuid, p_date date, p_quest_type text, p_amount integer DEFAULT 1)
 RETURNS TABLE(completed_quest_id text, xp_earned integer, bonus_earned integer, quests jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_quests        JSONB;
  v_bonus_claimed BOOLEAN;
  v_completed_ct  INTEGER;
  v_idx           INTEGER;
  v_q             JSONB;
  v_xp            INTEGER := 0;
  v_bonus         INTEGER := 0;
  v_completed_id  TEXT    := NULL;
  v_amount        INTEGER;
BEGIN
  IF auth.role() <> 'service_role' AND p_user_id <> auth.uid() THEN
    RETURN QUERY SELECT NULL::TEXT, 0, 0, '[]'::JSONB;
    RETURN;
  END IF;

  v_amount := LEAST(GREATEST(p_amount, 0), 50);

  SELECT quests, bonus_claimed, completed_count
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
               to_jsonb(LEAST((COALESCE(v_q ->> 'progress', '0'))::INTEGER + v_amount,
                               (v_q ->> 'target')::INTEGER)));
      IF (v_q ->> 'progress')::INTEGER >= (v_q ->> 'target')::INTEGER THEN
        v_q            := jsonb_set(v_q, '{completed}', 'true');
        v_xp           := v_xp + (v_q ->> 'xpReward')::INTEGER;
        v_completed_id := v_q ->> 'id';
        v_completed_ct := v_completed_ct + 1;
      END IF;
      v_quests := jsonb_set(v_quests, ARRAY[v_idx::TEXT], v_q);
      EXIT;
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
$function$;

-- 4. execute_subscription_revocation is an internal operation meant to be
--    triggered only by the app's own admin/cron flow (service_role). It has
--    no legitimate end-user caller at all, so rather than teach it about
--    auth.uid(), just remove public/authenticated's ability to call it.
REVOKE EXECUTE ON FUNCTION public.execute_subscription_revocation(uuid) FROM PUBLIC, anon, authenticated;

-- 5. is_admin already self-guards internally (p_uid = auth.uid() OR
--    service_role), so it was never actually exploitable — but anon has no
--    legitimate reason to call it at all (anon's auth.uid() is always NULL),
--    so drop the grant to shrink the public surface regardless.
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;

-- 6. Fix mutable search_path on flagged functions (defense against
--    search-path hijacking via objects created earlier in a session's path).
ALTER FUNCTION public.token_ledger_block_mutation() SET search_path = public, pg_temp;
ALTER FUNCTION public.match_memory_graph(uuid, uuid, vector, integer, double precision) SET search_path = public, pg_temp;
ALTER FUNCTION public.match_characters(vector, text, text, boolean, integer, double precision) SET search_path = public, pg_temp;

