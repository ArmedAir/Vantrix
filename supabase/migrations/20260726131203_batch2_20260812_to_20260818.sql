-- 20260812_conversation_dedupe_and_message_retention
with ranked as (
  select id, user_id, character_id,
    row_number() over (partition by user_id, character_id order by created_at asc, id asc) as rn
  from conversations
  where user_id is not null and character_id is not null
),
canonical as (
  select d.id as duplicate_id, c.id as canonical_id
  from ranked d join ranked c on c.user_id = d.user_id and c.character_id = d.character_id and c.rn = 1
  where d.rn > 1
)
update messages m set conversation_id = canonical.canonical_id
from canonical where m.conversation_id = canonical.duplicate_id;

with ranked as (
  select id, row_number() over (partition by user_id, character_id order by created_at asc, id asc) as rn
  from conversations
  where user_id is not null and character_id is not null
)
delete from conversations where id in (select id from ranked where rn > 1);

create unique index if not exists conversations_user_character_unique_idx
  on conversations (user_id, character_id)
  where user_id is not null and character_id is not null;

create table if not exists messages_archive (
  id              uuid        primary key,
  conversation_id uuid        not null references conversations(id) on delete cascade,
  role            text        not null,
  content         text        not null,
  image_url       text,
  tokens_used     integer     default 0,
  created_at      timestamptz not null,
  archived_at     timestamptz not null default now()
);
create index if not exists messages_archive_conversation_id_idx on messages_archive (conversation_id);
create index if not exists messages_archive_created_at_idx on messages_archive (created_at);
alter table messages_archive enable row level security;
drop policy if exists "messages_archive_own" on messages_archive;
create policy "messages_archive_own" on messages_archive for select using (
  exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION prune_old_messages(p_conversation_id UUID, p_keep INTEGER DEFAULT 200)
RETURNS VOID LANGUAGE sql AS $$
  SELECT NULL::void;
$$;

create index if not exists messages_created_at_idx on messages (created_at);

-- 20260813_content_engine
ALTER TABLE characters ADD COLUMN IF NOT EXISTS style_guide_notes TEXT;

CREATE TABLE IF NOT EXISTS character_content_queue (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id    UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  content_type    TEXT        NOT NULL CHECK (content_type IN ('image', 'chat_line', 'video')),
  status          TEXT        NOT NULL DEFAULT 'queued'
                              CHECK (status IN ('queued', 'generating', 'pending_review', 'published', 'rejected', 'failed')),
  prompt_input    TEXT,
  result_text     TEXT,
  result_url      TEXT,
  triggered_by    TEXT        NOT NULL DEFAULT 'admin' CHECK (triggered_by IN ('admin', 'cron')),
  created_by      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_by     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  moderation_category TEXT,
  error           TEXT,
  cost_usd        NUMERIC(10,4),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS content_queue_character_idx ON character_content_queue (character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_queue_status_idx    ON character_content_queue (status);
ALTER TABLE character_content_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "content_queue_admin_only" ON character_content_queue;
CREATE POLICY "content_queue_admin_only" ON character_content_queue FOR ALL USING (false);

CREATE TABLE IF NOT EXISTS character_content (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id    UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  queue_item_id   UUID        REFERENCES character_content_queue(id) ON DELETE SET NULL,
  content_type    TEXT        NOT NULL CHECK (content_type IN ('image', 'chat_line', 'video')),
  content_text    TEXT,
  content_url     TEXT,
  is_premium      BOOLEAN     NOT NULL DEFAULT TRUE,
  min_tier        TEXT        NOT NULL DEFAULT 'premium'
                              CHECK (min_tier IN ('free','spark','basic','premium','elite','enterprise')),
  display_order   INTEGER     NOT NULL DEFAULT 0,
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS character_content_character_idx ON character_content (character_id, content_type, active);
ALTER TABLE character_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "character_content_public_read" ON character_content;
CREATE POLICY "character_content_public_read" ON character_content FOR SELECT USING (active = true);
DROP POLICY IF EXISTS "character_content_no_client_write" ON character_content;
CREATE POLICY "character_content_no_client_write" ON character_content FOR INSERT WITH CHECK (false);

-- 20260814_annual_discount_60pct_basic_premium_elite
UPDATE tiers a
SET
  price_usd    = ROUND((m.price_usd * 12 * 0.4)::numeric, 2),
  price_ngn    = ROUND((m.price_ngn * 12 * 0.4)::numeric, 0),
  price_crypto = ROUND((m.price_crypto * 12 * 0.4)::numeric, 8)
FROM tiers m
WHERE a.billing_interval = 'annual'
  AND m.billing_interval = 'monthly'
  AND m.slug = a.base_tier_slug
  AND a.base_tier_slug IN ('basic', 'premium', 'elite');

COMMENT ON COLUMN tiers.price_usd IS 'For any *_annual row this is the full annual charge amount (not a monthly-equivalent). basic_annual/premium_annual/elite_annual are at 60% off as of 20260814; spark_annual remains at 20% off (20260716); enterprise_annual is display-only (never reaches checkout, see 20260811_enterprise_annual_tier_row.sql).';

-- 20260815_character_evolution_traits
CREATE TABLE IF NOT EXISTS character_evolution_traits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  character_id    uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  trait_key       text NOT NULL,
  trait_type      text NOT NULL CHECK (trait_type IN ('interest', 'habit')),
  label           text NOT NULL,
  origin_snippet  text,
  exposure_count  integer NOT NULL DEFAULT 1,
  strength        text NOT NULL DEFAULT 'noticing'
                    CHECK (strength IN ('noticing', 'adopted', 'integral', 'faded')),
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT character_evolution_traits_unique UNIQUE (user_id, character_id, trait_key)
);
CREATE INDEX IF NOT EXISTS idx_character_evolution_traits_lookup
  ON character_evolution_traits (user_id, character_id, exposure_count DESC);
CREATE INDEX IF NOT EXISTS idx_character_evolution_traits_last_seen
  ON character_evolution_traits (last_seen_at);

CREATE OR REPLACE FUNCTION set_character_evolution_traits_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_character_evolution_traits_updated_at ON character_evolution_traits;
CREATE TRIGGER trg_character_evolution_traits_updated_at
  BEFORE UPDATE ON character_evolution_traits
  FOR EACH ROW EXECUTE FUNCTION set_character_evolution_traits_updated_at();

ALTER TABLE character_evolution_traits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own evolution traits" ON character_evolution_traits;
CREATE POLICY "Users can view their own evolution traits"
  ON character_evolution_traits FOR SELECT
  USING (auth.uid() = user_id);

-- 20260816_secret_moments
create table if not exists secret_moments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  character_id   uuid not null references characters(id) on delete cascade,
  milestone_name text not null,
  moment_type    text not null,
  title          text not null,
  content        text not null,
  generated_by   text not null default 'llm',
  created_at     timestamptz not null default now()
);
create index if not exists idx_secret_moments_lookup
  on secret_moments (user_id, character_id, created_at desc);
alter table secret_moments enable row level security;
drop policy if exists secret_moments_own on secret_moments;
create policy secret_moments_own on secret_moments
  for select using (auth.uid() = user_id);

-- 20260817_character_surprises_delivered_flag
alter table character_surprises
  add column if not exists delivered boolean not null default false;
create index if not exists idx_character_surprises_pending
  on character_surprises (user_id, delivered, created_at desc)
  where delivered = false;

-- 20260818_fix_premium_tier_badge_colour
CREATE OR REPLACE FUNCTION set_tier_badge_colour()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.tier_badge_colour := CASE NEW.tier
    WHEN 'free'       THEN '#6b7280'
    WHEN 'spark'      THEN '#3b82f6'
    WHEN 'basic'      THEN '#10b981'
    WHEN 'premium'    THEN '#fb7185'
    WHEN 'elite'      THEN '#f59e0b'
    WHEN 'enterprise' THEN '#e0527a'
    ELSE '#6b7280'
  END;
  NEW.show_ads := (NEW.tier = 'free');
  RETURN NEW;
END;
$$;

UPDATE profiles
SET tier_badge_colour = '#fb7185'
WHERE tier = 'premium'
  AND tier_badge_colour = '#8b5cf6';
