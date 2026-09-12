-- 20260819000000_referral_discount_and_volume_bonus
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_discount_used boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS referral_volume_bonuses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id            uuid NOT NULL REFERENCES referral_partners(id) ON DELETE CASCADE,
  min_paying_referrals  integer NOT NULL,
  window_days           integer NOT NULL,
  bonus_ngn             numeric NOT NULL,
  awarded_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, min_paying_referrals)
);
CREATE INDEX IF NOT EXISTS idx_referral_volume_bonuses_partner
  ON referral_volume_bonuses (partner_id);
ALTER TABLE referral_volume_bonuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partners read own volume bonuses" ON referral_volume_bonuses;
CREATE POLICY "partners read own volume bonuses" ON referral_volume_bonuses
  FOR SELECT USING (partner_id IN (SELECT id FROM referral_partners WHERE user_id = auth.uid()));

-- 20260819010000_digital_twin
CREATE TABLE IF NOT EXISTS digital_twin_profiles (
  user_id               uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  enabled               boolean NOT NULL DEFAULT true,
  auto_style_summary    text,
  auto_traits           jsonb,
  source_message_count  integer NOT NULL DEFAULT 0,
  last_trained_at       timestamptz,
  manual_notes          text,
  manual_sample_phrases text[] NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE digital_twin_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own digital twin" ON digital_twin_profiles;
CREATE POLICY "users read own digital twin" ON digital_twin_profiles
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "users update own digital twin" ON digital_twin_profiles;
CREATE POLICY "users update own digital twin" ON digital_twin_profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS digital_twin_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  prompt         text NOT NULL,
  reply          text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_digital_twin_messages_user ON digital_twin_messages (user_id, created_at DESC);
ALTER TABLE digital_twin_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own digital twin messages" ON digital_twin_messages;
CREATE POLICY "users read own digital twin messages" ON digital_twin_messages
  FOR SELECT USING (user_id = auth.uid());

-- 20260819020000_fix_personality_drift_precision
ALTER TABLE character_psychology
  ALTER COLUMN openness_drift   TYPE NUMERIC(5,2) USING openness_drift::NUMERIC(5,2),
  ALTER COLUMN warmth_drift     TYPE NUMERIC(5,2) USING warmth_drift::NUMERIC(5,2),
  ALTER COLUMN confidence_drift TYPE NUMERIC(5,2) USING confidence_drift::NUMERIC(5,2);

ALTER TABLE character_psychology
  ALTER COLUMN openness_drift   SET DEFAULT 0,
  ALTER COLUMN warmth_drift     SET DEFAULT 0,
  ALTER COLUMN confidence_drift SET DEFAULT 0;

DROP FUNCTION IF EXISTS apply_personality_drift(UUID, UUID, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION apply_personality_drift(
  p_user_id UUID, p_character_id UUID,
  p_openness NUMERIC, p_warmth NUMERIC, p_confidence NUMERIC
) RETURNS VOID AS $$
BEGIN
  UPDATE character_psychology SET
    openness_drift   = GREATEST(-50, LEAST(50, openness_drift   + p_openness)),
    warmth_drift     = GREATEST(-50, LEAST(50, warmth_drift     + p_warmth)),
    confidence_drift = GREATEST(-50, LEAST(50, confidence_drift + p_confidence))
  WHERE user_id = p_user_id AND character_id = p_character_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION apply_personality_drift(UUID, UUID, NUMERIC, NUMERIC, NUMERIC) TO authenticated, service_role;

-- 20260819030000_relationship_stage_and_milestone_fixes
ALTER TABLE character_relationships
  DROP CONSTRAINT IF EXISTS character_relationships_stage_check;

ALTER TABLE character_relationships
  ADD CONSTRAINT character_relationships_stage_check
  CHECK (stage IN (
    'stranger', 'acquaintance', 'friend', 'close_friend', 'best_friend',
    'match', 'dating', 'exclusive', 'partner', 'soulmate'
  ));

ALTER TABLE character_surprises
  DROP CONSTRAINT IF EXISTS character_surprises_type_check;

ALTER TABLE character_surprises
  ADD CONSTRAINT character_surprises_type_check
  CHECK (type IN ('promise_followup', 'anniversary', 'memory_poem', 'milestone_unlocked'));
