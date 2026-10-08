-- Voice calling — premium-only, monthly minute allowance + token overage.
--
-- Backs the new "Call" feature (lib/voice/call-limits.ts): a real-time,
-- push-to-talk voice conversation with a character, reusing the existing
-- chat pipeline (/api/chat/stream — full memory/personality/continuity,
-- nothing generic or separately maintained) and existing ElevenLabs TTS
-- pipeline (/api/voice/tts — per-character voices already assigned).
-- This table is purely the usage ledger for the NEW thing calling adds:
-- a monthly minute cap.
--
-- Pricing basis (checked against current ElevenLabs rates before picking
-- a number, see lib/voice/call-limits.ts's own doc for the full
-- reasoning): ~$0.10-0.20/min blended TTS cost. 15 free minutes/month
-- caps worst-case COGS exposure per free-tier-of-this-feature user at
-- roughly $1.50-3.00/mo against a $3.99/mo subscription floor (annual
-- plan, the cheapest premium ever gets) - real usage distribution means
-- most subscribers use a fraction of that, so blended cost across the
-- whole premium cohort should land well under half the floor price, even
-- before overage revenue. Beyond the free allowance, extra minutes are
-- charged in existing VC tokens (not a new currency) at a rate set to
-- carry real margin over COGS - see call-limits.ts.
--
-- One row per (user, calendar month, UTC) - a natural, simple reset
-- boundary matching how the rest of this app's monthly concepts work,
-- rather than a rolling 30-day window that would need a background job
-- to expire.
CREATE TABLE IF NOT EXISTS voice_call_usage (
  user_id            UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period             TEXT        NOT NULL, -- 'YYYY-MM', UTC
  free_seconds_used  INTEGER     NOT NULL DEFAULT 0,
  overage_seconds    INTEGER     NOT NULL DEFAULT 0,
  overage_tokens_charged INTEGER NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, period)
);

ALTER TABLE voice_call_usage ENABLE ROW LEVEL SECURITY;

-- Admin/service-role only, same model as ai_brain_decisions and other
-- usage-ledger tables this app already has: all reads/writes go through
-- supabaseAdmin in the API routes below, nothing reads this client-side.
DROP POLICY IF EXISTS "voice_call_usage_admin_only" ON voice_call_usage;
CREATE POLICY "voice_call_usage_admin_only" ON voice_call_usage FOR ALL USING (false);
