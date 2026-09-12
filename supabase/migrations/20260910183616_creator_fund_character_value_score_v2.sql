-- ── 1. Monetization gate on characters ──────────────────────────────────────

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS monetization_status TEXT NOT NULL DEFAULT 'none'
    CHECK (monetization_status IN ('none', 'eligible', 'suspended')),
  ADD COLUMN IF NOT EXISTS monetization_upgraded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_characters_monetization_status
  ON characters (monetization_status)
  WHERE monetization_status = 'eligible';

-- ── 2. Program configuration (admin-tunable, no deploy required) ───────────

INSERT INTO app_config (key, value, description) VALUES
  ('creator_fund_eligible_revenue_pct', '4',
   'Percent of period subscription revenue set aside as the whole creator-fund pool. Deliberately small — this is a bonus layer on top of the existing 70/30 per-purchase marketplace, not a repricing of the base subscription. Raising this is a real product-economics decision, not a tuning knob to reach for casually.'),
  ('creator_fund_creator_share_pct', '70',
   'Of each character''s share of the pool, percent paid to the creator.'),
  ('creator_fund_platform_share_pct', '30',
   'Of each character''s share of the pool, percent retained by the platform. Must sum to 100 with creator_fund_creator_share_pct.'),
  ('character_monetization_upgrade_fee', '250',
   'One-time Vantrix Coin fee to enroll an already-public, already-approved character into the creator fund. Separate from and on top of the 100-token base character_creation cost (see CHARACTER_CREATION_COST in api/characters/route.ts).'),
  ('creator_fund_min_active_users', '5',
   'A character with fewer than this many distinct non-creator active users in a period is excluded from that period''s distribution entirely (no row is written) — prevents a single lucky returning user from claiming an outsized share of the pool purely from a tiny sample.')
ON CONFLICT (key) DO NOTHING;

-- ── 3. Engagement signal aggregation ────────────────────────────────────────

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
  follows_agg AS (
    SELECT cf.character_id, COUNT(*) AS follows
    FROM character_follows cf
    JOIN eligible_characters ec ON ec.character_id = cf.character_id
    WHERE cf.created_at >= p_period_start AND cf.created_at < p_period_end
      AND cf.user_id <> ec.creator_id
    GROUP BY cf.character_id
  ),
  progression_agg AS (
    SELECT cr.character_id,
           COUNT(DISTINCT cr.user_id) FILTER (WHERE cr.stage <> 'stranger') AS users_with_progression,
           COALESCE(SUM(cr.milestones), 0) AS milestones_reached
    FROM character_relationships cr
    JOIN eligible_characters ec ON ec.character_id = cr.character_id
    WHERE cr.updated_at >= p_period_start AND cr.updated_at < p_period_end
      AND cr.user_id <> ec.creator_id
    GROUP BY cr.character_id
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
    0::INTEGER,
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
  LEFT JOIN follows_agg     fl ON fl.character_id = ec.character_id
  LEFT JOIN progression_agg pr ON pr.character_id = ec.character_id
  LEFT JOIN reports_agg     rp ON rp.character_id = ec.character_id
  LEFT JOIN creator_own     co ON co.character_id = ec.character_id
  LEFT JOIN total_incl      ti ON ti.character_id = ec.character_id;
$$;

REVOKE EXECUTE ON FUNCTION compute_character_engagement_signals(TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION compute_character_engagement_signals(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION count_new_account_cluster(
  p_character_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end   TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH char_row AS (
    SELECT id, creator_id, created_at FROM characters WHERE id = p_character_id
  ),
  returning_users AS (
    SELECT c.user_id
    FROM conversations c
    JOIN messages m ON m.conversation_id = c.id
    JOIN char_row ch ON ch.id = c.character_id
    WHERE m.role = 'user'
      AND m.created_at >= p_period_start AND m.created_at < p_period_end
      AND c.user_id <> ch.creator_id
    GROUP BY c.user_id
    HAVING COUNT(DISTINCT date_trunc('day', m.created_at)) >= 2
  )
  SELECT COUNT(*)::INTEGER
  FROM returning_users ru
  JOIN profiles p ON p.id = ru.user_id
  CROSS JOIN char_row ch
  WHERE p.created_at >= ch.created_at - INTERVAL '3 days'
    AND p.created_at <= p_period_end;
$$;

REVOKE EXECUTE ON FUNCTION count_new_account_cluster(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION count_new_account_cluster(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ── 4. Character Value Score ledger ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS character_value_scores (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  creator_id   UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end   TIMESTAMPTZ NOT NULL,

  active_users               INTEGER NOT NULL DEFAULT 0,
  returning_users            INTEGER NOT NULL DEFAULT 0,
  meaningful_conversations   INTEGER NOT NULL DEFAULT 0,
  total_session_minutes      NUMERIC NOT NULL DEFAULT 0,
  saves                      INTEGER NOT NULL DEFAULT 0,
  follows                    INTEGER NOT NULL DEFAULT 0,
  users_with_progression     INTEGER NOT NULL DEFAULT 0,
  milestones_reached         INTEGER NOT NULL DEFAULT 0,
  reports                    INTEGER NOT NULL DEFAULT 0,

  raw_usage_score     NUMERIC NOT NULL DEFAULT 0,
  quality_multiplier  NUMERIC NOT NULL DEFAULT 0,
  weighted_score       NUMERIC NOT NULL DEFAULT 0,
  usage_share          NUMERIC NOT NULL DEFAULT 0,
  retention_rate        NUMERIC NOT NULL DEFAULT 0,

  eligible_pool_tokens  INTEGER  NOT NULL DEFAULT 0,
  gross_tokens          INTEGER  NOT NULL DEFAULT 0,
  platform_share_pct    SMALLINT NOT NULL DEFAULT 30,
  creator_share_pct     SMALLINT NOT NULL DEFAULT 70,
  creator_earned_tokens INTEGER  NOT NULL DEFAULT 0,
  platform_tokens       INTEGER  NOT NULL DEFAULT 0,

  payout_status    TEXT    NOT NULL DEFAULT 'pending'
                   CHECK (payout_status IN ('pending', 'pending_review', 'paid', 'void')),
  held_for_review  BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (character_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_character_value_scores_creator
  ON character_value_scores (creator_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_character_value_scores_character
  ON character_value_scores (character_id, period_start DESC);

ALTER TABLE character_value_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "character_value_scores_own_read" ON character_value_scores
  FOR SELECT USING (creator_id = auth.uid());
CREATE POLICY "character_value_scores_service" ON character_value_scores
  FOR ALL TO service_role USING (TRUE);

-- ── 5. Self-dealing / farming review queue ──────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_fund_flags (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  character_id             UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  creator_id               UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  character_value_score_id UUID        REFERENCES character_value_scores(id) ON DELETE SET NULL,
  period_start             TIMESTAMPTZ NOT NULL,
  period_end               TIMESTAMPTZ NOT NULL,

  flag_type TEXT    NOT NULL,
  score     INTEGER NOT NULL,
  reasons   TEXT[]  NOT NULL DEFAULT '{}',
  evidence  JSONB   NOT NULL DEFAULT '{}',

  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'reviewing', 'confirmed_farming', 'confirmed_legitimate', 'dismissed')),
  reviewed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  reviewer_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_creator_fund_flags_status_created
  ON creator_fund_flags (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_fund_flags_character
  ON creator_fund_flags (character_id);
CREATE INDEX IF NOT EXISTS idx_creator_fund_flags_creator
  ON creator_fund_flags (creator_id);

ALTER TABLE creator_fund_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_creator_fund_flags" ON creator_fund_flags
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "admin_update_creator_fund_flags" ON creator_fund_flags
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "creator_fund_flags_service" ON creator_fund_flags
  FOR ALL TO service_role USING (TRUE);

COMMENT ON TABLE creator_fund_flags IS
  'Non-blocking creator-fund self-dealing/farming suspicion queue. Written by /api/cron/character-fund-distribution. Reviewed via /admin/safety. Never auto-blocks a character — only holds that period''s character_value_scores payout row.';

-- ── 6. Atomic monetization upgrade ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION upgrade_character_monetization(
  p_user_id      UUID,
  p_character_id UUID,
  p_fee_tokens   INTEGER
)
RETURNS characters
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row characters;
BEGIN
  SELECT * INTO v_row FROM characters WHERE id = p_character_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'character_not_found';
  END IF;
  IF v_row.creator_id <> p_user_id THEN
    RAISE EXCEPTION 'not_owner';
  END IF;
  IF v_row.monetization_status = 'eligible' THEN
    RAISE EXCEPTION 'already_monetized';
  END IF;
  IF v_row.monetization_status = 'suspended' THEN
    RAISE EXCEPTION 'monetization_suspended';
  END IF;
  IF NOT (v_row.active AND v_row.is_public) THEN
    RAISE EXCEPTION 'character_not_public';
  END IF;
  IF v_row.moderation_status <> 'approved' THEN
    RAISE EXCEPTION 'character_not_approved';
  END IF;

  PERFORM deduct_tokens(p_user_id, p_fee_tokens, 'character_monetization_upgrade', p_character_id::TEXT);

  UPDATE characters
     SET monetization_status = 'eligible',
         monetization_upgraded_at = NOW()
   WHERE id = p_character_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION upgrade_character_monetization(UUID, UUID, INTEGER) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION upgrade_character_monetization(UUID, UUID, INTEGER) TO service_role;

