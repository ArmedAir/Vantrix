-- 20260905_daily_world_choice
CREATE TABLE IF NOT EXISTS daily_world_choices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id    uuid REFERENCES world_locations(id) ON DELETE SET NULL,
  prompt         text NOT NULL,
  option_a_label text NOT NULL,
  option_b_label text NOT NULL,
  context        text,
  option_a_effect jsonb NOT NULL DEFAULT '{}'::jsonb,
  option_b_effect jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_date    date NOT NULL DEFAULT CURRENT_DATE,
  resolved       boolean NOT NULL DEFAULT false,
  resolved_option text CHECK (resolved_option IN ('a', 'b')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz,
  UNIQUE (active_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_world_choices_active
  ON daily_world_choices(active_date) WHERE NOT resolved;

CREATE TABLE IF NOT EXISTS user_world_choice_votes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  choice_id  uuid NOT NULL REFERENCES daily_world_choices(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option     text NOT NULL CHECK (option IN ('a', 'b')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (choice_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_world_choice_votes_choice
  ON user_world_choice_votes(choice_id);

CREATE OR REPLACE VIEW daily_world_choice_tallies AS
SELECT
  choice_id,
  COUNT(*) FILTER (WHERE option = 'a') AS votes_a,
  COUNT(*) FILTER (WHERE option = 'b') AS votes_b,
  COUNT(*)                             AS votes_total
FROM user_world_choice_votes
GROUP BY choice_id;

ALTER TABLE daily_world_choices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_world_choice_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_daily_world_choices" ON daily_world_choices
  FOR SELECT USING (true);

CREATE POLICY "users_read_own_vote" ON user_world_choice_votes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_vote" ON user_world_choice_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

GRANT SELECT ON daily_world_choice_tallies TO anon, authenticated;

-- 20260906_community_engine
create table if not exists neighborhoods (
  id                  uuid primary key default gen_random_uuid(),
  parent_location_id  uuid not null references world_locations(id) on delete cascade,
  name                text not null,
  vibe                text not null default 'quiet',
  cohesion            integer not null default 60 check (cohesion between 0 and 100),
  resident_count      integer not null default 0 check (resident_count >= 0),
  created_at          timestamptz not null default now()
);
create index if not exists idx_neighborhoods_parent_location on neighborhoods(parent_location_id);

create table if not exists neighborhood_residents (
  id               uuid primary key default gen_random_uuid(),
  character_id     uuid not null references characters(id) on delete cascade,
  neighborhood_id  uuid not null references neighborhoods(id) on delete cascade,
  moved_in_at      timestamptz not null default now(),
  constraint neighborhood_residents_unique_character unique (character_id)
);
create index if not exists idx_neighborhood_residents_neighborhood on neighborhood_residents(neighborhood_id);

create table if not exists community_organizations (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  slug                   text not null unique,
  mission                text not null,
  category               text not null check (category in
                            ('civic', 'labor', 'charitable', 'professional', 'advocacy', 'religious', 'academic')),
  location_id            uuid references world_locations(id) on delete set null,
  founder_character_id   uuid not null references characters(id) on delete cascade,
  influence              integer not null default 20 check (influence between 0 and 100),
  member_count           integer not null default 0 check (member_count >= 0),
  status                 text not null default 'active' check (status in ('active', 'dissolved')),
  created_at             timestamptz not null default now()
);
create index if not exists idx_community_organizations_founder on community_organizations(founder_character_id);
create index if not exists idx_community_organizations_location on community_organizations(location_id);
create index if not exists idx_community_organizations_status on community_organizations(status);

create table if not exists community_organization_memberships (
  id                  uuid primary key default gen_random_uuid(),
  character_id        uuid not null references characters(id) on delete cascade,
  organization_id     uuid not null references community_organizations(id) on delete cascade,
  role                text not null default 'member' check (role in ('founder', 'officer', 'member')),
  joined_at           timestamptz not null default now(),
  constraint community_org_memberships_unique_character unique (character_id)
);
create index if not exists idx_community_org_memberships_org on community_organization_memberships(organization_id);

create table if not exists clubs (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  slug                   text not null unique,
  interest_tag           text not null,
  description            text,
  location_id            uuid references world_locations(id) on delete set null,
  founder_character_id   uuid not null references characters(id) on delete cascade,
  member_count           integer not null default 0 check (member_count >= 0),
  member_cap             integer not null default 25 check (member_cap > 0),
  status                 text not null default 'active' check (status in ('active', 'disbanded')),
  created_at             timestamptz not null default now()
);
create index if not exists idx_clubs_interest_tag on clubs(interest_tag);
create index if not exists idx_clubs_location on clubs(location_id);
create index if not exists idx_clubs_status on clubs(status);

create table if not exists club_memberships (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references characters(id) on delete cascade,
  club_id       uuid not null references clubs(id) on delete cascade,
  role          text not null default 'member' check (role in ('founder', 'member')),
  joined_at     timestamptz not null default now()
);
create index if not exists idx_club_memberships_club on club_memberships(club_id);
create index if not exists idx_club_memberships_character on club_memberships(character_id);

alter table neighborhoods                      enable row level security;
alter table neighborhood_residents              enable row level security;
alter table community_organizations             enable row level security;
alter table community_organization_memberships  enable row level security;
alter table clubs                               enable row level security;
alter table club_memberships                    enable row level security;

create policy "public read neighborhoods"                     on neighborhoods                     for select using (true);
create policy "public read neighborhood_residents"             on neighborhood_residents             for select using (true);
create policy "public read community_organizations"            on community_organizations            for select using (true);
create policy "public read community_organization_memberships" on community_organization_memberships for select using (true);
create policy "public read clubs"                              on clubs                              for select using (true);
create policy "public read club_memberships"                   on club_memberships                   for select using (true);

-- 20260910_resource_trade_engine
create table if not exists location_resources (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references world_locations(id) on delete cascade,
  resource_type  text not null check (resource_type in ('iron', 'food', 'water', 'energy', 'technology')),
  quantity       numeric not null default 0 check (quantity >= 0),
  updated_at     timestamptz not null default now(),
  constraint location_resources_unique unique (location_id, resource_type)
);
create index if not exists idx_location_resources_location on location_resources(location_id);

create table if not exists company_resources (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  resource_type  text not null check (resource_type in ('iron', 'food', 'water', 'energy', 'technology')),
  quantity       numeric not null default 0 check (quantity >= 0),
  updated_at     timestamptz not null default now(),
  constraint company_resources_unique unique (company_id, resource_type)
);
create index if not exists idx_company_resources_company on company_resources(company_id);

alter table location_resources enable row level security;
alter table company_resources  enable row level security;
create policy "public read location_resources" on location_resources for select using (true);
create policy "public read company_resources"  on company_resources  for select using (true);

create table if not exists resource_trades (
  id             uuid primary key default gen_random_uuid(),
  from_type      text    not null check (from_type in ('location', 'company')),
  from_id        uuid    not null,
  to_type        text    not null check (to_type in ('location', 'company')),
  to_id          uuid    not null,
  resource_type  text    not null,
  quantity       numeric not null check (quantity > 0),
  unit_price     numeric not null default 0,
  total_value    numeric not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists idx_resource_trades_from on resource_trades(from_type, from_id);
create index if not exists idx_resource_trades_to   on resource_trades(to_type, to_id);
create index if not exists idx_resource_trades_created_at on resource_trades(created_at desc);

alter table resource_trades enable row level security;
create policy "public read resource_trades" on resource_trades for select using (true);
