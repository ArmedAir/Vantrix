-- 20260919000000_economic_layer_wiring_and_job_type_sync
ALTER TABLE universe_jobs DROP CONSTRAINT IF EXISTS universe_jobs_job_type_check;
ALTER TABLE universe_jobs ADD CONSTRAINT universe_jobs_job_type_check
  CHECK (job_type IN (
    'governance_tick','economy_tick','companion_life',
    'event_generate','story_advance','reputation_update',
    'feed_build','election_process','law_vote',
    'trade_process','diplomatic_event','city_crisis',
    'faction_evolve','world_mood_update','full_universe_tick',
    'status_tick','legend_check','history_aggregate','visual_identity_backfill',
    'deep_tick','public_perception_tick','market_value_tick',
    'world_provisioning_sweep','aging_tick','company_tick','community_tick',
    'culture_tick','religion_tick','law_tick','crime_tick','court_tick',
    'migration_tick','technology_tick','science_tick','education_tick',
    'weather_tick','season_tick','disaster_tick','civic_and_climate_tick',
    'organization_tick','leadership_tick','consensus_sweep',
    'message_delivery','memory_decay',
    'inflation_tick','employment_tick','housing_tick',
    'taxation_tick','banking_tick','market_tick'
  ));

-- 20260919010000_lore_scene_assets
create table if not exists lore_scene_assets (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  kind         text not null check (kind in ('scene', 'wing_cover')),
  act          smallint check (act between 1 and 3),
  scene_label  text,
  wing_slug    text,
  r2_url       text not null,
  generated_at timestamptz not null default now()
);
create unique index if not exists idx_lore_scene_unique
  on lore_scene_assets (slug, act) where kind = 'scene';
create unique index if not exists idx_lore_wing_cover_unique
  on lore_scene_assets (wing_slug) where kind = 'wing_cover';
create index if not exists idx_lore_scene_assets_slug on lore_scene_assets(slug);

alter table lore_scene_assets enable row level security;
drop policy if exists "lore_scene_assets_public_read" on lore_scene_assets;
drop policy if exists "lore_scene_assets_service" on lore_scene_assets;
create policy "lore_scene_assets_public_read" on lore_scene_assets for select using (true);
create policy "lore_scene_assets_service" on lore_scene_assets for all to service_role using (true);
