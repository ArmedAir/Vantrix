-- ============================================================================
-- Sign in with X — identity mapping table
-- Migration: 20270118_x_oauth_sign_in.sql
-- ============================================================================
--
-- Backs the OAuth2 + PKCE flow in src/lib/auth/x-sign-in.ts and
-- src/app/api/auth/x/{login,callback}/route.ts. No PKCE state itself is
-- stored here — code_verifier/state live in short-lived httpOnly cookies
-- for the handful of minutes the redirect round-trip takes (see the login
-- route). This table is the durable half: which Supabase auth user a given
-- X account resolves to, so a returning visitor signing in with X a second
-- time lands on the SAME account rather than minting a new one.
--
-- One row per X account. A Supabase auth user can accumulate at most one
-- x_oauth_identities row in practice (nothing in the callback route links
-- a second X account onto an already-authenticated session today — that
-- would be a real "connect another login method" feature, not part of
-- this sign-in flow), but the FK is on user_id -> profiles, not a unique
-- constraint on user_id, so it doesn't need to forbid that if it's added
-- later.

CREATE TABLE IF NOT EXISTS x_oauth_identities (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  x_user_id      TEXT        NOT NULL UNIQUE,
  x_username     TEXT,
  x_name         TEXT,
  x_avatar_url   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_x_oauth_identities_user ON x_oauth_identities (user_id);

ALTER TABLE x_oauth_identities ENABLE ROW LEVEL SECURITY;

-- A user can see that their own account is linked to X (e.g. a future
-- "Connected accounts" settings panel) but never anyone else's mapping.
CREATE POLICY "x_oauth_identities_own_read" ON x_oauth_identities
  FOR SELECT USING (user_id = auth.uid());

-- Written only by /api/auth/x/callback via supabaseAdmin (service role) —
-- the row must exist before a session does, so no authenticated-user
-- INSERT/UPDATE policy is needed or safe to add here.
CREATE POLICY "x_oauth_identities_service" ON x_oauth_identities
  FOR ALL TO service_role USING (TRUE);

COMMENT ON TABLE x_oauth_identities IS
  'Maps an X (Twitter) account to a Supabase auth user for "Sign in with X". Written by /api/auth/x/callback. See lib/auth/x-sign-in.ts for the OAuth2+PKCE exchange.';
