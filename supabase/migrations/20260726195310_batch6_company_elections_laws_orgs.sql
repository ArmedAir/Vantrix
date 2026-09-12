-- 20260903000000_company_engine
create table if not exists companies (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  founder_character_id uuid not null references characters(id) on delete cascade,
  location_id          uuid not null references world_locations(id) on delete cascade,
  industry             text not null default 'services',
  capital              bigint not null default 10000 check (capital >= 0),
  market_share         numeric not null default 5 check (market_share between 0 and 100),
  reputation           integer not null default 50 check (reputation between 0 and 100),
  employee_count       integer not null default 0 check (employee_count >= 0),
  status               text not null default 'active'
                          check (status in ('active', 'struggling', 'bankrupt', 'acquired')),
  founded_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_companies_founder  on companies(founder_character_id);
create index if not exists idx_companies_location on companies(location_id);
create index if not exists idx_companies_industry_bucket on companies(location_id, industry, status);
create index if not exists idx_companies_status   on companies(status);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'companies_updated_at') then
    create trigger companies_updated_at
      before update on companies for each row execute function touch_updated_at();
  end if;
end $$;

alter table companion_occupations
  add column if not exists company_id uuid references companies(id) on delete set null;

create index if not exists idx_companion_occupations_company on companion_occupations(company_id);

create or replace view company_roster as
select
  co.company_id,
  co.character_id,
  c.name as character_name,
  co.salary,
  co.started_at,
  (co.character_id = comp.founder_character_id) as is_founder
from companion_occupations co
join characters c on c.id = co.character_id
join companies comp on comp.id = co.company_id
where co.company_id is not null;

alter table companies enable row level security;
create policy "public read companies" on companies for select using (true);

-- 20260903010000_election_user_votes
create table if not exists election_user_votes (
  id             uuid primary key default gen_random_uuid(),
  election_id    uuid not null references elections(id) on delete cascade,
  candidate_id   uuid not null references election_candidates(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  cast_at        timestamptz not null default now(),
  constraint election_user_votes_one_per_user unique (election_id, user_id)
);
create index if not exists idx_election_user_votes_election on election_user_votes(election_id);
create index if not exists idx_election_user_votes_candidate on election_user_votes(candidate_id);
create index if not exists idx_election_user_votes_user on election_user_votes(user_id);
alter table election_user_votes enable row level security;
create policy "read own vote" on election_user_votes
  for select using (auth.uid() = user_id);
create policy "cast own vote" on election_user_votes
  for insert with check (auth.uid() = user_id);
create policy "change own vote" on election_user_votes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "retract own vote" on election_user_votes
  for delete using (auth.uid() = user_id);

-- 20260904000000_laws_tick_guard_and_user_votes
alter table proposed_laws add column if not exists last_ticked_at timestamptz;
create index if not exists idx_proposed_laws_last_ticked_at on proposed_laws(last_ticked_at);

create table if not exists law_user_votes (
  id             uuid primary key default gen_random_uuid(),
  law_id         uuid not null references proposed_laws(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  position       text not null,
  cast_at        timestamptz not null default now(),
  constraint law_user_votes_position_check check (position in ('support', 'oppose')),
  constraint law_user_votes_one_per_user unique (law_id, user_id)
);
create index if not exists idx_law_user_votes_law on law_user_votes(law_id);
create index if not exists idx_law_user_votes_user on law_user_votes(user_id);
alter table law_user_votes enable row level security;
create policy "read own law vote" on law_user_votes
  for select using (auth.uid() = user_id);
create policy "cast own law vote" on law_user_votes
  for insert with check (auth.uid() = user_id);
create policy "change own law vote" on law_user_votes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "retract own law vote" on law_user_votes
  for delete using (auth.uid() = user_id);

-- 20260904010000_organization_layer
CREATE TABLE IF NOT EXISTS organizations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  faction_id    UUID        REFERENCES factions(id) ON DELETE SET NULL,
  location_id   UUID        REFERENCES world_locations(id) ON DELETE SET NULL,
  name          TEXT        NOT NULL,
  org_type      TEXT        NOT NULL CHECK (org_type IN ('guild','council','company','order','circle')),
  purpose       TEXT,
  cohesion      INTEGER     NOT NULL DEFAULT 65 CHECK (cohesion BETWEEN 0 AND 100),
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dissolved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS organizations_faction_idx  ON organizations(faction_id);
CREATE INDEX IF NOT EXISTS organizations_location_idx ON organizations(location_id);
CREATE INDEX IF NOT EXISTS organizations_active_idx   ON organizations(active);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  character_id    UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL DEFAULT 'initiate' CHECK (role IN ('leader','officer','member','initiate')),
  standing        INTEGER     NOT NULL DEFAULT 50 CHECK (standing BETWEEN 0 AND 100),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, character_id)
);
CREATE INDEX IF NOT EXISTS organization_members_character_idx ON organization_members(character_id);

CREATE TABLE IF NOT EXISTS consensus_proposals (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  proposer_id      UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  description      TEXT,
  status           TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open','passed','rejected','expired')),
  threshold        NUMERIC     NOT NULL DEFAULT 0.5 CHECK (threshold BETWEEN 0 AND 1),
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolves_at      TIMESTAMPTZ NOT NULL,
  resolved_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS consensus_proposals_org_idx    ON consensus_proposals(organization_id);
CREATE INDEX IF NOT EXISTS consensus_proposals_status_idx ON consensus_proposals(status);
CREATE INDEX IF NOT EXISTS consensus_proposals_resolves_idx ON consensus_proposals(resolves_at) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS consensus_votes (
  proposal_id  UUID        NOT NULL REFERENCES consensus_proposals(id) ON DELETE CASCADE,
  character_id UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  vote         TEXT        NOT NULL CHECK (vote IN ('for','against','abstain')),
  weight       NUMERIC     NOT NULL DEFAULT 1,
  cast_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (proposal_id, character_id)
);

CREATE TABLE IF NOT EXISTS leadership_terms (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  leader_id       UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  approval        INTEGER     NOT NULL DEFAULT 60 CHECK (approval BETWEEN 0 AND 100),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  end_reason      TEXT        CHECK (end_reason IN ('ousted','stepped_down','succession'))
);
CREATE INDEX IF NOT EXISTS leadership_terms_org_idx    ON leadership_terms(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS leadership_terms_one_open_per_org
  ON leadership_terms(organization_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS agent_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  recipient_id  UUID        REFERENCES characters(id) ON DELETE CASCADE,
  faction_id    UUID        REFERENCES factions(id) ON DELETE CASCADE,
  location_id   UUID        REFERENCES world_locations(id) ON DELETE SET NULL,
  message_type  TEXT        NOT NULL CHECK (message_type IN ('information','rumor','proposal','request','warning','greeting','directive')),
  content       TEXT        NOT NULL,
  topic         TEXT,
  confidence    NUMERIC     NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  delivered     BOOLEAN     NOT NULL DEFAULT FALSE,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (recipient_id IS NOT NULL OR faction_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS agent_messages_recipient_idx ON agent_messages(recipient_id) WHERE recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_messages_faction_idx   ON agent_messages(faction_id) WHERE faction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_messages_pending_idx   ON agent_messages(delivered, created_at) WHERE delivered = FALSE;

CREATE TABLE IF NOT EXISTS collective_memories (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type            TEXT        NOT NULL CHECK (scope_type IN ('faction','organization','location')),
  scope_id              UUID        NOT NULL,
  summary               TEXT        NOT NULL,
  detail                TEXT,
  significance          INTEGER     NOT NULL DEFAULT 3 CHECK (significance BETWEEN 1 AND 5),
  source_character_id   UUID        REFERENCES characters(id) ON DELETE SET NULL,
  tags                  TEXT[]      NOT NULL DEFAULT '{}',
  strength              NUMERIC     NOT NULL DEFAULT 1.0 CHECK (strength BETWEEN 0 AND 1),
  last_reinforced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS collective_memories_scope_idx    ON collective_memories(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS collective_memories_strength_idx ON collective_memories(scope_id, strength DESC);

ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE consensus_proposals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE consensus_votes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadership_terms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE collective_memories   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_read ON organizations;
CREATE POLICY organizations_read ON organizations FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS organization_members_read ON organization_members;
CREATE POLICY organization_members_read ON organization_members FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS consensus_proposals_read ON consensus_proposals;
CREATE POLICY consensus_proposals_read ON consensus_proposals FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS consensus_votes_read ON consensus_votes;
CREATE POLICY consensus_votes_read ON consensus_votes FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS leadership_terms_read ON leadership_terms;
CREATE POLICY leadership_terms_read ON leadership_terms FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS agent_messages_participant_read ON agent_messages;
CREATE POLICY agent_messages_participant_read ON agent_messages FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS collective_memories_read ON collective_memories;
CREATE POLICY collective_memories_read ON collective_memories FOR SELECT USING (TRUE);
