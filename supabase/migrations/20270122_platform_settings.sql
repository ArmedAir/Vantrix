-- ─────────────────────────────────────────────────────────────────────────────
-- Platform settings (admin Settings hub)
--
-- Prior to this, admin-editable config existed but was scattered with no
-- single home: moderation_prompt_config lives under /admin/safety,
-- social_settings under /admin/social, and there was no home at all for
-- general platform-level toggles (maintenance mode, new-signup gate,
-- global mature-content gate). This adds that missing general table and,
-- paired with the app-side changes, a single /admin/settings hub page that
-- surfaces this table plus links out to the two existing settings panels.
--
-- Deliberately NOT a generic key-value config table — explicit typed
-- columns, same reasoning as moderation_prompt_config: a fixed, reviewed
-- shape beats an open-ended bag of untyped values that any future code
-- path could read/write unchecked.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- When true, non-admin traffic sees the maintenance page (enforced in
  -- middleware.ts — app-side change, this migration only stores the flag).
  maintenance_mode        BOOLEAN NOT NULL DEFAULT false,
  maintenance_message     TEXT NOT NULL DEFAULT 'Vantrix is undergoing scheduled maintenance. Please check back shortly.',

  -- When false, /signup and the signup API reject new account creation;
  -- existing users are unaffected.
  new_signups_enabled     BOOLEAN NOT NULL DEFAULT true,

  -- Master override: when false, mature content is unavailable platform-wide
  -- regardless of any individual profile's nsfw_enabled setting.
  mature_content_enabled  BOOLEAN NOT NULL DEFAULT true,

  updated_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enforce single-row, same pattern as moderation_prompt_config.
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_settings_singleton
  ON platform_settings ((true));

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_platform_settings" ON platform_settings
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "admin_write_platform_settings" ON platform_settings
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

COMMENT ON TABLE platform_settings IS
  'Single-row table of general platform-wide toggles (maintenance mode, '
  'new-signup gate, global mature-content gate), managed from /admin/settings.';
