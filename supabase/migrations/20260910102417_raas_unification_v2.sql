-- ── 1. Relationship tiers (per user+character, the sellable unit) ──────────

CREATE TABLE IF NOT EXISTS relationship_tiers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  character_id     UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

  tier             TEXT        NOT NULL DEFAULT 'spark' CHECK (tier IN ('spark', 'bond', 'soulbound')),
  source           TEXT        NOT NULL DEFAULT 'purchased' CHECK (source IN ('purchased', 'gifted', 'promotional')),
  price_tokens     INTEGER     NOT NULL DEFAULT 0,
  purchased_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ,

  UNIQUE (user_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_relationship_tiers_user_char ON relationship_tiers(user_id, character_id);

ALTER TABLE relationship_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "relationship_tiers_own_read" ON relationship_tiers FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "relationship_tiers_service"  ON relationship_tiers FOR ALL   TO service_role USING (TRUE);

-- ── 2. Creator-authored specialized fine-tunes ──────────────────────────────

CREATE TABLE IF NOT EXISTS character_fine_tunes (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id             UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_by               UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,

  name                     TEXT        NOT NULL,
  description              TEXT        NOT NULL DEFAULT '',
  tier_required            TEXT        NOT NULL DEFAULT 'soulbound' CHECK (tier_required IN ('bond', 'soulbound')),

  voice_profile_overrides  JSONB       NOT NULL DEFAULT '{}',
  lora_model_id            TEXT,

  is_active                BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fine_tunes_one_active_per_tier
  ON character_fine_tunes(character_id, tier_required)
  WHERE is_active = TRUE;

ALTER TABLE character_fine_tunes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fine_tunes_public_read" ON character_fine_tunes FOR SELECT USING (TRUE);
CREATE POLICY "fine_tunes_service"     ON character_fine_tunes FOR ALL  TO service_role USING (TRUE);

-- ── 3. Marketplace pricing + revenue share on characters ────────────────────

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS raas_pricing              JSONB    NOT NULL DEFAULT '{"bond": 500, "soulbound": 1500}',
  ADD COLUMN IF NOT EXISTS creator_revenue_share_pct  SMALLINT NOT NULL DEFAULT 70 CHECK (creator_revenue_share_pct BETWEEN 0 AND 100);

-- ── 4. RaaS creator earnings ledger (renamed from creator_earnings to avoid
--       colliding with the pre-existing creator_earnings table, which
--       already backs the referral/payout pipeline with a different shape) ──

CREATE TABLE IF NOT EXISTS raas_creator_earnings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id            UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  character_id          UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  relationship_tier_id  UUID        REFERENCES relationship_tiers(id)  ON DELETE SET NULL,
  buyer_id              UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,

  gross_tokens          INTEGER     NOT NULL,
  revenue_share_pct     SMALLINT    NOT NULL,
  creator_earned_tokens INTEGER     NOT NULL,

  payout_status         TEXT        NOT NULL DEFAULT 'pending' CHECK (payout_status IN ('pending', 'paid', 'void')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raas_creator_earnings_creator ON raas_creator_earnings(creator_id, created_at DESC);

ALTER TABLE raas_creator_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "raas_creator_earnings_own_read" ON raas_creator_earnings FOR SELECT USING (creator_id = auth.uid());
CREATE POLICY "raas_creator_earnings_service"  ON raas_creator_earnings FOR ALL   TO service_role USING (TRUE);

-- ── 5. Atomic purchase RPC ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION purchase_relationship_tier(
  p_user_id       UUID,
  p_character_id  UUID,
  p_tier          TEXT,
  p_price_tokens  INTEGER,
  p_creator_id    UUID,
  p_revenue_share_pct SMALLINT
)
RETURNS relationship_tiers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row relationship_tiers;
  v_creator_tokens INTEGER;
BEGIN
  IF p_tier NOT IN ('bond', 'soulbound') THEN
    RAISE EXCEPTION 'invalid_tier' USING HINT = 'Only bond/soulbound can be purchased; spark is the default.';
  END IF;

  PERFORM deduct_tokens(p_user_id, p_price_tokens, 'relationship_tier_purchase', p_character_id::TEXT);

  INSERT INTO relationship_tiers (user_id, character_id, tier, source, price_tokens)
  VALUES (p_user_id, p_character_id, p_tier, 'purchased', p_price_tokens)
  ON CONFLICT (user_id, character_id)
  DO UPDATE SET tier = EXCLUDED.tier, source = 'purchased',
                price_tokens = EXCLUDED.price_tokens, purchased_at = NOW(), expires_at = NULL
  RETURNING * INTO v_row;

  v_creator_tokens := (p_price_tokens * p_revenue_share_pct) / 100;

  INSERT INTO raas_creator_earnings (
    creator_id, character_id, relationship_tier_id, buyer_id,
    gross_tokens, revenue_share_pct, creator_earned_tokens
  ) VALUES (
    p_creator_id, p_character_id, v_row.id, p_user_id,
    p_price_tokens, p_revenue_share_pct, v_creator_tokens
  );

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION purchase_relationship_tier(UUID, UUID, TEXT, INTEGER, UUID, SMALLINT) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION purchase_relationship_tier(UUID, UUID, TEXT, INTEGER, UUID, SMALLINT) TO service_role;

