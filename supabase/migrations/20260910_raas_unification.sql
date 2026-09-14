-- ============================================================================
-- Relationship-as-a-Service (RaaS) Unification Layer
-- ============================================================================
-- Unifies three things this codebase already had as separate, unconnected
-- pieces into one sellable unit, sold PER RELATIONSHIP (user, character) —
-- not platform-wide:
--
--   1. MEMORY RETENTION TIERS — the hybrid memory stack already built
--      (memory_graph episodic log, knowledge_graph_edges triplets,
--      priority_memories, memory-tiers short/medium/long-term) previously
--      applied uniformly to every relationship. relationship_tiers now
--      gates how much of that stack a given (user, character) pair
--      actually retains/uses — see lib/commerce/raas.ts's
--      getMemoryRetentionPolicy().
--   2. SPECIALIZED COMPANION FINE-TUNES — character_fine_tunes packages a
--      creator-authored personality/voice variant for one character,
--      unlocked at a relationship tier, reusing the existing FLUX LoRA
--      pipeline's model-id plumbing (lora-pipeline.ts) for anything visual
--      and adding voice_profile_overrides for anything textual.
--   3. CREATOR-LED MARKETPLACE — creators already own characters
--      (characters.creator_id / is_public / moderation_status — see
--      ownership.ts) but had no way to earn from them. raas_pricing +
--      creator_revenue_share_pct on characters, plus the creator_earnings
--      ledger, close that gap using the existing token economy
--      (deduct_tokens/token_ledger from 20261212_token_ledger.sql) rather
--      than introducing a second payment rail.
--
-- NOTE ON THE EXISTING SINGLE-PLAN DECISION: src/lib/tiers/config.ts
-- currently documents a deliberate "no feature gating, one flat $9.99
-- subscription" product decision. This migration does not reverse that —
-- the base subscription still gates nothing. relationship_tiers is a
-- SEPARATE, additive, per-character purchase layer (spend Vantrix Coin to
-- deepen one specific relationship), the same shape as the existing
-- dating-gifts economy, not a re-gating of the base product. Flagging this
-- explicitly since it's a real product-model expansion, not a pure
-- refactor — worth a deliberate go/no-go from whoever owns pricing.
-- ============================================================================

-- ── 1. Relationship tiers (per user+character, the sellable unit) ──────────

CREATE TABLE IF NOT EXISTS relationship_tiers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  character_id     UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

  -- 'spark'     — default, free: short-term memory only, no knowledge
  --               graph, no episodic log beyond a recent window, no
  --               fine-tune. Every relationship starts here.
  -- 'bond'      — unlocks full hybrid memory: knowledge graph triplets,
  --               complete bitemporal episodic log, priority memories.
  -- 'soulbound' — everything in 'bond' plus the creator's specialized
  --               fine-tune (character_fine_tunes) for this character, if
  --               one exists.
  tier             TEXT        NOT NULL DEFAULT 'spark' CHECK (tier IN ('spark', 'bond', 'soulbound')),
  source           TEXT        NOT NULL DEFAULT 'purchased' CHECK (source IN ('purchased', 'gifted', 'promotional')),
  price_tokens     INTEGER     NOT NULL DEFAULT 0,
  purchased_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL = lifetime for this character. Set when a future subscription-
  -- style relationship tier is introduced; the one-time purchase model
  -- this migration ships with always leaves this NULL.
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
  -- Minimum relationship_tiers.tier that unlocks this fine-tune. A
  -- character can have at most one 'bond'-gated and one 'soulbound'-gated
  -- fine-tune live at a time (see the partial unique index below) — keeps
  -- "which pack is active" a deterministic lookup, not a ranked list.
  tier_required            TEXT        NOT NULL DEFAULT 'soulbound' CHECK (tier_required IN ('bond', 'soulbound')),

  -- Textual personality variant — merged into the base character prompt,
  -- not a replacement for it (e.g. a more intimate, more attentive, or
  -- more playful register than the free-tier voice_style).
  voice_profile_overrides  JSONB       NOT NULL DEFAULT '{}',
  -- Visual variant, reusing the existing FLUX LoRA pipeline's model-id
  -- shape (lora-pipeline.ts) rather than inventing a second training path.
  lora_model_id            TEXT,

  is_active                BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fine_tunes_one_active_per_tier
  ON character_fine_tunes(character_id, tier_required)
  WHERE is_active = TRUE;

ALTER TABLE character_fine_tunes ENABLE ROW LEVEL SECURITY;
-- Publicly readable (like the character itself) — a locked personality
-- pack's existence/description is part of what a buyer is deciding to
-- purchase, same visibility model as the gift catalog.
CREATE POLICY "fine_tunes_public_read" ON character_fine_tunes FOR SELECT USING (TRUE);
CREATE POLICY "fine_tunes_service"     ON character_fine_tunes FOR ALL  TO service_role USING (TRUE);

-- ── 3. Marketplace pricing + revenue share on characters ────────────────────

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS raas_pricing              JSONB    NOT NULL DEFAULT '{"bond": 500, "soulbound": 1500}',
  ADD COLUMN IF NOT EXISTS creator_revenue_share_pct  SMALLINT NOT NULL DEFAULT 70 CHECK (creator_revenue_share_pct BETWEEN 0 AND 100);

-- ── 4. RaaS creator earnings ledger ──────────────────────────────────────────
-- Named raas_creator_earnings (not creator_earnings) because a differently-
-- shaped creator_earnings table already exists in production, backing the
-- referral/payout pipeline (creator_id, creator_tokens, held_until,
-- payout_id, share_bps, source, status, usd_value) — a naming collision
-- discovered when this migration was actually applied, not a duplicate.

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
-- Mirrors send_gift()'s transactional shape exactly (see
-- 20240101_production.sql / dating-gifts migrations): deduct tokens,
-- upsert the relationship tier, and credit the creator's earnings ledger
-- all in one Postgres transaction, so a mid-flight failure can never charge
-- a buyer without granting the tier, or grant the tier without crediting
-- the creator.

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

  -- Reuses the existing token economy's deduct_tokens() — raises
  -- insufficient_tokens on its own if the buyer can't afford it, which
  -- aborts this whole transaction (nothing below runs).
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
