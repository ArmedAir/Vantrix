-- ============================================================================
-- Creator Fund — closes the three Gaps documented in
-- CHARACTER_QUALITY_CRITERIA_2026-09-11.md against
-- 20270115_creator_fund_character_value_score.sql:
--
--   1. "saves carries a x2 weight but the signal is hardcoded to 0" — turns
--      out a real timestamped events table already exists for this
--      (character_likes, from 20240101_production.sql's original
--      toggle_character_like()) — it just stopped being written to when
--      20260804_character_likes_and_follows.sql swapped the function over
--      to the liked_by JSONB + like_count cumulative-counter shape. This
--      migration re-wires toggle_character_like() to maintain BOTH: the
--      cumulative columns the UI already reads, and the character_likes
--      rows compute_character_engagement_signals() now aggregates by
--      period, exactly like follows_agg already does for character_follows.
--      Pre-existing likes (liked before this migration) have no
--      character_likes row and are NOT backfilled — backfilling with
--      NOW() as created_at would dump every historical like into whichever
--      period runs first and inflate it; saves are counted going forward
--      only, same as any other newly-wired event stream.
--
--   2. "users_with_progression / milestones_reached are a snapshot proxy,
--      not a true per-period log" — adds relationship_progression_events,
--      written by lib/ai/relationship-engine.ts at the two places a stage
--      or milestone bit actually changes (addRelationshipXp,
--      checkAndApplyExtraMilestones), and repoints progression_agg at it.
--      milestones_reached becomes a real per-period COUNT(*) of milestone
--      events instead of SUM(cr.milestones) — the old query was summing a
--      BITMASK across users, which was never a meaningful count to begin
--      with, on top of being a whole-lifetime snapshot.
--
--   3. "fundReadiness() never gates canPublish — surface it as a warning
--      or a minimum threshold in the monetization-upgrade route" — adds
--      creator_fund_min_readiness_score (default 0 = fully advisory,
--      matching the doc's own framing that hard-blocking is a real
--      product decision, not a default to flip here). The route-level
--      wiring and the DB-row equivalent of studio's fundReadiness() live
--      in lib/commerce/character-fund.ts, not in SQL.
-- ============================================================================

-- ── 1. Saves: re-wire the existing character_likes table into the toggle ───
--
-- Same body as 20260804's version, plus INSERT/DELETE against
-- character_likes alongside the liked_by/like_count maintenance. Return
-- type (JSON) is unchanged, so CREATE OR REPLACE is sufficient — no DROP
-- needed, and the existing GRANT to `authenticated` carries over.

CREATE OR REPLACE FUNCTION toggle_character_like(p_character_id UUID, p_user_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_was_liked BOOLEAN;
  v_new_count INTEGER;
BEGIN
  PERFORM 1 FROM characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  SELECT (liked_by ? p_user_id::text) INTO v_was_liked
  FROM characters WHERE id = p_character_id;

  IF v_was_liked THEN
    UPDATE characters
    SET liked_by = (
          SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
          FROM jsonb_array_elements_text(liked_by) elem
          WHERE elem <> p_user_id::text
        ),
        like_count = GREATEST(0, like_count - 1)
    WHERE id = p_character_id
    RETURNING like_count INTO v_new_count;

    DELETE FROM character_likes
    WHERE user_id = p_user_id AND character_id = p_character_id;
  ELSE
    UPDATE characters
    SET liked_by   = liked_by || to_jsonb(p_user_id::text),
        like_count = like_count + 1
    WHERE id = p_character_id
    RETURNING like_count INTO v_new_count;

    INSERT INTO character_likes (user_id, character_id, created_at)
    VALUES (p_user_id, p_character_id, NOW())
    ON CONFLICT (user_id, character_id) DO UPDATE SET created_at = NOW();
  END IF;

  RETURN jsonb_build_object('liked', NOT v_was_liked, 'like_count', v_new_count);
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_character_like(UUID, UUID) TO authenticated;

-- ── 2. Progression: a real per-period stage/milestone event log ────────────

CREATE TABLE IF NOT EXISTS relationship_progression_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  character_id  UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL CHECK (event_type IN ('stage_change', 'milestone')),
  from_stage    TEXT,   -- set for 'stage_change' rows
  to_stage      TEXT,   -- set for 'stage_change' rows
  milestone_key TEXT,   -- set for 'milestone' rows (EXTENDED_MILESTONES key, e.g. 'friend_stage')
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relationship_progression_events_character_period
  ON relationship_progression_events (character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_relationship_progression_events_user
  ON relationship_progression_events (user_id, character_id);

ALTER TABLE relationship_progression_events ENABLE ROW LEVEL SECURITY;

-- Written only by the server (relationship-engine.ts, via supabaseAdmin) and
-- aggregated only by the SECURITY DEFINER function below — no client read
-- path exists for this table today, so it stays service-role-only rather
-- than growing a public policy nothing yet consumes.
CREATE POLICY "relationship_progression_events_service" ON relationship_progression_events
  FOR ALL TO service_role USING (TRUE);

COMMENT ON TABLE relationship_progression_events IS
  'Real per-event log of relationship-stage transitions and milestone unlocks, written by lib/ai/relationship-engine.ts. Backs compute_character_engagement_signals() users_with_progression/milestones_reached, replacing the character_relationships.updated_at snapshot proxy.';

-- ── 3. Repoint compute_character_engagement_signals() at both ─────────────
--
-- Column list/return type is identical to 20270115's version, so
-- CREATE OR REPLACE is sufficient here too.

CREATE OR REPLACE FUNCTION compute_character_engagement_signals(
  p_period_start TIMESTAMPTZ,
  p_period_end   TIMESTAMPTZ
)
RETURNS TABLE (
  character_id                 UUID,
  creator_id                   UUID,
  active_users                 INTEGER,
  returning_users               INTEGER,
  meaningful_conversations      INTEGER,
  total_session_minutes         NUMERIC,
  saves                         INTEGER,
  follows                       INTEGER,
  users_with_progression        INTEGER,
  milestones_reached            INTEGER,
  reports                       INTEGER,
  creator_own_messages          INTEGER,
  total_messages_incl_creator   INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH eligible_characters AS (
    SELECT id AS character_id, creator_id, created_at
    FROM characters
    WHERE monetization_status = 'eligible'
  ),
  period_messages AS (
    SELECT c.character_id, ec.creator_id, c.user_id, m.created_at
    FROM conversations c
    JOIN eligible_characters ec ON ec.character_id = c.character_id
    JOIN messages m ON m.conversation_id = c.id
    WHERE m.role = 'user'
      AND m.created_at >= p_period_start
      AND m.created_at <  p_period_end
  ),
  non_creator_messages AS (
    SELECT * FROM period_messages WHERE user_id <> creator_id
  ),
  active AS (
    SELECT character_id, COUNT(DISTINCT user_id) AS active_users
    FROM non_creator_messages
    GROUP BY character_id
  ),
  returning_agg AS (
    SELECT character_id, COUNT(*) AS returning_users
    FROM (
      SELECT character_id, user_id
      FROM non_creator_messages
      GROUP BY character_id, user_id
      HAVING COUNT(DISTINCT date_trunc('day', created_at)) >= 2
    ) distinct_day_users
    GROUP BY character_id
  ),
  conv_msg_counts AS (
    SELECT c.character_id, c.id AS conversation_id, c.user_id, COUNT(*) AS msg_count
    FROM conversations c
    JOIN eligible_characters ec ON ec.character_id = c.character_id
    JOIN messages m ON m.conversation_id = c.id
    WHERE m.created_at >= p_period_start AND m.created_at < p_period_end
    GROUP BY c.character_id, c.id, c.user_id
  ),
  meaningful AS (
    SELECT cmc.character_id, COUNT(*) AS meaningful_conversations
    FROM conv_msg_counts cmc
    JOIN eligible_characters ec ON ec.character_id = cmc.character_id
    WHERE cmc.user_id <> ec.creator_id AND cmc.msg_count >= 6
    GROUP BY cmc.character_id
  ),
  session_minutes AS (
    SELECT character_id,
           SUM(LEAST(EXTRACT(EPOCH FROM (max_ts - min_ts)) / 60.0, 180)) AS total_session_minutes
    FROM (
      SELECT c.character_id, c.user_id, date_trunc('day', m.created_at) AS day,
             MIN(m.created_at) AS min_ts, MAX(m.created_at) AS max_ts
      FROM conversations c
      JOIN eligible_characters ec ON ec.character_id = c.character_id
      JOIN messages m ON m.conversation_id = c.id
      WHERE m.created_at >= p_period_start AND m.created_at < p_period_end
        AND c.user_id <> ec.creator_id
      GROUP BY c.character_id, c.user_id, date_trunc('day', m.created_at)
    ) daily
    GROUP BY character_id
  ),
  -- Saves — now a real per-period aggregate. character_likes existed all
  -- along (20240101_production.sql) but was orphaned by the liked_by/JSONB
  -- switch in 20260804; part 1 above re-wires toggle_character_like() to
  -- keep writing it, so this can join it exactly like follows_agg below.
  saves_agg AS (
    SELECT cl.character_id, COUNT(*) AS saves
    FROM character_likes cl
    JOIN eligible_characters ec ON ec.character_id = cl.character_id
    WHERE cl.created_at >= p_period_start AND cl.created_at < p_period_end
      AND cl.user_id <> ec.creator_id
    GROUP BY cl.character_id
  ),
  follows_agg AS (
    SELECT cf.character_id, COUNT(*) AS follows
    FROM character_follows cf
    JOIN eligible_characters ec ON ec.character_id = cf.character_id
    WHERE cf.created_at >= p_period_start AND cf.created_at < p_period_end
      AND cf.user_id <> ec.creator_id
    GROUP BY cf.character_id
  ),
  -- Progression — now a real per-period event log (part 2 above) instead
  -- of the character_relationships.updated_at snapshot proxy.
  -- users_with_progression counts distinct non-creator users who moved
  -- past 'stranger' via a stage_change event THIS period (a user who
  -- progressed last period and just chatted normally this period no
  -- longer double-counts here the way the updated_at proxy could).
  -- milestones_reached is a real COUNT(*) of milestone events, not a
  -- SUM() over a bitmask column (the old query's SUM(cr.milestones) was
  -- summing bitmask integers across users, which was never a meaningful
  -- milestone count).
  progression_agg AS (
    SELECT
      rpe.character_id,
      COUNT(DISTINCT rpe.user_id) FILTER (
        WHERE rpe.event_type = 'stage_change' AND rpe.to_stage <> 'stranger'
      ) AS users_with_progression,
      COUNT(*) FILTER (WHERE rpe.event_type = 'milestone') AS milestones_reached
    FROM relationship_progression_events rpe
    JOIN eligible_characters ec ON ec.character_id = rpe.character_id
    WHERE rpe.created_at >= p_period_start AND rpe.created_at < p_period_end
      AND rpe.user_id <> ec.creator_id
    GROUP BY rpe.character_id
  ),
  reports_agg AS (
    SELECT ur.character_id, COUNT(*) AS reports
    FROM user_reports ur
    JOIN eligible_characters ec ON ec.character_id = ur.character_id
    WHERE ur.created_at >= p_period_start AND ur.created_at < p_period_end
    GROUP BY ur.character_id
  ),
  creator_own AS (
    SELECT character_id, COUNT(*) AS creator_own_messages
    FROM period_messages
    WHERE user_id = creator_id
    GROUP BY character_id
  ),
  total_incl AS (
    SELECT character_id, COUNT(*) AS total_messages_incl_creator
    FROM period_messages
    GROUP BY character_id
  )
  SELECT
    ec.character_id,
    ec.creator_id,
    COALESCE(a.active_users, 0)::INTEGER,
    COALESCE(r.returning_users, 0)::INTEGER,
    COALESCE(mc.meaningful_conversations, 0)::INTEGER,
    COALESCE(sm.total_session_minutes, 0)::NUMERIC,
    COALESCE(sv.saves, 0)::INTEGER,
    COALESCE(fl.follows, 0)::INTEGER,
    COALESCE(pr.users_with_progression, 0)::INTEGER,
    COALESCE(pr.milestones_reached, 0)::INTEGER,
    COALESCE(rp.reports, 0)::INTEGER,
    COALESCE(co.creator_own_messages, 0)::INTEGER,
    COALESCE(ti.total_messages_incl_creator, 0)::INTEGER
  FROM eligible_characters ec
  LEFT JOIN active         a  ON a.character_id = ec.character_id
  LEFT JOIN returning_agg   r  ON r.character_id = ec.character_id
  LEFT JOIN meaningful      mc ON mc.character_id = ec.character_id
  LEFT JOIN session_minutes sm ON sm.character_id = ec.character_id
  LEFT JOIN saves_agg       sv ON sv.character_id = ec.character_id
  LEFT JOIN follows_agg     fl ON fl.character_id = ec.character_id
  LEFT JOIN progression_agg pr ON pr.character_id = ec.character_id
  LEFT JOIN reports_agg     rp ON rp.character_id = ec.character_id
  LEFT JOIN creator_own     co ON co.character_id = ec.character_id
  LEFT JOIN total_incl      ti ON ti.character_id = ec.character_id;
$$;

REVOKE EXECUTE ON FUNCTION compute_character_engagement_signals(TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION compute_character_engagement_signals(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ── 4. Readiness-gate config knob ───────────────────────────────────────────
-- 0 = fully advisory (default): the score is computed and surfaced by
-- /api/creator/characters/[id]/monetization (GET, and echoed back on a
-- blocked POST) but never blocks the upgrade. Raising this above 0 is the
-- real product/business decision the criteria doc explicitly flags as not
-- yet made — an admin can opt into a hard minimum later without a deploy.

INSERT INTO app_config (key, value, description) VALUES
  ('creator_fund_min_readiness_score', '0',
   'Minimum fund-readiness score (0-100 — personality/archetype, backstory, speech style, opening line, seed memory, locked portrait) a character must have to enroll in the Creator Fund. 0 = advisory only: the score is shown on the upgrade route but never blocks it. Raising this is a real product decision, not a default to flip casually.')
ON CONFLICT (key) DO NOTHING;
