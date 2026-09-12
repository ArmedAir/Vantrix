-- Closes the same cascade gap 20260810_desire_engine_titles_fkeys.sql fixed
-- for the desire-engine tables, for the remaining "plain uuid, no FK" tables
-- built the same way since (belief/wisdom/habit engines, human-decision
-- engine, agency engine, relationship-engine-layer, surprise-engine).
-- Without these FKs, deleting a character leaves permanent orphan rows in
-- all 13 tables below, and PostgREST can't do embedded joins on them either.

alter table character_decisions
  add constraint character_decisions_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade,
  add constraint character_decisions_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

alter table character_goals
  add constraint character_goals_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade;

alter table character_journal
  add constraint character_journal_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade,
  add constraint character_journal_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

alter table character_knowledge
  add constraint character_knowledge_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade;

alter table character_long_term_plan
  add constraint character_long_term_plan_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade;

alter table character_open_threads
  add constraint character_open_threads_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade,
  add constraint character_open_threads_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

alter table character_surprises
  add constraint character_surprises_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade,
  add constraint character_surprises_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

alter table character_thoughts
  add constraint character_thoughts_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade,
  add constraint character_thoughts_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

alter table relationship_milestones
  add constraint relationship_milestones_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade,
  add constraint relationship_milestones_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

alter table user_beliefs
  add constraint user_beliefs_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade,
  add constraint user_beliefs_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

alter table user_habits
  add constraint user_habits_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade,
  add constraint user_habits_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

alter table user_promises
  add constraint user_promises_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade,
  add constraint user_promises_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

alter table user_wisdom
  add constraint user_wisdom_character_id_fkey
  foreign key (character_id) references characters(id) on delete cascade,
  add constraint user_wisdom_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

-- Index every character_id FK we just added that didn't already have one,
-- so the cascade delete itself doesn't sequential-scan these tables.
create index if not exists idx_character_decisions_character on character_decisions(character_id);
create index if not exists idx_character_journal_character on character_journal(character_id);
create index if not exists idx_character_long_term_plan_character on character_long_term_plan(character_id);
create index if not exists idx_relationship_milestones_character on relationship_milestones(character_id);
