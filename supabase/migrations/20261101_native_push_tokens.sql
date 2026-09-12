-- ─────────────────────────────────────────────────────────────────────────────
-- device_push_tokens — native mobile push token storage (FCM)
--
-- Sibling to push_subscriptions (Web Push/VAPID) but for the Capacitor
-- native shells (see mobile-capacitor/). Both platforms register through
-- Firebase Cloud Messaging: Android gets a native FCM registration token
-- directly; iOS gets one too, PROVIDED the iOS app is also configured with
-- GoogleService-Info.plist + an APNs key uploaded to the Firebase console
-- (standard Capacitor + FCM pairing — see NATIVE_APP.md). That lets
-- send-native-push.ts speak one protocol (FCM) for both platforms instead
-- of maintaining a second raw-APNs (HTTP/2 + provider JWT) sender.
--
-- One row per installed app instance (a user can have several — phone,
-- tablet). `token` is the natural dedupe key: FCM issues a new one when it
-- rotates, and upserting on it means a reinstall/token-refresh just
-- refreshes the row instead of creating a duplicate that would double-send.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  platform      TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  token         TEXT NOT NULL,
  app_version   TEXT,

  -- Soft-invalidated (not deleted) the first time FCM returns
  -- messaging/registration-token-not-registered for this token, mirroring
  -- push_subscriptions.invalid_at — send-native-push.ts filters on
  -- `invalid_at IS NULL`; a fresh registration from the same device later
  -- just clears it via upsert.
  invalid_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_push_tokens_token_unique
  ON device_push_tokens (token);
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user_id
  ON device_push_tokens (user_id) WHERE invalid_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user_last_seen
  ON device_push_tokens (user_id, last_seen_at);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Same shape as push_subscriptions: users manage their own device rows
-- directly (register/unregister from the native shell on launch); the send
-- path always runs through supabaseAdmin (service-role) from
-- send-native-push.ts, which bypasses RLS.
ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_push_tokens_owner_select" ON device_push_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "device_push_tokens_owner_insert" ON device_push_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "device_push_tokens_owner_update" ON device_push_tokens
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "device_push_tokens_owner_delete" ON device_push_tokens
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "device_push_tokens_service_all" ON device_push_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);
