-- ─────────────────────────────────────────────────────────────────────────────
-- X (Twitter) cross-posting — lets character_posts content (or standalone
-- copy) get queued for publishing to X. Nothing here can cause a live post by
-- itself: x_auto_publish_enabled defaults to 'false' below, and even with
-- credentials configured (see X_* vars in src/env.ts) the publisher pipeline
-- only posts rows an admin has approved (or, once enabled, that pass
-- eligibility + the daily cap). Same queue-then-publish shape as
-- character_content_queue / character_content (2026081300_content_engine.sql)
-- — generated/composed content lands here as PENDING, nothing goes out until
-- reviewed or explicitly auto-published.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_posts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id    UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  -- Optional link back to the character_posts row this was cross-posted
  -- from. Nullable because a tweet can also be composed standalone (not
  -- every X post has to mirror an in-app feed post).
  source_post_id  UUID        REFERENCES character_posts(id) ON DELETE SET NULL,
  status          TEXT        NOT NULL DEFAULT 'queued'
                              CHECK (status IN ('queued', 'pending_review', 'posting', 'posted', 'failed', 'skipped')),
  -- Composed tweet copy (280-char-aware — enforced by composer.ts, not here).
  tweet_text      TEXT,
  -- Source image (e.g. a character portrait) to be uploaded via the v1.1
  -- chunked media endpoint before the tweet is created.
  media_url       TEXT,
  -- Populated once posted, for delete/audit/analytics.
  x_tweet_id      TEXT,
  x_media_id      TEXT,
  -- Provenance — same admin/cron split as character_content_queue.
  triggered_by    TEXT        NOT NULL DEFAULT 'cron' CHECK (triggered_by IN ('admin', 'cron')),
  created_by      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_by     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  error           TEXT,
  posted_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS social_posts_character_idx ON social_posts (character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS social_posts_status_idx    ON social_posts (status);
-- Publisher's "how many posted today" cap check filters on posted_at; index
-- it directly rather than relying on the composite above for that scan.
CREATE INDEX IF NOT EXISTS social_posts_posted_at_idx ON social_posts (posted_at) WHERE status = 'posted';

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

-- Admin-only table: same access model as character_content_queue — all
-- reads/writes go through supabaseAdmin (service role, bypasses RLS) from
-- server actions/cron/the /admin/social UI. No policy grants anon/
-- authenticated access, so a client-side query returns nothing regardless
-- of who's asking.
DROP POLICY IF EXISTS "social_posts_admin_only" ON social_posts;
CREATE POLICY "social_posts_admin_only" ON social_posts FOR ALL USING (false);

-- Marks an in-app feed post as already mirrored to X, so the eligibility/
-- auto-select step (eligibility.ts / auto-select.ts) doesn't re-queue the
-- same character_posts row twice.
ALTER TABLE character_posts ADD COLUMN IF NOT EXISTS crossposted_to_x BOOLEAN NOT NULL DEFAULT FALSE;

-- Live auto-publish switch + daily cap, editable without a redeploy (same
-- pattern as contact_email / discord_invite_url in
-- 20261216_seed_contact_and_discord_config.sql). Auto-publish is seeded OFF:
-- connecting X_* credentials alone can never cause a surprise live post —
-- an admin has to flip this explicitly (or approve queued rows one at a
-- time via /admin/social) before the cron publisher will post unattended.
INSERT INTO app_config (key, value, description)
VALUES
  ('x_auto_publish_enabled', 'false', 'When true, the X publisher cron posts eligible queued rows unattended. Off by default — admin must opt in.'),
  ('x_daily_post_cap',       '10',    'Max posts the X publisher cron will send per UTC day, across all characters combined.')
ON CONFLICT (key) DO NOTHING;
