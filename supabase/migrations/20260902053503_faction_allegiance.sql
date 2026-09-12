-- ============================================================================
-- Faction Allegiance — real user participation in factions
--
-- Factions (20240200_world_expansion.sql) were a fully-simulated NPC layer:
-- influence drifted every faction_evolve tick (faction-evolution.ts), ruling
-- changes were logged, and the detail page rendered history + members —
-- but a user could only ever *read* a faction, never affect it. This adds
-- the missing user-facing loop: pledging allegiance to a faction gives it a
-- small, real influence bump (and a supporter count worth showing), giving
-- users an actual reason to have a favorite faction instead of just prose.
--
-- One faction per user (PRIMARY KEY on user_id) — pledging elsewhere moves
-- the pledge rather than stacking multiple allegiances, mirroring the
-- election_user_votes upsert-on-conflict pattern in elections.ts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_faction_allegiance (
  user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  faction_id  UUID        NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  pledged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_faction_allegiance_faction_idx ON user_faction_allegiance(faction_id);

-- RLS: read-only public access, consistent with the rest of the universe
-- layer (see consensus_votes_read in 2026090401_organization_layer.sql) —
-- all writes go through supabaseAdmin (service role) from the pledge API
-- route, never a client-side insert.
ALTER TABLE user_faction_allegiance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_faction_allegiance_read ON user_faction_allegiance;
CREATE POLICY user_faction_allegiance_read ON user_faction_allegiance FOR SELECT USING (TRUE);

