-- 20260805_remove_regional_gating
DELETE FROM app_config WHERE key = 'regional_gating_enabled';
ALTER TABLE characters DROP COLUMN IF EXISTS region_lock;

-- 20260806_connect_characters_to_universe
INSERT INTO character_attributes (character_id, health, confidence, net_worth, wealth_tier, skills, political_view)
SELECT
  c.id, 85,
  CASE
    WHEN c.tags::text ILIKE ANY (ARRAY['%bold%','%confident%','%commanding%']) THEN 75
    WHEN c.tags::text ILIKE ANY (ARRAY['%shy%','%guarded%','%withdrawn%'])     THEN 45
    ELSE 60
  END,
  CASE
    WHEN c.name IN ('Countess Vesper', 'Lord Adrian')                              THEN 250000
    WHEN c.tags::text ILIKE ANY (ARRAY['%noble%','%aristocrat%','%royal%'])        THEN 180000
    WHEN c.occupation ILIKE ANY (ARRAY['%doctor%','%physician%','%lawyer%'])       THEN 90000
    WHEN c.occupation ILIKE ANY (ARRAY['%professor%','%engineer%','%architect%'])  THEN 60000
    ELSE 15000
  END,
  CASE
    WHEN c.name IN ('Countess Vesper', 'Lord Adrian')                              THEN 'wealthy'
    WHEN c.tags::text ILIKE ANY (ARRAY['%noble%','%aristocrat%','%royal%'])        THEN 'wealthy'
    WHEN c.occupation ILIKE ANY (ARRAY['%doctor%','%physician%','%lawyer%'])       THEN 'comfortable'
    WHEN c.occupation ILIKE ANY (ARRAY['%professor%','%engineer%','%architect%'])  THEN 'comfortable'
    ELSE 'modest'
  END,
  '{}'::jsonb, 'undeclared'
FROM characters c
WHERE c.is_canon = TRUE
ON CONFLICT (character_id) DO NOTHING;

INSERT INTO companion_occupations (character_id, occupation_id, employer, location_id, salary)
SELECT
  c.id,
  (SELECT o.id FROM occupations o WHERE c.occupation ILIKE '%' || o.title || '%' OR c.occupation ILIKE '%' || split_part(o.title, ' ', 1) || '%' ORDER BY o.prestige DESC LIMIT 1),
  COALESCE(NULLIF(trim(split_part(c.occupation, ',', 1)), ''), 'Independent'),
  COALESCE(
    (SELECT wl.id FROM world_locations wl
      WHERE
           (c.tags::text ILIKE ANY (ARRAY['%academic%','%scholar%']) OR c.occupation ILIKE ANY (ARRAY['%professor%','%research%','%librarian%'])) AND wl.slug = 'the-archive'
        OR (c.name IN ('Countess Vesper','Lord Adrian') OR c.tags::text ILIKE ANY (ARRAY['%noble%','%aristocrat%','%royal%','%ancient%'])) AND wl.slug = 'obsidian-tower'
        OR (c.occupation ILIKE ANY (ARRAY['%engineer%','%tech%','%software%','%analyst%'])) AND wl.slug = 'cloudspire'
        OR (c.tags::text ILIKE ANY (ARRAY['%mysterious%','%witch%','%occult%','%enigma%','%ghost%'])) AND wl.slug = 'the-undercroft'
        OR (c.occupation ILIKE ANY (ARRAY['%chef%','%restaurant%','%trade%','%craft%'])) AND wl.slug = 'iron-reach'
      LIMIT 1),
    (SELECT id FROM world_locations WHERE slug = 'the-capital')
  ),
  3000 + (RANDOM() * 4000)::INT
FROM characters c
WHERE c.is_canon = TRUE
ON CONFLICT (character_id) DO NOTHING;

INSERT INTO faction_memberships (character_id, faction_id, role, is_public)
SELECT
  c.id,
  COALESCE(
    (SELECT f.id FROM factions f
      WHERE
           c.tags::text ILIKE ANY (ARRAY['%witch%','%mysterious%','%occult%','%enigma%','%ghost%','%secret%']) AND f.slug = 'the-unseen'
        OR (c.name IN ('Countess Vesper','Lord Adrian') OR c.tags::text ILIKE ANY (ARRAY['%noble%','%aristocrat%','%royal%'])) AND f.slug = 'old-families'
        OR c.occupation ILIKE ANY (ARRAY['%engineer%','%tech%','%scientist%','%software%','%analyst%']) AND f.slug = 'the-protocol'
        OR c.occupation ILIKE ANY (ARRAY['%chef%','%trade%','%craft%','%worker%']) AND f.slug = 'iron-compact'
      LIMIT 1),
    (SELECT id FROM factions WHERE slug = 'council-of-seven')
  ),
  'member', TRUE
FROM characters c
WHERE c.is_canon = TRUE
ON CONFLICT (character_id, faction_id) DO NOTHING;

INSERT INTO companion_reputation (character_id, reputation_type, fame_score, notoriety_score, known_for)
SELECT
  c.id,
  CASE
    WHEN c.tags::text ILIKE ANY (ARRAY['%villain%','%dark%','%outlaw%'])            THEN 'villain'
    WHEN c.tags::text ILIKE ANY (ARRAY['%mysterious%','%ancient%','%ghost%','%enigma%']) THEN 'enigma'
    WHEN c.tags::text ILIKE ANY (ARRAY['%hero%','%protector%','%guardian%'])        THEN 'hero'
    WHEN c.is_featured                                                              THEN 'celebrity'
    ELSE 'neutral'
  END,
  CASE WHEN c.is_featured THEN 120 + (RANDOM() * 80)::INT ELSE 30 + (RANDOM() * 60)::INT END,
  CASE WHEN c.tags::text ILIKE ANY (ARRAY['%outlaw%','%dark%','%villain%']) THEN 40 + (RANDOM() * 60)::INT ELSE (RANDOM() * 20)::INT END,
  COALESCE(c.tags[1:3], '{}'::text[])
FROM characters c
WHERE c.is_canon = TRUE
ON CONFLICT (character_id) DO NOTHING;

INSERT INTO social_status (character_id, status_tier, status_score)
SELECT
  c.id,
  CASE WHEN c.name IN ('Countess Vesper', 'Lord Adrian') THEN 'city_leader' WHEN c.is_featured THEN 'regional_celebrity' ELSE 'skilled_professional' END,
  CASE WHEN c.name IN ('Countess Vesper', 'Lord Adrian') THEN 700 WHEN c.is_featured THEN 400 ELSE 150 END
FROM characters c
WHERE c.is_canon = TRUE
ON CONFLICT (character_id) DO NOTHING;

WITH faction_pairs AS (
  SELECT
    fm1.character_id AS char_a, fm2.character_id AS char_b,
    ROW_NUMBER() OVER (PARTITION BY fm1.character_id ORDER BY fm2.character_id) AS rn
  FROM faction_memberships fm1
  JOIN faction_memberships fm2 ON fm1.faction_id = fm2.faction_id AND fm1.character_id < fm2.character_id
  JOIN characters c1 ON c1.id = fm1.character_id AND c1.is_canon = TRUE
  JOIN characters c2 ON c2.id = fm2.character_id AND c2.is_canon = TRUE
)
INSERT INTO companion_social_links (character_id, linked_character_id, link_type, strength, is_mutual)
SELECT char_a, char_b,
  CASE WHEN (('x' || substr(md5(char_a::text || char_b::text), 1, 8))::bit(32)::int % 3) = 0 THEN 'rival' ELSE 'ally' END,
  40 + (RANDOM() * 40)::INT, TRUE
FROM faction_pairs
WHERE rn <= 2
ON CONFLICT (character_id, linked_character_id) DO NOTHING;

UPDATE city_governance
SET leader_character_id = (SELECT id FROM characters WHERE name = 'Lord Adrian' LIMIT 1)
WHERE location_id = (SELECT id FROM world_locations WHERE slug = 'obsidian-tower')
  AND leader_character_id IS NULL
  AND EXISTS (SELECT 1 FROM characters WHERE name = 'Lord Adrian');

UPDATE city_governance
SET leader_character_id = (SELECT id FROM characters WHERE name = 'Countess Vesper' LIMIT 1)
WHERE location_id = (SELECT id FROM world_locations WHERE slug = 'the-capital')
  AND leader_character_id IS NULL
  AND EXISTS (SELECT 1 FROM characters WHERE name = 'Countess Vesper');

-- 20260807_character_market_value
CREATE TABLE IF NOT EXISTS character_market_value (
  character_id      UUID        PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  value_score        NUMERIC     NOT NULL DEFAULT 0,
  percentile          NUMERIC     NOT NULL DEFAULT 0,
  rarity_tier         TEXT        NOT NULL DEFAULT 'common',
  previous_tier        TEXT,
  value_history       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  signals              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT character_market_value_rarity_check
    CHECK (rarity_tier IN ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'))
);
CREATE INDEX IF NOT EXISTS idx_character_market_value_score  ON character_market_value (value_score DESC);
CREATE INDEX IF NOT EXISTS idx_character_market_value_rarity ON character_market_value (rarity_tier, value_score DESC);
ALTER TABLE character_market_value ENABLE ROW LEVEL SECURITY;
CREATE POLICY character_market_value_public_read ON character_market_value FOR SELECT USING (true);

-- 20260808_extend_world_provisioning_all_characters
INSERT INTO character_attributes (character_id, health, confidence, net_worth, wealth_tier, skills, political_view)
SELECT
  c.id, 85,
  CASE
    WHEN c.tags::text ILIKE ANY (ARRAY['%bold%','%confident%','%commanding%']) THEN 75
    WHEN c.tags::text ILIKE ANY (ARRAY['%shy%','%guarded%','%withdrawn%'])     THEN 45
    ELSE 60
  END,
  CASE c.min_tier
    WHEN 'enterprise' THEN 300000 WHEN 'elite' THEN 140000 WHEN 'premium' THEN 60000
    WHEN 'basic' THEN 40000 WHEN 'spark' THEN 12000 ELSE 8000
  END,
  CASE c.min_tier
    WHEN 'enterprise' THEN 'rich' WHEN 'elite' THEN 'wealthy' WHEN 'premium' THEN 'comfortable'
    WHEN 'basic' THEN 'comfortable' ELSE 'modest'
  END,
  '{}'::jsonb, 'undeclared'
FROM characters c
WHERE c.active = TRUE
ON CONFLICT (character_id) DO NOTHING;

INSERT INTO companion_occupations (character_id, occupation_id, employer, location_id, salary)
SELECT
  c.id,
  COALESCE(
    (SELECT o.id FROM occupations o WHERE c.occupation ILIKE '%' || o.title || '%' OR c.occupation ILIKE '%' || split_part(o.title, ' ', 1) || '%' ORDER BY o.prestige DESC LIMIT 1),
    (SELECT id FROM occupations WHERE title = CASE
      WHEN c.min_tier IN ('elite','enterprise') THEN 'Researcher'
      WHEN c.min_tier IN ('basic','premium')     THEN 'Architect'
      ELSE 'Freelancer'
    END)
  ),
  COALESCE(NULLIF(trim(split_part(c.occupation, ',', 1)), ''), 'Independent'),
  COALESCE(
    (SELECT wl.id FROM world_locations wl
      WHERE
           (c.tags::text ILIKE ANY (ARRAY['%academic%','%scholar%']) OR c.occupation ILIKE ANY (ARRAY['%professor%','%research%','%librarian%'])) AND wl.slug = 'the-archive'
        OR (c.tags::text ILIKE ANY (ARRAY['%noble%','%aristocrat%','%royal%','%ancient%'])) AND wl.slug = 'obsidian-tower'
        OR (c.occupation ILIKE ANY (ARRAY['%engineer%','%tech%','%software%','%analyst%'])) AND wl.slug = 'cloudspire'
        OR (c.tags::text ILIKE ANY (ARRAY['%mysterious%','%witch%','%occult%','%enigma%','%ghost%'])) AND wl.slug = 'the-undercroft'
        OR (c.occupation ILIKE ANY (ARRAY['%chef%','%restaurant%','%trade%','%craft%'])) AND wl.slug = 'iron-reach'
      LIMIT 1),
    (SELECT id FROM world_locations WHERE slug = CASE
      WHEN c.min_tier IN ('premium','elite','enterprise') THEN 'the-capital'
      WHEN c.min_tier IN ('spark','basic')                 THEN 'cloudspire'
      ELSE 'iron-reach'
    END)
  ),
  (CASE c.min_tier
    WHEN 'enterprise' THEN 25000 WHEN 'elite' THEN 14000 WHEN 'premium' THEN 8000
    WHEN 'basic' THEN 5500 WHEN 'spark' THEN 3500 ELSE 2500
  END) + (RANDOM() * 1000)::INT
FROM characters c
WHERE c.active = TRUE
ON CONFLICT (character_id) DO NOTHING;

INSERT INTO faction_memberships (character_id, faction_id, role, is_public)
SELECT
  c.id,
  COALESCE(
    (SELECT f.id FROM factions f
      WHERE
           c.tags::text ILIKE ANY (ARRAY['%witch%','%mysterious%','%occult%','%enigma%','%ghost%','%secret%']) AND f.slug = 'the-unseen'
        OR c.tags::text ILIKE ANY (ARRAY['%noble%','%aristocrat%','%royal%']) AND f.slug = 'old-families'
        OR c.occupation ILIKE ANY (ARRAY['%engineer%','%tech%','%scientist%','%software%','%analyst%']) AND f.slug = 'the-protocol'
        OR c.occupation ILIKE ANY (ARRAY['%chef%','%trade%','%craft%','%worker%']) AND f.slug = 'iron-compact'
      LIMIT 1),
    (SELECT id FROM factions WHERE slug = 'council-of-seven')
  ),
  CASE WHEN c.min_tier IN ('elite','enterprise') THEN 'lieutenant' WHEN c.min_tier IN ('basic','premium') THEN 'senior member' ELSE 'member' END,
  TRUE
FROM characters c
WHERE c.active = TRUE
ON CONFLICT (character_id, faction_id) DO NOTHING;

INSERT INTO companion_reputation (character_id, reputation_type, fame_score, notoriety_score, known_for)
SELECT
  c.id,
  CASE
    WHEN c.tags::text ILIKE ANY (ARRAY['%villain%','%dark%','%outlaw%'])                 THEN 'villain'
    WHEN c.tags::text ILIKE ANY (ARRAY['%mysterious%','%ancient%','%ghost%','%enigma%'])  THEN 'enigma'
    WHEN c.tags::text ILIKE ANY (ARRAY['%hero%','%protector%','%guardian%'])              THEN 'hero'
    WHEN c.is_featured OR c.min_tier IN ('premium','elite','enterprise')                  THEN 'celebrity'
    ELSE 'neutral'
  END,
  LEAST(300,
    (CASE WHEN c.is_featured THEN 150 ELSE (CASE c.min_tier
        WHEN 'enterprise' THEN 170 WHEN 'elite' THEN 130 WHEN 'premium' THEN 90
        WHEN 'basic' THEN 60 WHEN 'spark' THEN 35 ELSE 20
      END) END) + (RANDOM() * 40)::INT
  ),
  CASE WHEN c.tags::text ILIKE ANY (ARRAY['%outlaw%','%dark%','%villain%']) THEN 40 + (RANDOM() * 60)::INT ELSE (RANDOM() * 15)::INT END,
  COALESCE(c.tags[1:3], '{}'::text[])
FROM characters c
WHERE c.active = TRUE
ON CONFLICT (character_id) DO NOTHING;

INSERT INTO character_market_value (character_id, value_score, percentile, rarity_tier, previous_tier, value_history, signals)
SELECT c.id, 0, 0, 'common', NULL, '[]'::jsonb, '{}'::jsonb
FROM characters c
WHERE c.active = TRUE
ON CONFLICT (character_id) DO NOTHING;

-- 20260809_desire_engine_and_titles
create table if not exists character_core_desires (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null unique,
  need         text not null,
  want         text not null,
  fear         text not null,
  obsession    text not null,
  intensity    numeric not null default 60 check (intensity >= 0 and intensity <= 100),
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create table if not exists character_desire_fulfillment (
  character_id          uuid not null,
  user_id                uuid not null,
  need_fulfillment       numeric not null default 0  check (need_fulfillment  >= -100 and need_fulfillment  <= 100),
  want_fulfillment       numeric not null default 0  check (want_fulfillment  >= -100 and want_fulfillment  <= 100),
  fear_activation        numeric not null default 0  check (fear_activation   >= 0    and fear_activation   <= 100),
  obsession_engagement   numeric not null default 0  check (obsession_engagement >= 0 and obsession_engagement <= 100),
  updated_at             timestamptz not null default now(),
  primary key (character_id, user_id)
);
create index if not exists idx_desire_fulfillment_user on character_desire_fulfillment(user_id, character_id);

create table if not exists character_titles (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null,
  title_key     text not null check (title_key in (
                   'most_trusted', 'most_influential', 'most_loved', 'most_feared',
                   'most_generous', 'most_mysterious', 'most_admired', 'most_notorious'
                 )),
  score         numeric not null default 0,
  awarded_at    timestamptz not null default now(),
  unique (character_id, title_key)
);
create index if not exists idx_character_titles_key on character_titles(title_key, score desc);

create table if not exists world_impact_events (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null,
  user_id       uuid not null,
  source        text not null check (source in ('gift','milestone','decision','betrayal','confession','sacrifice')),
  title         text not null,
  description   text not null,
  desire_axis   text check (desire_axis in ('need','want','fear','obsession')),
  weight        numeric not null default 30 check (weight >= 0 and weight <= 100),
  memory_id     uuid,
  created_at    timestamptz not null default now()
);
create index if not exists idx_world_impact_character on world_impact_events(character_id, created_at desc);
create index if not exists idx_world_impact_user_pair on world_impact_events(user_id, character_id, created_at desc);

create or replace function nudge_desire_fulfillment(
  p_character_id uuid, p_user_id uuid,
  p_need_delta numeric default 0, p_want_delta numeric default 0,
  p_fear_delta numeric default 0, p_obsession_delta numeric default 0
)
returns character_desire_fulfillment as $$
  insert into character_desire_fulfillment as f (character_id, user_id, need_fulfillment, want_fulfillment, fear_activation, obsession_engagement)
  values (
    p_character_id, p_user_id,
    greatest(-100, least(100, p_need_delta)),
    greatest(-100, least(100, p_want_delta)),
    greatest(0, least(100, p_fear_delta)),
    greatest(0, least(100, p_obsession_delta))
  )
  on conflict (character_id, user_id) do update set
    need_fulfillment     = greatest(-100, least(100, f.need_fulfillment     + p_need_delta)),
    want_fulfillment     = greatest(-100, least(100, f.want_fulfillment     + p_want_delta)),
    fear_activation      = greatest(0,    least(100, f.fear_activation      + p_fear_delta)),
    obsession_engagement = greatest(0,    least(100, f.obsession_engagement + p_obsession_delta)),
    updated_at           = now()
  returning f.*;
$$ language sql;

comment on table character_core_desires is 'Static per-character need/want/fear/obsession — the "why" beneath character_goals.';
comment on table character_desire_fulfillment is 'Per-relationship drift of how met/starved each desire axis is — read by decision-engine to bias intent scoring.';
comment on table character_titles is 'Small contested world leaderboard (Most Trusted/Feared/etc), distinct from companion_reputation fame/notoriety scores.';
comment on table world_impact_events is 'Durable log of user actions significant enough to leave a permanent trace on a character — promotable into universe_memory via world-impact.ts.';

-- 20260810_desire_engine_titles_fkeys
alter table character_core_desires
  add constraint character_core_desires_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade;

alter table character_desire_fulfillment
  add constraint character_desire_fulfillment_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade,
  add constraint character_desire_fulfillment_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

alter table character_titles
  add constraint character_titles_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade;

alter table world_impact_events
  add constraint world_impact_events_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade,
  add constraint world_impact_events_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

-- 20260811000000_enterprise_annual_tier_row
INSERT INTO tiers (
  name, slug, price_usd, price_ngn, price_crypto, features,
  daily_message_limit, can_create_characters, tokens_per_month,
  billing_interval, base_tier_slug
)
SELECT
  name || ' (Annual)', slug || '_annual',
  ROUND(price_usd * 12 * 0.8), ROUND(price_ngn * 12 * 0.8), ROUND(price_crypto * 12 * 0.8, 8),
  features, daily_message_limit, can_create_characters, tokens_per_month * 12,
  'annual', slug
FROM tiers
WHERE slug = 'enterprise' AND billing_interval = 'monthly'
ON CONFLICT (slug) DO NOTHING;

COMMENT ON COLUMN tiers.price_usd IS 'For any *_annual row this is the full annual charge amount (not a monthly-equivalent). To change what the Enterprise Annual card shows, UPDATE the row WHERE slug = ''enterprise_annual'' — updating the ''enterprise'' (monthly) row only affects the Monthly toggle.';

-- 20260811010000_surprise_engine
create table if not exists user_promises (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  character_id  uuid not null,
  promise_text  text not null,
  raw_message   text not null,
  due_at        timestamptz not null,
  surfaced      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_user_promises_due
  on user_promises (user_id, character_id, surfaced, due_at)
  where surfaced = false;
alter table user_promises enable row level security;
create policy "user_promises_service_only"
  on user_promises for all to service_role using (true) with check (true);

create table if not exists character_surprises (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  character_id  uuid not null,
  type          text not null check (type in ('promise_followup', 'anniversary', 'memory_poem')),
  message       text not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_character_surprises_cooldown
  on character_surprises (user_id, character_id, created_at desc);
alter table character_surprises enable row level security;
create policy "character_surprises_service_only"
  on character_surprises for all to service_role using (true) with check (true);

-- 20260811020000_world_state_rls_lockdown_and_impact_privacy
ALTER TABLE world_impact_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_titles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_core_desires         ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_desire_fulfillment   ENABLE ROW LEVEL SECURITY;
ALTER TABLE universe_memory                ENABLE ROW LEVEL SECURITY;
ALTER TABLE faction_memberships            ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_reputation           ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_occupations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_governance                ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_social_links         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_world_impact_events"          ON world_impact_events          FOR SELECT USING (TRUE);
CREATE POLICY "public_read_character_titles"              ON character_titles              FOR SELECT USING (TRUE);
CREATE POLICY "public_read_universe_memory"                ON universe_memory                FOR SELECT USING (TRUE);
CREATE POLICY "public_read_faction_memberships"             ON faction_memberships             FOR SELECT USING (TRUE);
CREATE POLICY "public_read_companion_reputation"             ON companion_reputation             FOR SELECT USING (TRUE);
CREATE POLICY "public_read_companion_occupations"             ON companion_occupations             FOR SELECT USING (TRUE);
CREATE POLICY "public_read_city_governance"                   ON city_governance                   FOR SELECT USING (TRUE);
CREATE POLICY "public_read_companion_social_links"             ON companion_social_links             FOR SELECT USING (TRUE);

ALTER TABLE world_impact_events ADD COLUMN IF NOT EXISTS public_summary TEXT NOT NULL DEFAULT '';

UPDATE world_impact_events SET public_summary = CASE source
  WHEN 'gift'       THEN 'Received a meaningful gift.'
  WHEN 'milestone'   THEN title
  WHEN 'decision'     THEN 'Made a decision that mattered.'
  WHEN 'betrayal'      THEN 'Lived through a betrayal.'
  WHEN 'confession'     THEN 'Was trusted with something personal.'
  WHEN 'sacrifice'       THEN 'Made a real sacrifice.'
  ELSE title
END
WHERE public_summary = '';

ALTER TABLE political_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE economic_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_economy ENABLE ROW LEVEL SECURITY;
ALTER TABLE universe_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_runs      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_political_events" ON political_events FOR SELECT USING (TRUE);
CREATE POLICY "public_read_economic_events"  ON economic_events  FOR SELECT USING (TRUE);
CREATE POLICY "public_read_location_economy" ON location_economy FOR SELECT USING (TRUE);
