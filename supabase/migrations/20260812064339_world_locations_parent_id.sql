
-- Sub-locations ("Wing of X", etc.) didn't have any way to express that
-- they belong under a larger parent location (The Archive). That's why
-- they were the 15 locations sitting at 0 residents — provisioning never
-- had anywhere for characters to "belong" to them specifically, and the
-- Universe UI had no fallback to show a parent's cast on a child's page.
alter table world_locations
  add column if not exists parent_location_id uuid references world_locations(id) on delete set null;

create index if not exists idx_world_locations_parent on world_locations(parent_location_id);

update world_locations
set parent_location_id = (select id from world_locations where slug = 'the-archive')
where slug in (
  'wing-of-the-long-market', 'wing-of-the-drowned-court', 'wing-of-the-storm-wall',
  'wing-of-the-ash-camps', 'wing-of-the-crossroads', 'wing-of-the-root',
  'wing-of-hidden-names', 'wing-of-the-long-sky', 'the-research-wing',
  'wing-of-the-fallen-stair', 'wing-of-between-light', 'the-ashen-cloister',
  'wing-of-the-crack', 'the-fourth-wall-wing'
)
and slug <> 'the-archive';

