-- 20260830_belief_engine
create table if not exists user_beliefs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,
  character_id        uuid not null,
  subject             text not null,
  category            text not null check (category in (
                        'family', 'work', 'hobby', 'location', 'preference',
                        'pain_point', 'aspiration', 'opinion', 'relationship', 'trait'
                      )),
  statement           text not null,
  polarity            text not null check (polarity in ('affirms', 'negates')),
  confidence          numeric not null check (confidence >= 0 and confidence <= 1),
  evidence_count      integer not null default 1,
  source              text not null check (source in ('heuristic', 'ai', 'stated', 'inferred')),
  status              text not null default 'active' check (status in ('active', 'superseded', 'decayed', 'unresolved')),
  supersedes          uuid references user_beliefs(id),
  created_at          timestamptz not null default now(),
  last_reinforced_at  timestamptz not null default now(),
  last_used_at        timestamptz
);
create index if not exists idx_user_beliefs_scope
  on user_beliefs (user_id, character_id);
create index if not exists idx_user_beliefs_subject
  on user_beliefs (user_id, character_id, subject)
  where status in ('active', 'unresolved');
alter table user_beliefs enable row level security;
create policy "user_beliefs_service_only"
  on user_beliefs for all to service_role using (true) with check (true);

-- 20260831_government_engines
create table if not exists proposed_laws (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references world_locations(id) on delete cascade,
  title          text not null,
  description    text not null,
  category       text not null default 'general',
  support        numeric not null default 50,
  status         text not null default 'proposed',
  proposed_by_faction_id uuid references factions(id) on delete set null,
  proposed_at    timestamptz not null default now(),
  resolved_at    timestamptz
);
create index if not exists idx_proposed_laws_location on proposed_laws(location_id);
create index if not exists idx_proposed_laws_status on proposed_laws(status);

create table if not exists elections (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references world_locations(id) on delete cascade,
  status         text not null default 'campaigning',
  called_at      timestamptz not null default now(),
  concluded_at   timestamptz,
  winner_character_id uuid references characters(id) on delete set null,
  winner_faction_id    uuid references factions(id) on delete set null,
  turnout        numeric,
  margin         numeric,
  last_ticked_at timestamptz
);
create index if not exists idx_elections_last_ticked_at on elections(last_ticked_at);

create table if not exists election_candidates (
  id             uuid primary key default gen_random_uuid(),
  election_id    uuid not null references elections(id) on delete cascade,
  character_id   uuid references characters(id) on delete set null,
  faction_id     uuid references factions(id) on delete set null,
  platform       text,
  polling        numeric not null default 20,
  created_at     timestamptz not null default now()
);
create index if not exists idx_elections_location on elections(location_id);
create index if not exists idx_election_candidates_election on election_candidates(election_id);

create table if not exists diplomatic_relations (
  id               uuid primary key default gen_random_uuid(),
  location_a_id    uuid not null references world_locations(id) on delete cascade,
  location_b_id    uuid not null references world_locations(id) on delete cascade,
  standing         numeric not null default 50,
  status           text not null default 'neutral',
  updated_at       timestamptz not null default now(),
  constraint diplomatic_relations_unique_pair unique (location_a_id, location_b_id),
  constraint diplomatic_relations_no_self check (location_a_id <> location_b_id)
);
create index if not exists idx_diplomatic_relations_a on diplomatic_relations(location_a_id);
create index if not exists idx_diplomatic_relations_b on diplomatic_relations(location_b_id);

create table if not exists faction_evolution_log (
  id             uuid primary key default gen_random_uuid(),
  faction_id     uuid not null references factions(id) on delete cascade,
  change_type    text not null,
  delta          numeric,
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_faction_evolution_faction on faction_evolution_log(faction_id);

create table if not exists city_crises (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references world_locations(id) on delete cascade,
  crisis_type    text not null,
  severity       int not null default 2,
  status         text not null default 'active',
  title          text not null,
  description    text not null,
  started_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index if not exists idx_city_crises_location on city_crises(location_id);
create index if not exists idx_city_crises_status on city_crises(status);

alter table proposed_laws           enable row level security;
alter table elections                enable row level security;
alter table election_candidates      enable row level security;
alter table diplomatic_relations     enable row level security;
alter table faction_evolution_log    enable row level security;
alter table city_crises              enable row level security;

create policy "public read proposed_laws"        on proposed_laws        for select using (true);
create policy "public read elections"             on elections             for select using (true);
create policy "public read election_candidates"   on election_candidates   for select using (true);
create policy "public read diplomatic_relations"  on diplomatic_relations  for select using (true);
create policy "public read faction_evolution_log" on faction_evolution_log for select using (true);
create policy "public read city_crises"           on city_crises           for select using (true);

-- 20260901_politics_engine_alliances_corruption
create table if not exists faction_alliances (
  id             uuid primary key default gen_random_uuid(),
  faction_a_id   uuid not null references factions(id) on delete cascade,
  faction_b_id   uuid not null references factions(id) on delete cascade,
  relation_type  text not null default 'alliance',
  strength       numeric not null default 50,
  formed_at      timestamptz not null default now(),
  broken_at      timestamptz,
  status         text not null default 'active',
  constraint faction_alliances_unique_pair unique (faction_a_id, faction_b_id),
  constraint faction_alliances_no_self check (faction_a_id <> faction_b_id)
);
create index if not exists idx_faction_alliances_a on faction_alliances(faction_a_id);
create index if not exists idx_faction_alliances_b on faction_alliances(faction_b_id);
create index if not exists idx_faction_alliances_status on faction_alliances(status);

create table if not exists corruption_investigations (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references world_locations(id) on delete cascade,
  faction_id     uuid references factions(id) on delete set null,
  severity       int not null default 2,
  status         text not null default 'investigating',
  summary        text not null,
  started_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index if not exists idx_corruption_investigations_location on corruption_investigations(location_id);
create index if not exists idx_corruption_investigations_status on corruption_investigations(status);

create table if not exists campaign_contributions (
  id             uuid primary key default gen_random_uuid(),
  election_id    uuid not null references elections(id) on delete cascade,
  candidate_id   uuid not null references election_candidates(id) on delete cascade,
  faction_id     uuid not null references factions(id) on delete cascade,
  amount         numeric not null default 0,
  is_illicit     boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists idx_campaign_contributions_election on campaign_contributions(election_id);
create index if not exists idx_campaign_contributions_candidate on campaign_contributions(candidate_id);

alter table faction_alliances       enable row level security;
alter table corruption_investigations enable row level security;
alter table campaign_contributions  enable row level security;

create policy "public read faction_alliances"        on faction_alliances        for select using (true);
create policy "public read exposed corruption"        on corruption_investigations for select using (status = 'exposed');
create policy "public read campaign_contributions"    on campaign_contributions    for select using (true);

-- 20260902_reputation_engine_public_perception
create table if not exists character_public_perception (
  character_id   uuid primary key references characters(id) on delete cascade,
  trustworthy    boolean not null default false,
  dangerous      boolean not null default false,
  famous         boolean not null default false,
  dishonest      boolean not null default false,
  heroic         boolean not null default false,
  rich           boolean not null default false,
  trustworthy_score numeric not null default 0,
  dangerous_score   numeric not null default 0,
  famous_score      numeric not null default 0,
  dishonest_score   numeric not null default 0,
  heroic_score      numeric not null default 0,
  rich_score        numeric not null default 0,
  updated_at     timestamptz not null default now()
);
create index if not exists idx_character_public_perception_traits
  on character_public_perception(trustworthy, dangerous, famous, dishonest, heroic, rich);
alter table character_public_perception enable row level security;
create policy "public read character_public_perception" on character_public_perception for select using (true);
