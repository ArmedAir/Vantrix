-- ─────────────────────────────────────────────────────────────────────────────
-- Moderation admin controls
--
-- Scope, deliberately narrow: this migration extends the ADMIN-FACING,
-- taste-level parts of the moderation system so admins can tune them
-- without a deploy. It does NOT touch, weaken, or make configurable:
--   - the hard-coded blocklist in src/lib/moderation/index.ts
--     (minors / sexual_violence / hate / violence / exploitation)
--   - reply-guard.ts's per-message chat-reply blocklist
--     (minors / self_harm_encouragement / real_violence)
--   - anything in crisis-detection.ts / crisis-response.ts
-- Those remain sync, code-reviewed, and unconditional. See each file's own
-- header comment for why (fail-closed safety nets, not product-taste
-- knobs). This migration is additive tooling around them, not a
-- replacement for them.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── moderation_prompt_config ────────────────────────────────────────────────
-- Single-row table of admin-editable guidance appended to the AI moderation
-- system prompt (src/lib/moderation/index.ts's MODERATION_SYSTEM_PROMPT) —
-- e.g. clarifying what counts as acceptable adult/romantic content for this
-- platform. Purely additive text; it cannot remove or override the immutable
-- base prompt's Block clause, and the app-side write path
-- (containsHardBlockedLanguage() in moderation/index.ts) rejects any admin
-- text that references the hard-blocked categories before it's ever saved.
-- The sync blocklist in moderateCharacter() also runs BEFORE the AI call
-- regardless of this config, so nothing here can affect that layer.
CREATE TABLE IF NOT EXISTS moderation_prompt_config (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  extra_allow_notes  TEXT NOT NULL DEFAULT '',
  extra_block_notes  TEXT NOT NULL DEFAULT '',

  updated_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enforce single-row: the app always reads/writes "the latest row" but a
-- unique constraint on a constant expression keeps a stray second INSERT
-- from ever creating ambiguity about which row is active.
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_prompt_config_singleton
  ON moderation_prompt_config ((true));

ALTER TABLE moderation_prompt_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_moderation_prompt_config" ON moderation_prompt_config
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "admin_write_moderation_prompt_config" ON moderation_prompt_config
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

COMMENT ON TABLE moderation_prompt_config IS
  'Admin-editable, taste-level additions to the AI moderation system prompt. '
  'Cannot override the hard-coded minors/violence/hate/exploitation blocklist — '
  'see src/lib/moderation/index.ts.';

-- ── keyword_watchlist.action ─────────────────────────────────────────────────
-- keyword-watch.ts was log-only by design (see its header). This adds an
-- opt-in second mode for CONTENT-CREATION surfaces only (character bios,
-- posts, comments — anything that already runs through moderateCharacter())
-- — 'hold_for_review' pauses persistence and routes the submission to
-- moderation_holds instead of the log-only keyword_watch_hits table.
-- Deliberately NOT wired into the live per-turn chat reply path
-- (reply-guard.ts) — that path has a <1ms latency budget and its own
-- hard-coded, non-admin-editable safety patterns, which this migration
-- does not touch.
ALTER TABLE keyword_watchlist
  ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'log'
    CHECK (action IN ('log', 'hold_for_review'));

COMMENT ON COLUMN keyword_watchlist.action IS
  '''log'' (default): match is recorded to keyword_watch_hits only, same as always. '
  '''hold_for_review'': for content-CREATION surfaces only (moderateCharacter() call '
  'sites) — blocks auto-publish and routes the submission to moderation_holds for '
  'manual admin decision. Never applied to the live chat reply path.';

-- ── moderation_holds ─────────────────────────────────────────────────────────
-- Review queue for content blocked specifically by a 'hold_for_review'
-- keyword match (as opposed to reply_guard_flags, which is the live-chat
-- hard-block log, or the hard-coded blocklist/AI rejections in
-- moderateCharacter(), which are simply rejected back to the user today and
-- were never queued anywhere). Stores the full originally-submitted payload
-- so an admin reviewing a hold has enough context to decide, and so a
-- future integration can resubmit it on approval without asking the user
-- to retype anything.
--
-- NOTE ON SCOPE: approving a hold here marks it 'approved' for the audit
-- trail; it does not automatically re-run the original create-character/
-- create-post/etc. request. Each call site's route already rejects
-- moderateCharacter()-blocked submissions before any DB write, so wiring
-- "approve -> actually publish" is a per-route integration. This table and
-- its admin route give full visibility and a manual decision point today;
-- auto-republish-on-approval is a natural next step per call site, not
-- included in this migration.
CREATE TABLE IF NOT EXISTS moderation_holds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  surface           TEXT NOT NULL,      -- e.g. 'character', 'community_post', 'community_reply', 'feed_comment'
  keyword_id        UUID REFERENCES keyword_watchlist(id) ON DELETE SET NULL,
  keyword_text      TEXT NOT NULL,
  submitted_payload JSONB NOT NULL,     -- the exact fields moderateCharacter() was called with
  excerpt           TEXT NOT NULL,

  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  reviewer_notes    TEXT
);

CREATE INDEX IF NOT EXISTS idx_moderation_holds_status_created
  ON moderation_holds (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_holds_user
  ON moderation_holds (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE moderation_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_moderation_holds" ON moderation_holds
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "admin_update_moderation_holds" ON moderation_holds
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

COMMENT ON TABLE moderation_holds IS
  'Review queue for submissions blocked by an admin-configured hold_for_review '
  'keyword (content-creation surfaces only). Approval is a manual audit decision, '
  'not an automatic republish — see this migration''s header comment.';
