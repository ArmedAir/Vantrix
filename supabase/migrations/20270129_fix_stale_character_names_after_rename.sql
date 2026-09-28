-- Fix stale pre-rename character names left behind in derived content.
--
-- WHY THIS EXISTS
-- Characters were renamed after their derived content had been generated.
-- The rename cascade updated characters.name and (in the repo's
-- 20261231_rename_all_characters_to_baby_names.sql) characters' own text
-- fields, character_seed_memories and companion_relationships.note -- but
-- never character_knowledge or priority_memories, and its full-name REPLACE()
-- calls missed first-name-only mentions ("Mira's", "Declan", "Elan").
-- character_knowledge titles were later rewritten to the current names (51
-- rows = 17 characters x 3), but the BODIES were not: e.g. the row titled
-- "Countess Chloe's work" still read "Countess Vesper works as Antiquarian".
-- That text is injected into chat context, so a character could be told
-- its own name was something else.
--
-- The old->new mapping below was derived from live data, not guessed: for
-- every character, the name embedded in the character_knowledge "'s work"
-- body ("<name> works as ...") compared against characters.name. 17 of 30
-- characters mismatch. (digital-person-bootstrap.ts writes title and body
-- from the same input.name, so the generator itself is fine -- this is a
-- rename that didn't cascade.)
--
-- WHAT IT TOUCHES (39 rows on the live DB when written)
--   character_knowledge     17  the "<name>'s work" body row per affected character
--   priority_memories       15  generated relationship memories, e.g.
--                               "You and Lord Adrian spoke for the very first time."
--   character_seed_memories  4  Madison Cole "Possible Endings" (5x "Grace"),
--                               and the "Rivals & Enemies" row for Natalie
--                               ("Mira's"), Victoria ("Selene"), Carter
--                               ("the Nameless One")
--   characters               3  first-name-only self references on the sheet:
--                               Liam Cooper.family_bg ("Declan"),
--                               Mason Reed.secrets ("Elan"),
--                               Noah Sullivan.secrets ("Edric")
--
-- DELIBERATELY NOT TOUCHED
--   User-owned history that records what a user actually saw or said:
--   messages, messages_archive, conversations.title, memory_graph,
--   character_surprises, relationship_milestones, roleplay_beats,
--   date_sessions, share_cards.
--   World-lore prose that mentions characters by old name (factions,
--   scarce_assets, world_events, world_stories, universe_scenes.scene_prompt):
--   those are cross-references that need a per-row judgment call, and at
--   least one old name in them ("Vesper Quinn") has no verified mapping.
--
-- SAFETY
--   Every statement is keyed on the character's CURRENT name AND requires
--   the specific old name to still be present, and replaces on whole-word
--   boundaries (\m...\M) so "Elan" can't match inside a longer word. Re-running
--   is a no-op: once the old names are gone nothing matches. On a database
--   whose characters have different names it matches nothing.

-- 1. character_knowledge: "<name>'s work" bodies -------------------------------
UPDATE character_knowledge k
SET content = replace(k.content, m.old_name, m.new_name)
FROM (VALUES
  ('Liam Cooper',      'Declan Voss'),
  ('Michael Sanchez',  'Ivan Korrath'),
  ('Noah Sullivan',    'Edric Hale'),
  ('Riley Nakamura',   'Miyu Cloudweaver'),
  ('Ethan Walker',     'Cassian Morrow'),
  ('Madison Cole',     'Nyx'),
  ('Countess Chloe',   'Countess Vesper'),
  ('Sophia Ramirez',   'Iset Vare'),
  ('Hailey Morgan',    'Riona Vaugh'),
  ('Tyler Nguyen',     'Kael Ashvane'),
  ('Henry Watson',     'Soren Vaas'),
  ('Kai Bishop',       'Ren Voidwalker'),
  ('Alexander Wright', 'Lord Adrian'),
  ('Mason Reed',       'Elan'),
  ('Natalie',          'Mira Glass'),
  ('Victoria',         'Selene Dusk'),
  ('Carter',           'The Nameless One')
) AS m(new_name, old_name), characters c
WHERE c.name = m.new_name
  AND k.character_id = c.id
  AND k.title = m.new_name || '''s work'
  AND k.content LIKE m.old_name || ' works as %';

-- 2. priority_memories: generated relationship memories ------------------------
UPDATE priority_memories pm
SET headline = regexp_replace(pm.headline, '\m' || m.old_name || '\M', m.new_name, 'g'),
    content  = regexp_replace(pm.content,  '\m' || m.old_name || '\M', m.new_name, 'g')
FROM (VALUES
  ('Liam Cooper',      'Declan Voss'),
  ('Michael Sanchez',  'Ivan Korrath'),
  ('Noah Sullivan',    'Edric Hale'),
  ('Riley Nakamura',   'Miyu Cloudweaver'),
  ('Ethan Walker',     'Cassian Morrow'),
  ('Madison Cole',     'Nyx'),
  ('Countess Chloe',   'Countess Vesper'),
  ('Sophia Ramirez',   'Iset Vare'),
  ('Hailey Morgan',    'Riona Vaugh'),
  ('Tyler Nguyen',     'Kael Ashvane'),
  ('Henry Watson',     'Soren Vaas'),
  ('Kai Bishop',       'Ren Voidwalker'),
  ('Alexander Wright', 'Lord Adrian'),
  ('Mason Reed',       'Elan'),
  ('Natalie',          'Mira Glass'),
  ('Victoria',         'Selene Dusk'),
  ('Carter',           'The Nameless One')
) AS m(new_name, old_name), characters c
WHERE c.name = m.new_name
  AND pm.character_id = c.id
  AND (pm.headline ~ ('\m' || m.old_name || '\M') OR pm.content ~ ('\m' || m.old_name || '\M'));

-- 3. character_seed_memories: one leaking row per Archive character ------------
-- Madison Cole's "Possible Endings" used her old name "Grace" five times
-- (first name only for readability, matching how the template repeats a
-- name through one paragraph for Natalie/Victoria/Carter).
UPDATE character_seed_memories sm
SET content = replace(sm.content, 'Grace', 'Madison')
FROM characters c
WHERE sm.character_id = c.id AND c.name = 'Madison Cole'
  AND sm.headline = 'Possible Endings'
  AND sm.content LIKE 'Friend Ending: Grace %';

UPDATE character_seed_memories sm
SET content = regexp_replace(sm.content, '\mMira\M', 'Natalie', 'g')
FROM characters c
WHERE sm.character_id = c.id AND c.name = 'Natalie'
  AND sm.headline = 'Rivals & Enemies'
  AND sm.content ~ '\mMira\M';

UPDATE character_seed_memories sm
SET content = regexp_replace(sm.content, '\mSelene\M', 'Victoria', 'g')
FROM characters c
WHERE sm.character_id = c.id AND c.name = 'Victoria'
  AND sm.headline = 'Rivals & Enemies'
  AND sm.content ~ '\mSelene\M';

UPDATE character_seed_memories sm
SET content = replace(sm.content, 'the Nameless One', 'Carter')
FROM characters c
WHERE sm.character_id = c.id AND c.name = 'Carter'
  AND sm.headline = 'Rivals & Enemies'
  AND sm.content LIKE '%the Nameless One%';

-- 4. characters: first-name-only self references on the sheet itself -----------
-- These feed each character's own persona prompt, so they matter most.
UPDATE characters
SET family_bg = regexp_replace(family_bg, '\mDeclan\M', 'Liam', 'g')
WHERE name = 'Liam Cooper' AND family_bg ~ '\mDeclan\M';

UPDATE characters c
SET secrets = ARRAY(
  SELECT regexp_replace(s, '\mElan\M', 'Mason', 'g')
  FROM unnest(c.secrets) WITH ORDINALITY AS t(s, ord)
  ORDER BY ord)
WHERE c.name = 'Mason Reed' AND c.secrets::text ~ '\mElan\M';

UPDATE characters c
SET secrets = ARRAY(
  SELECT regexp_replace(s, '\mEdric\M', 'Noah', 'g')
  FROM unnest(c.secrets) WITH ORDINALITY AS t(s, ord)
  ORDER BY ord)
WHERE c.name = 'Noah Sullivan' AND c.secrets::text ~ '\mEdric\M';
