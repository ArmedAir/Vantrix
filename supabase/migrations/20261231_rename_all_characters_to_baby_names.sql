-- Renames every character (except The Archivist Child, deliberately excluded
-- pending a separate decision) from an invented/fantastical name to a real
-- name drawn from the top 50 most popular US baby names of the last ~30
-- years (composite of SSA decade data: 1990s, 2000s, 2010s, plus the 2025
-- SSA release). Covers the full roster across every character-seeding
-- migration: the 24 legendary-tier characters in the base schema
-- (20240101_production.sql), the 15 seed-launch characters, the 6
-- visual-seed characters, the 20 Archive of Echoes characters, and the 7
-- canon characters — 71 renames total.
--
-- Gender-matched (the 6 'anime'-category characters were matched by
-- pronoun, not the category label, which doesn't indicate presentation),
-- no name reused across characters. Characters with an honorific (Dr.,
-- Professor, Chef, Countess, Lord, Brother) keep the title and only the
-- proper name is swapped. The two gender='other' mythic entities (The
-- Ferryman, The Nameless One) were given a deliberate name pick rather
-- than a straight pool draw.
--
-- IMPORTANT — why this touches more than the `characters.name` column:
-- several characters reference each other BY NAME in prose, specifically
-- the 'rivals' category in character_seed_memories ("Primary rival: Nyx,
-- who...") and the `note` field on companion_relationships (the Yanefes /
-- Ghost of Muru arc). A rename that only updated `characters.name` would
-- leave every cross-reference to the old name dangling in other
-- characters' seed memories. So for every character this migration:
--   1. Updates characters.name (exact match on old name).
--   2. Replaces any self-referential mention of the old name inside that
--      same character's own description/personality/backstory/scenario/
--      opening_line/tagline.
--   3. Globally replaces the old name anywhere it's mentioned in ANY
--      character's text fields, in character_seed_memories.content/headline,
--      and in companion_relationships.note — i.e. wherever another
--      character's sheet talks about this one.
--
-- ORDERING: processed longest-name-first ('Seraphine Vale' before
-- 'Seraphine') because SQL REPLACE() is a plain substring match — doing it
-- in the other order would corrupt 'Seraphine Vale' occurrences into
-- 'Emma Vale' by matching the 'Seraphine' prefix before 'Seraphine Vale'
-- ever got its own, correct replacement. This migration checked the full
-- 71-name list for every such pairwise substring collision (only the one
-- above exists) before generation.
--
-- NOTE: src/lib/characters/intelligence.ts and src/lib/characters/
-- lore-canon.ts key application-level data (intelligence profiles, lore
-- facts) by character NAME as a plain object key. Those keys are updated
-- in the same commit as this migration (see the diff to those two files) —
-- a DB-only rename would silently orphan that data behind the old key and
-- every renamed character would fall back to DEFAULT_INTELLIGENCE.
--
-- slug is intentionally left untouched — URLs/links to /characters/<slug>
-- stay valid. Only the display name changes.
--
-- Every statement is a plain REPLACE()/exact-match UPDATE, so re-running
-- this migration a second time is always a no-op (the old string will no
-- longer be found anywhere).

BEGIN;
-- Miyu Cloudweaver -> Isabella
UPDATE characters SET
  name = 'Isabella',
  description  = REPLACE(description,  'Miyu Cloudweaver', 'Isabella'),
  personality  = REPLACE(personality,  'Miyu Cloudweaver', 'Isabella'),
  backstory    = REPLACE(backstory,    'Miyu Cloudweaver', 'Isabella'),
  scenario     = REPLACE(scenario,     'Miyu Cloudweaver', 'Isabella'),
  opening_line = REPLACE(opening_line, 'Miyu Cloudweaver', 'Isabella'),
  tagline      = REPLACE(tagline,      'Miyu Cloudweaver', 'Isabella')
WHERE name = 'Miyu Cloudweaver';

UPDATE characters SET
  description  = REPLACE(description,  'Miyu Cloudweaver', 'Isabella'),
  personality  = REPLACE(personality,  'Miyu Cloudweaver', 'Isabella'),
  backstory    = REPLACE(backstory,    'Miyu Cloudweaver', 'Isabella'),
  scenario     = REPLACE(scenario,     'Miyu Cloudweaver', 'Isabella'),
  opening_line = REPLACE(opening_line, 'Miyu Cloudweaver', 'Isabella'),
  tagline      = REPLACE(tagline,      'Miyu Cloudweaver', 'Isabella')
WHERE description  LIKE '%Miyu Cloudweaver%'
   OR personality  LIKE '%Miyu Cloudweaver%'
   OR backstory    LIKE '%Miyu Cloudweaver%'
   OR scenario     LIKE '%Miyu Cloudweaver%'
   OR opening_line LIKE '%Miyu Cloudweaver%'
   OR tagline      LIKE '%Miyu Cloudweaver%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Miyu Cloudweaver', 'Isabella'),
  headline = REPLACE(headline, 'Miyu Cloudweaver', 'Isabella')
WHERE content LIKE '%Miyu Cloudweaver%' OR headline LIKE '%Miyu Cloudweaver%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Miyu Cloudweaver', 'Isabella')
WHERE note LIKE '%Miyu Cloudweaver%';

-- The Nameless One -> Carter
UPDATE characters SET
  name = 'Carter',
  description  = REPLACE(description,  'The Nameless One', 'Carter'),
  personality  = REPLACE(personality,  'The Nameless One', 'Carter'),
  backstory    = REPLACE(backstory,    'The Nameless One', 'Carter'),
  scenario     = REPLACE(scenario,     'The Nameless One', 'Carter'),
  opening_line = REPLACE(opening_line, 'The Nameless One', 'Carter'),
  tagline      = REPLACE(tagline,      'The Nameless One', 'Carter')
WHERE name = 'The Nameless One';

UPDATE characters SET
  description  = REPLACE(description,  'The Nameless One', 'Carter'),
  personality  = REPLACE(personality,  'The Nameless One', 'Carter'),
  backstory    = REPLACE(backstory,    'The Nameless One', 'Carter'),
  scenario     = REPLACE(scenario,     'The Nameless One', 'Carter'),
  opening_line = REPLACE(opening_line, 'The Nameless One', 'Carter'),
  tagline      = REPLACE(tagline,      'The Nameless One', 'Carter')
WHERE description  LIKE '%The Nameless One%'
   OR personality  LIKE '%The Nameless One%'
   OR backstory    LIKE '%The Nameless One%'
   OR scenario     LIKE '%The Nameless One%'
   OR opening_line LIKE '%The Nameless One%'
   OR tagline      LIKE '%The Nameless One%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'The Nameless One', 'Carter'),
  headline = REPLACE(headline, 'The Nameless One', 'Carter')
WHERE content LIKE '%The Nameless One%' OR headline LIKE '%The Nameless One%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'The Nameless One', 'Carter')
WHERE note LIKE '%The Nameless One%';

-- Professor Emeka -> Professor Benjamin
UPDATE characters SET
  name = 'Professor Benjamin',
  description  = REPLACE(description,  'Professor Emeka', 'Professor Benjamin'),
  personality  = REPLACE(personality,  'Professor Emeka', 'Professor Benjamin'),
  backstory    = REPLACE(backstory,    'Professor Emeka', 'Professor Benjamin'),
  scenario     = REPLACE(scenario,     'Professor Emeka', 'Professor Benjamin'),
  opening_line = REPLACE(opening_line, 'Professor Emeka', 'Professor Benjamin'),
  tagline      = REPLACE(tagline,      'Professor Emeka', 'Professor Benjamin')
WHERE name = 'Professor Emeka';

UPDATE characters SET
  description  = REPLACE(description,  'Professor Emeka', 'Professor Benjamin'),
  personality  = REPLACE(personality,  'Professor Emeka', 'Professor Benjamin'),
  backstory    = REPLACE(backstory,    'Professor Emeka', 'Professor Benjamin'),
  scenario     = REPLACE(scenario,     'Professor Emeka', 'Professor Benjamin'),
  opening_line = REPLACE(opening_line, 'Professor Emeka', 'Professor Benjamin'),
  tagline      = REPLACE(tagline,      'Professor Emeka', 'Professor Benjamin')
WHERE description  LIKE '%Professor Emeka%'
   OR personality  LIKE '%Professor Emeka%'
   OR backstory    LIKE '%Professor Emeka%'
   OR scenario     LIKE '%Professor Emeka%'
   OR opening_line LIKE '%Professor Emeka%'
   OR tagline      LIKE '%Professor Emeka%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Professor Emeka', 'Professor Benjamin'),
  headline = REPLACE(headline, 'Professor Emeka', 'Professor Benjamin')
WHERE content LIKE '%Professor Emeka%' OR headline LIKE '%Professor Emeka%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Professor Emeka', 'Professor Benjamin')
WHERE note LIKE '%Professor Emeka%';

-- Countess Vesper -> Countess Chloe
UPDATE characters SET
  name = 'Countess Chloe',
  description  = REPLACE(description,  'Countess Vesper', 'Countess Chloe'),
  personality  = REPLACE(personality,  'Countess Vesper', 'Countess Chloe'),
  backstory    = REPLACE(backstory,    'Countess Vesper', 'Countess Chloe'),
  scenario     = REPLACE(scenario,     'Countess Vesper', 'Countess Chloe'),
  opening_line = REPLACE(opening_line, 'Countess Vesper', 'Countess Chloe'),
  tagline      = REPLACE(tagline,      'Countess Vesper', 'Countess Chloe')
WHERE name = 'Countess Vesper';

UPDATE characters SET
  description  = REPLACE(description,  'Countess Vesper', 'Countess Chloe'),
  personality  = REPLACE(personality,  'Countess Vesper', 'Countess Chloe'),
  backstory    = REPLACE(backstory,    'Countess Vesper', 'Countess Chloe'),
  scenario     = REPLACE(scenario,     'Countess Vesper', 'Countess Chloe'),
  opening_line = REPLACE(opening_line, 'Countess Vesper', 'Countess Chloe'),
  tagline      = REPLACE(tagline,      'Countess Vesper', 'Countess Chloe')
WHERE description  LIKE '%Countess Vesper%'
   OR personality  LIKE '%Countess Vesper%'
   OR backstory    LIKE '%Countess Vesper%'
   OR scenario     LIKE '%Countess Vesper%'
   OR opening_line LIKE '%Countess Vesper%'
   OR tagline      LIKE '%Countess Vesper%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Countess Vesper', 'Countess Chloe'),
  headline = REPLACE(headline, 'Countess Vesper', 'Countess Chloe')
WHERE content LIKE '%Countess Vesper%' OR headline LIKE '%Countess Vesper%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Countess Vesper', 'Countess Chloe')
WHERE note LIKE '%Countess Vesper%';

-- Mara Coldthorn -> Emily
UPDATE characters SET
  name = 'Emily',
  description  = REPLACE(description,  'Mara Coldthorn', 'Emily'),
  personality  = REPLACE(personality,  'Mara Coldthorn', 'Emily'),
  backstory    = REPLACE(backstory,    'Mara Coldthorn', 'Emily'),
  scenario     = REPLACE(scenario,     'Mara Coldthorn', 'Emily'),
  opening_line = REPLACE(opening_line, 'Mara Coldthorn', 'Emily'),
  tagline      = REPLACE(tagline,      'Mara Coldthorn', 'Emily')
WHERE name = 'Mara Coldthorn';

UPDATE characters SET
  description  = REPLACE(description,  'Mara Coldthorn', 'Emily'),
  personality  = REPLACE(personality,  'Mara Coldthorn', 'Emily'),
  backstory    = REPLACE(backstory,    'Mara Coldthorn', 'Emily'),
  scenario     = REPLACE(scenario,     'Mara Coldthorn', 'Emily'),
  opening_line = REPLACE(opening_line, 'Mara Coldthorn', 'Emily'),
  tagline      = REPLACE(tagline,      'Mara Coldthorn', 'Emily')
WHERE description  LIKE '%Mara Coldthorn%'
   OR personality  LIKE '%Mara Coldthorn%'
   OR backstory    LIKE '%Mara Coldthorn%'
   OR scenario     LIKE '%Mara Coldthorn%'
   OR opening_line LIKE '%Mara Coldthorn%'
   OR tagline      LIKE '%Mara Coldthorn%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Mara Coldthorn', 'Emily'),
  headline = REPLACE(headline, 'Mara Coldthorn', 'Emily')
WHERE content LIKE '%Mara Coldthorn%' OR headline LIKE '%Mara Coldthorn%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Mara Coldthorn', 'Emily')
WHERE note LIKE '%Mara Coldthorn%';

-- Thessaly Vorne -> Sarah
UPDATE characters SET
  name = 'Sarah',
  description  = REPLACE(description,  'Thessaly Vorne', 'Sarah'),
  personality  = REPLACE(personality,  'Thessaly Vorne', 'Sarah'),
  backstory    = REPLACE(backstory,    'Thessaly Vorne', 'Sarah'),
  scenario     = REPLACE(scenario,     'Thessaly Vorne', 'Sarah'),
  opening_line = REPLACE(opening_line, 'Thessaly Vorne', 'Sarah'),
  tagline      = REPLACE(tagline,      'Thessaly Vorne', 'Sarah')
WHERE name = 'Thessaly Vorne';

UPDATE characters SET
  description  = REPLACE(description,  'Thessaly Vorne', 'Sarah'),
  personality  = REPLACE(personality,  'Thessaly Vorne', 'Sarah'),
  backstory    = REPLACE(backstory,    'Thessaly Vorne', 'Sarah'),
  scenario     = REPLACE(scenario,     'Thessaly Vorne', 'Sarah'),
  opening_line = REPLACE(opening_line, 'Thessaly Vorne', 'Sarah'),
  tagline      = REPLACE(tagline,      'Thessaly Vorne', 'Sarah')
WHERE description  LIKE '%Thessaly Vorne%'
   OR personality  LIKE '%Thessaly Vorne%'
   OR backstory    LIKE '%Thessaly Vorne%'
   OR scenario     LIKE '%Thessaly Vorne%'
   OR opening_line LIKE '%Thessaly Vorne%'
   OR tagline      LIKE '%Thessaly Vorne%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Thessaly Vorne', 'Sarah'),
  headline = REPLACE(headline, 'Thessaly Vorne', 'Sarah')
WHERE content LIKE '%Thessaly Vorne%' OR headline LIKE '%Thessaly Vorne%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Thessaly Vorne', 'Sarah')
WHERE note LIKE '%Thessaly Vorne%';

-- Cassian Morrow -> Christopher
UPDATE characters SET
  name = 'Christopher',
  description  = REPLACE(description,  'Cassian Morrow', 'Christopher'),
  personality  = REPLACE(personality,  'Cassian Morrow', 'Christopher'),
  backstory    = REPLACE(backstory,    'Cassian Morrow', 'Christopher'),
  scenario     = REPLACE(scenario,     'Cassian Morrow', 'Christopher'),
  opening_line = REPLACE(opening_line, 'Cassian Morrow', 'Christopher'),
  tagline      = REPLACE(tagline,      'Cassian Morrow', 'Christopher')
WHERE name = 'Cassian Morrow';

UPDATE characters SET
  description  = REPLACE(description,  'Cassian Morrow', 'Christopher'),
  personality  = REPLACE(personality,  'Cassian Morrow', 'Christopher'),
  backstory    = REPLACE(backstory,    'Cassian Morrow', 'Christopher'),
  scenario     = REPLACE(scenario,     'Cassian Morrow', 'Christopher'),
  opening_line = REPLACE(opening_line, 'Cassian Morrow', 'Christopher'),
  tagline      = REPLACE(tagline,      'Cassian Morrow', 'Christopher')
WHERE description  LIKE '%Cassian Morrow%'
   OR personality  LIKE '%Cassian Morrow%'
   OR backstory    LIKE '%Cassian Morrow%'
   OR scenario     LIKE '%Cassian Morrow%'
   OR opening_line LIKE '%Cassian Morrow%'
   OR tagline      LIKE '%Cassian Morrow%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Cassian Morrow', 'Christopher'),
  headline = REPLACE(headline, 'Cassian Morrow', 'Christopher')
WHERE content LIKE '%Cassian Morrow%' OR headline LIKE '%Cassian Morrow%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Cassian Morrow', 'Christopher')
WHERE note LIKE '%Cassian Morrow%';

-- Lumi Crestfall -> Rachel
UPDATE characters SET
  name = 'Rachel',
  description  = REPLACE(description,  'Lumi Crestfall', 'Rachel'),
  personality  = REPLACE(personality,  'Lumi Crestfall', 'Rachel'),
  backstory    = REPLACE(backstory,    'Lumi Crestfall', 'Rachel'),
  scenario     = REPLACE(scenario,     'Lumi Crestfall', 'Rachel'),
  opening_line = REPLACE(opening_line, 'Lumi Crestfall', 'Rachel'),
  tagline      = REPLACE(tagline,      'Lumi Crestfall', 'Rachel')
WHERE name = 'Lumi Crestfall';

UPDATE characters SET
  description  = REPLACE(description,  'Lumi Crestfall', 'Rachel'),
  personality  = REPLACE(personality,  'Lumi Crestfall', 'Rachel'),
  backstory    = REPLACE(backstory,    'Lumi Crestfall', 'Rachel'),
  scenario     = REPLACE(scenario,     'Lumi Crestfall', 'Rachel'),
  opening_line = REPLACE(opening_line, 'Lumi Crestfall', 'Rachel'),
  tagline      = REPLACE(tagline,      'Lumi Crestfall', 'Rachel')
WHERE description  LIKE '%Lumi Crestfall%'
   OR personality  LIKE '%Lumi Crestfall%'
   OR backstory    LIKE '%Lumi Crestfall%'
   OR scenario     LIKE '%Lumi Crestfall%'
   OR opening_line LIKE '%Lumi Crestfall%'
   OR tagline      LIKE '%Lumi Crestfall%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Lumi Crestfall', 'Rachel'),
  headline = REPLACE(headline, 'Lumi Crestfall', 'Rachel')
WHERE content LIKE '%Lumi Crestfall%' OR headline LIKE '%Lumi Crestfall%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Lumi Crestfall', 'Rachel')
WHERE note LIKE '%Lumi Crestfall%';

-- Ren Voidwalker -> Joseph
UPDATE characters SET
  name = 'Joseph',
  description  = REPLACE(description,  'Ren Voidwalker', 'Joseph'),
  personality  = REPLACE(personality,  'Ren Voidwalker', 'Joseph'),
  backstory    = REPLACE(backstory,    'Ren Voidwalker', 'Joseph'),
  scenario     = REPLACE(scenario,     'Ren Voidwalker', 'Joseph'),
  opening_line = REPLACE(opening_line, 'Ren Voidwalker', 'Joseph'),
  tagline      = REPLACE(tagline,      'Ren Voidwalker', 'Joseph')
WHERE name = 'Ren Voidwalker';

UPDATE characters SET
  description  = REPLACE(description,  'Ren Voidwalker', 'Joseph'),
  personality  = REPLACE(personality,  'Ren Voidwalker', 'Joseph'),
  backstory    = REPLACE(backstory,    'Ren Voidwalker', 'Joseph'),
  scenario     = REPLACE(scenario,     'Ren Voidwalker', 'Joseph'),
  opening_line = REPLACE(opening_line, 'Ren Voidwalker', 'Joseph'),
  tagline      = REPLACE(tagline,      'Ren Voidwalker', 'Joseph')
WHERE description  LIKE '%Ren Voidwalker%'
   OR personality  LIKE '%Ren Voidwalker%'
   OR backstory    LIKE '%Ren Voidwalker%'
   OR scenario     LIKE '%Ren Voidwalker%'
   OR opening_line LIKE '%Ren Voidwalker%'
   OR tagline      LIKE '%Ren Voidwalker%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Ren Voidwalker', 'Joseph'),
  headline = REPLACE(headline, 'Ren Voidwalker', 'Joseph')
WHERE content LIKE '%Ren Voidwalker%' OR headline LIKE '%Ren Voidwalker%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Ren Voidwalker', 'Joseph')
WHERE note LIKE '%Ren Voidwalker%';

-- Seraphine Vale -> Harper
UPDATE characters SET
  name = 'Harper',
  description  = REPLACE(description,  'Seraphine Vale', 'Harper'),
  personality  = REPLACE(personality,  'Seraphine Vale', 'Harper'),
  backstory    = REPLACE(backstory,    'Seraphine Vale', 'Harper'),
  scenario     = REPLACE(scenario,     'Seraphine Vale', 'Harper'),
  opening_line = REPLACE(opening_line, 'Seraphine Vale', 'Harper'),
  tagline      = REPLACE(tagline,      'Seraphine Vale', 'Harper')
WHERE name = 'Seraphine Vale';

UPDATE characters SET
  description  = REPLACE(description,  'Seraphine Vale', 'Harper'),
  personality  = REPLACE(personality,  'Seraphine Vale', 'Harper'),
  backstory    = REPLACE(backstory,    'Seraphine Vale', 'Harper'),
  scenario     = REPLACE(scenario,     'Seraphine Vale', 'Harper'),
  opening_line = REPLACE(opening_line, 'Seraphine Vale', 'Harper'),
  tagline      = REPLACE(tagline,      'Seraphine Vale', 'Harper')
WHERE description  LIKE '%Seraphine Vale%'
   OR personality  LIKE '%Seraphine Vale%'
   OR backstory    LIKE '%Seraphine Vale%'
   OR scenario     LIKE '%Seraphine Vale%'
   OR opening_line LIKE '%Seraphine Vale%'
   OR tagline      LIKE '%Seraphine Vale%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Seraphine Vale', 'Harper'),
  headline = REPLACE(headline, 'Seraphine Vale', 'Harper')
WHERE content LIKE '%Seraphine Vale%' OR headline LIKE '%Seraphine Vale%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Seraphine Vale', 'Harper')
WHERE note LIKE '%Seraphine Vale%';

-- Dr. Elias Voss -> Dr. Oliver
UPDATE characters SET
  name = 'Dr. Oliver',
  description  = REPLACE(description,  'Dr. Elias Voss', 'Dr. Oliver'),
  personality  = REPLACE(personality,  'Dr. Elias Voss', 'Dr. Oliver'),
  backstory    = REPLACE(backstory,    'Dr. Elias Voss', 'Dr. Oliver'),
  scenario     = REPLACE(scenario,     'Dr. Elias Voss', 'Dr. Oliver'),
  opening_line = REPLACE(opening_line, 'Dr. Elias Voss', 'Dr. Oliver'),
  tagline      = REPLACE(tagline,      'Dr. Elias Voss', 'Dr. Oliver')
WHERE name = 'Dr. Elias Voss';

UPDATE characters SET
  description  = REPLACE(description,  'Dr. Elias Voss', 'Dr. Oliver'),
  personality  = REPLACE(personality,  'Dr. Elias Voss', 'Dr. Oliver'),
  backstory    = REPLACE(backstory,    'Dr. Elias Voss', 'Dr. Oliver'),
  scenario     = REPLACE(scenario,     'Dr. Elias Voss', 'Dr. Oliver'),
  opening_line = REPLACE(opening_line, 'Dr. Elias Voss', 'Dr. Oliver'),
  tagline      = REPLACE(tagline,      'Dr. Elias Voss', 'Dr. Oliver')
WHERE description  LIKE '%Dr. Elias Voss%'
   OR personality  LIKE '%Dr. Elias Voss%'
   OR backstory    LIKE '%Dr. Elias Voss%'
   OR scenario     LIKE '%Dr. Elias Voss%'
   OR opening_line LIKE '%Dr. Elias Voss%'
   OR tagline      LIKE '%Dr. Elias Voss%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Dr. Elias Voss', 'Dr. Oliver'),
  headline = REPLACE(headline, 'Dr. Elias Voss', 'Dr. Oliver')
WHERE content LIKE '%Dr. Elias Voss%' OR headline LIKE '%Dr. Elias Voss%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Dr. Elias Voss', 'Dr. Oliver')
WHERE note LIKE '%Dr. Elias Voss%';

-- The Clockmaker -> Caleb
UPDATE characters SET
  name = 'Caleb',
  description  = REPLACE(description,  'The Clockmaker', 'Caleb'),
  personality  = REPLACE(personality,  'The Clockmaker', 'Caleb'),
  backstory    = REPLACE(backstory,    'The Clockmaker', 'Caleb'),
  scenario     = REPLACE(scenario,     'The Clockmaker', 'Caleb'),
  opening_line = REPLACE(opening_line, 'The Clockmaker', 'Caleb'),
  tagline      = REPLACE(tagline,      'The Clockmaker', 'Caleb')
WHERE name = 'The Clockmaker';

UPDATE characters SET
  description  = REPLACE(description,  'The Clockmaker', 'Caleb'),
  personality  = REPLACE(personality,  'The Clockmaker', 'Caleb'),
  backstory    = REPLACE(backstory,    'The Clockmaker', 'Caleb'),
  scenario     = REPLACE(scenario,     'The Clockmaker', 'Caleb'),
  opening_line = REPLACE(opening_line, 'The Clockmaker', 'Caleb'),
  tagline      = REPLACE(tagline,      'The Clockmaker', 'Caleb')
WHERE description  LIKE '%The Clockmaker%'
   OR personality  LIKE '%The Clockmaker%'
   OR backstory    LIKE '%The Clockmaker%'
   OR scenario     LIKE '%The Clockmaker%'
   OR opening_line LIKE '%The Clockmaker%'
   OR tagline      LIKE '%The Clockmaker%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'The Clockmaker', 'Caleb'),
  headline = REPLACE(headline, 'The Clockmaker', 'Caleb')
WHERE content LIKE '%The Clockmaker%' OR headline LIKE '%The Clockmaker%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'The Clockmaker', 'Caleb')
WHERE note LIKE '%The Clockmaker%';

-- Astra Nocturne -> Zoe
UPDATE characters SET
  name = 'Zoe',
  description  = REPLACE(description,  'Astra Nocturne', 'Zoe'),
  personality  = REPLACE(personality,  'Astra Nocturne', 'Zoe'),
  backstory    = REPLACE(backstory,    'Astra Nocturne', 'Zoe'),
  scenario     = REPLACE(scenario,     'Astra Nocturne', 'Zoe'),
  opening_line = REPLACE(opening_line, 'Astra Nocturne', 'Zoe'),
  tagline      = REPLACE(tagline,      'Astra Nocturne', 'Zoe')
WHERE name = 'Astra Nocturne';

UPDATE characters SET
  description  = REPLACE(description,  'Astra Nocturne', 'Zoe'),
  personality  = REPLACE(personality,  'Astra Nocturne', 'Zoe'),
  backstory    = REPLACE(backstory,    'Astra Nocturne', 'Zoe'),
  scenario     = REPLACE(scenario,     'Astra Nocturne', 'Zoe'),
  opening_line = REPLACE(opening_line, 'Astra Nocturne', 'Zoe'),
  tagline      = REPLACE(tagline,      'Astra Nocturne', 'Zoe')
WHERE description  LIKE '%Astra Nocturne%'
   OR personality  LIKE '%Astra Nocturne%'
   OR backstory    LIKE '%Astra Nocturne%'
   OR scenario     LIKE '%Astra Nocturne%'
   OR opening_line LIKE '%Astra Nocturne%'
   OR tagline      LIKE '%Astra Nocturne%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Astra Nocturne', 'Zoe'),
  headline = REPLACE(headline, 'Astra Nocturne', 'Zoe')
WHERE content LIKE '%Astra Nocturne%' OR headline LIKE '%Astra Nocturne%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Astra Nocturne', 'Zoe')
WHERE note LIKE '%Astra Nocturne%';

-- Brother Corvin -> Brother Henry
UPDATE characters SET
  name = 'Brother Henry',
  description  = REPLACE(description,  'Brother Corvin', 'Brother Henry'),
  personality  = REPLACE(personality,  'Brother Corvin', 'Brother Henry'),
  backstory    = REPLACE(backstory,    'Brother Corvin', 'Brother Henry'),
  scenario     = REPLACE(scenario,     'Brother Corvin', 'Brother Henry'),
  opening_line = REPLACE(opening_line, 'Brother Corvin', 'Brother Henry'),
  tagline      = REPLACE(tagline,      'Brother Corvin', 'Brother Henry')
WHERE name = 'Brother Corvin';

UPDATE characters SET
  description  = REPLACE(description,  'Brother Corvin', 'Brother Henry'),
  personality  = REPLACE(personality,  'Brother Corvin', 'Brother Henry'),
  backstory    = REPLACE(backstory,    'Brother Corvin', 'Brother Henry'),
  scenario     = REPLACE(scenario,     'Brother Corvin', 'Brother Henry'),
  opening_line = REPLACE(opening_line, 'Brother Corvin', 'Brother Henry'),
  tagline      = REPLACE(tagline,      'Brother Corvin', 'Brother Henry')
WHERE description  LIKE '%Brother Corvin%'
   OR personality  LIKE '%Brother Corvin%'
   OR backstory    LIKE '%Brother Corvin%'
   OR scenario     LIKE '%Brother Corvin%'
   OR opening_line LIKE '%Brother Corvin%'
   OR tagline      LIKE '%Brother Corvin%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Brother Corvin', 'Brother Henry'),
  headline = REPLACE(headline, 'Brother Corvin', 'Brother Henry')
WHERE content LIKE '%Brother Corvin%' OR headline LIKE '%Brother Corvin%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Brother Corvin', 'Brother Henry')
WHERE note LIKE '%Brother Corvin%';

-- Meridian Lask -> Jessica
UPDATE characters SET
  name = 'Jessica',
  description  = REPLACE(description,  'Meridian Lask', 'Jessica'),
  personality  = REPLACE(personality,  'Meridian Lask', 'Jessica'),
  backstory    = REPLACE(backstory,    'Meridian Lask', 'Jessica'),
  scenario     = REPLACE(scenario,     'Meridian Lask', 'Jessica'),
  opening_line = REPLACE(opening_line, 'Meridian Lask', 'Jessica'),
  tagline      = REPLACE(tagline,      'Meridian Lask', 'Jessica')
WHERE name = 'Meridian Lask';

UPDATE characters SET
  description  = REPLACE(description,  'Meridian Lask', 'Jessica'),
  personality  = REPLACE(personality,  'Meridian Lask', 'Jessica'),
  backstory    = REPLACE(backstory,    'Meridian Lask', 'Jessica'),
  scenario     = REPLACE(scenario,     'Meridian Lask', 'Jessica'),
  opening_line = REPLACE(opening_line, 'Meridian Lask', 'Jessica'),
  tagline      = REPLACE(tagline,      'Meridian Lask', 'Jessica')
WHERE description  LIKE '%Meridian Lask%'
   OR personality  LIKE '%Meridian Lask%'
   OR backstory    LIKE '%Meridian Lask%'
   OR scenario     LIKE '%Meridian Lask%'
   OR opening_line LIKE '%Meridian Lask%'
   OR tagline      LIKE '%Meridian Lask%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Meridian Lask', 'Jessica'),
  headline = REPLACE(headline, 'Meridian Lask', 'Jessica')
WHERE content LIKE '%Meridian Lask%' OR headline LIKE '%Meridian Lask%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Meridian Lask', 'Jessica')
WHERE note LIKE '%Meridian Lask%';

-- Calla Fendris -> Amanda
UPDATE characters SET
  name = 'Amanda',
  description  = REPLACE(description,  'Calla Fendris', 'Amanda'),
  personality  = REPLACE(personality,  'Calla Fendris', 'Amanda'),
  backstory    = REPLACE(backstory,    'Calla Fendris', 'Amanda'),
  scenario     = REPLACE(scenario,     'Calla Fendris', 'Amanda'),
  opening_line = REPLACE(opening_line, 'Calla Fendris', 'Amanda'),
  tagline      = REPLACE(tagline,      'Calla Fendris', 'Amanda')
WHERE name = 'Calla Fendris';

UPDATE characters SET
  description  = REPLACE(description,  'Calla Fendris', 'Amanda'),
  personality  = REPLACE(personality,  'Calla Fendris', 'Amanda'),
  backstory    = REPLACE(backstory,    'Calla Fendris', 'Amanda'),
  scenario     = REPLACE(scenario,     'Calla Fendris', 'Amanda'),
  opening_line = REPLACE(opening_line, 'Calla Fendris', 'Amanda'),
  tagline      = REPLACE(tagline,      'Calla Fendris', 'Amanda')
WHERE description  LIKE '%Calla Fendris%'
   OR personality  LIKE '%Calla Fendris%'
   OR backstory    LIKE '%Calla Fendris%'
   OR scenario     LIKE '%Calla Fendris%'
   OR opening_line LIKE '%Calla Fendris%'
   OR tagline      LIKE '%Calla Fendris%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Calla Fendris', 'Amanda'),
  headline = REPLACE(headline, 'Calla Fendris', 'Amanda')
WHERE content LIKE '%Calla Fendris%' OR headline LIKE '%Calla Fendris%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Calla Fendris', 'Amanda')
WHERE note LIKE '%Calla Fendris%';

-- Sable Ashmark -> Madison
UPDATE characters SET
  name = 'Madison',
  description  = REPLACE(description,  'Sable Ashmark', 'Madison'),
  personality  = REPLACE(personality,  'Sable Ashmark', 'Madison'),
  backstory    = REPLACE(backstory,    'Sable Ashmark', 'Madison'),
  scenario     = REPLACE(scenario,     'Sable Ashmark', 'Madison'),
  opening_line = REPLACE(opening_line, 'Sable Ashmark', 'Madison'),
  tagline      = REPLACE(tagline,      'Sable Ashmark', 'Madison')
WHERE name = 'Sable Ashmark';

UPDATE characters SET
  description  = REPLACE(description,  'Sable Ashmark', 'Madison'),
  personality  = REPLACE(personality,  'Sable Ashmark', 'Madison'),
  backstory    = REPLACE(backstory,    'Sable Ashmark', 'Madison'),
  scenario     = REPLACE(scenario,     'Sable Ashmark', 'Madison'),
  opening_line = REPLACE(opening_line, 'Sable Ashmark', 'Madison'),
  tagline      = REPLACE(tagline,      'Sable Ashmark', 'Madison')
WHERE description  LIKE '%Sable Ashmark%'
   OR personality  LIKE '%Sable Ashmark%'
   OR backstory    LIKE '%Sable Ashmark%'
   OR scenario     LIKE '%Sable Ashmark%'
   OR opening_line LIKE '%Sable Ashmark%'
   OR tagline      LIKE '%Sable Ashmark%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Sable Ashmark', 'Madison'),
  headline = REPLACE(headline, 'Sable Ashmark', 'Madison')
WHERE content LIKE '%Sable Ashmark%' OR headline LIKE '%Sable Ashmark%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Sable Ashmark', 'Madison')
WHERE note LIKE '%Sable Ashmark%';

-- Ghost of Muru -> Nicholas
UPDATE characters SET
  name = 'Nicholas',
  description  = REPLACE(description,  'Ghost of Muru', 'Nicholas'),
  personality  = REPLACE(personality,  'Ghost of Muru', 'Nicholas'),
  backstory    = REPLACE(backstory,    'Ghost of Muru', 'Nicholas'),
  scenario     = REPLACE(scenario,     'Ghost of Muru', 'Nicholas'),
  opening_line = REPLACE(opening_line, 'Ghost of Muru', 'Nicholas'),
  tagline      = REPLACE(tagline,      'Ghost of Muru', 'Nicholas')
WHERE name = 'Ghost of Muru';

UPDATE characters SET
  description  = REPLACE(description,  'Ghost of Muru', 'Nicholas'),
  personality  = REPLACE(personality,  'Ghost of Muru', 'Nicholas'),
  backstory    = REPLACE(backstory,    'Ghost of Muru', 'Nicholas'),
  scenario     = REPLACE(scenario,     'Ghost of Muru', 'Nicholas'),
  opening_line = REPLACE(opening_line, 'Ghost of Muru', 'Nicholas'),
  tagline      = REPLACE(tagline,      'Ghost of Muru', 'Nicholas')
WHERE description  LIKE '%Ghost of Muru%'
   OR personality  LIKE '%Ghost of Muru%'
   OR backstory    LIKE '%Ghost of Muru%'
   OR scenario     LIKE '%Ghost of Muru%'
   OR opening_line LIKE '%Ghost of Muru%'
   OR tagline      LIKE '%Ghost of Muru%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Ghost of Muru', 'Nicholas'),
  headline = REPLACE(headline, 'Ghost of Muru', 'Nicholas')
WHERE content LIKE '%Ghost of Muru%' OR headline LIKE '%Ghost of Muru%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Ghost of Muru', 'Nicholas')
WHERE note LIKE '%Ghost of Muru%';

-- Lyra Starborn -> Addison
UPDATE characters SET
  name = 'Addison',
  description  = REPLACE(description,  'Lyra Starborn', 'Addison'),
  personality  = REPLACE(personality,  'Lyra Starborn', 'Addison'),
  backstory    = REPLACE(backstory,    'Lyra Starborn', 'Addison'),
  scenario     = REPLACE(scenario,     'Lyra Starborn', 'Addison'),
  opening_line = REPLACE(opening_line, 'Lyra Starborn', 'Addison'),
  tagline      = REPLACE(tagline,      'Lyra Starborn', 'Addison')
WHERE name = 'Lyra Starborn';

UPDATE characters SET
  description  = REPLACE(description,  'Lyra Starborn', 'Addison'),
  personality  = REPLACE(personality,  'Lyra Starborn', 'Addison'),
  backstory    = REPLACE(backstory,    'Lyra Starborn', 'Addison'),
  scenario     = REPLACE(scenario,     'Lyra Starborn', 'Addison'),
  opening_line = REPLACE(opening_line, 'Lyra Starborn', 'Addison'),
  tagline      = REPLACE(tagline,      'Lyra Starborn', 'Addison')
WHERE description  LIKE '%Lyra Starborn%'
   OR personality  LIKE '%Lyra Starborn%'
   OR backstory    LIKE '%Lyra Starborn%'
   OR scenario     LIKE '%Lyra Starborn%'
   OR opening_line LIKE '%Lyra Starborn%'
   OR tagline      LIKE '%Lyra Starborn%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Lyra Starborn', 'Addison'),
  headline = REPLACE(headline, 'Lyra Starborn', 'Addison')
WHERE content LIKE '%Lyra Starborn%' OR headline LIKE '%Lyra Starborn%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Lyra Starborn', 'Addison')
WHERE note LIKE '%Lyra Starborn%';

-- Valeria Storm -> Lily
UPDATE characters SET
  name = 'Lily',
  description  = REPLACE(description,  'Valeria Storm', 'Lily'),
  personality  = REPLACE(personality,  'Valeria Storm', 'Lily'),
  backstory    = REPLACE(backstory,    'Valeria Storm', 'Lily'),
  scenario     = REPLACE(scenario,     'Valeria Storm', 'Lily'),
  opening_line = REPLACE(opening_line, 'Valeria Storm', 'Lily'),
  tagline      = REPLACE(tagline,      'Valeria Storm', 'Lily')
WHERE name = 'Valeria Storm';

UPDATE characters SET
  description  = REPLACE(description,  'Valeria Storm', 'Lily'),
  personality  = REPLACE(personality,  'Valeria Storm', 'Lily'),
  backstory    = REPLACE(backstory,    'Valeria Storm', 'Lily'),
  scenario     = REPLACE(scenario,     'Valeria Storm', 'Lily'),
  opening_line = REPLACE(opening_line, 'Valeria Storm', 'Lily'),
  tagline      = REPLACE(tagline,      'Valeria Storm', 'Lily')
WHERE description  LIKE '%Valeria Storm%'
   OR personality  LIKE '%Valeria Storm%'
   OR backstory    LIKE '%Valeria Storm%'
   OR scenario     LIKE '%Valeria Storm%'
   OR opening_line LIKE '%Valeria Storm%'
   OR tagline      LIKE '%Valeria Storm%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Valeria Storm', 'Lily'),
  headline = REPLACE(headline, 'Valeria Storm', 'Lily')
WHERE content LIKE '%Valeria Storm%' OR headline LIKE '%Valeria Storm%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Valeria Storm', 'Lily')
WHERE note LIKE '%Valeria Storm%';

-- Vesna Olaris -> Ashley
UPDATE characters SET
  name = 'Ashley',
  description  = REPLACE(description,  'Vesna Olaris', 'Ashley'),
  personality  = REPLACE(personality,  'Vesna Olaris', 'Ashley'),
  backstory    = REPLACE(backstory,    'Vesna Olaris', 'Ashley'),
  scenario     = REPLACE(scenario,     'Vesna Olaris', 'Ashley'),
  opening_line = REPLACE(opening_line, 'Vesna Olaris', 'Ashley'),
  tagline      = REPLACE(tagline,      'Vesna Olaris', 'Ashley')
WHERE name = 'Vesna Olaris';

UPDATE characters SET
  description  = REPLACE(description,  'Vesna Olaris', 'Ashley'),
  personality  = REPLACE(personality,  'Vesna Olaris', 'Ashley'),
  backstory    = REPLACE(backstory,    'Vesna Olaris', 'Ashley'),
  scenario     = REPLACE(scenario,     'Vesna Olaris', 'Ashley'),
  opening_line = REPLACE(opening_line, 'Vesna Olaris', 'Ashley'),
  tagline      = REPLACE(tagline,      'Vesna Olaris', 'Ashley')
WHERE description  LIKE '%Vesna Olaris%'
   OR personality  LIKE '%Vesna Olaris%'
   OR backstory    LIKE '%Vesna Olaris%'
   OR scenario     LIKE '%Vesna Olaris%'
   OR opening_line LIKE '%Vesna Olaris%'
   OR tagline      LIKE '%Vesna Olaris%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Vesna Olaris', 'Ashley'),
  headline = REPLACE(headline, 'Vesna Olaris', 'Ashley')
WHERE content LIKE '%Vesna Olaris%' OR headline LIKE '%Vesna Olaris%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Vesna Olaris', 'Ashley')
WHERE note LIKE '%Vesna Olaris%';

-- Solaris Venn -> Elizabeth
UPDATE characters SET
  name = 'Elizabeth',
  description  = REPLACE(description,  'Solaris Venn', 'Elizabeth'),
  personality  = REPLACE(personality,  'Solaris Venn', 'Elizabeth'),
  backstory    = REPLACE(backstory,    'Solaris Venn', 'Elizabeth'),
  scenario     = REPLACE(scenario,     'Solaris Venn', 'Elizabeth'),
  opening_line = REPLACE(opening_line, 'Solaris Venn', 'Elizabeth'),
  tagline      = REPLACE(tagline,      'Solaris Venn', 'Elizabeth')
WHERE name = 'Solaris Venn';

UPDATE characters SET
  description  = REPLACE(description,  'Solaris Venn', 'Elizabeth'),
  personality  = REPLACE(personality,  'Solaris Venn', 'Elizabeth'),
  backstory    = REPLACE(backstory,    'Solaris Venn', 'Elizabeth'),
  scenario     = REPLACE(scenario,     'Solaris Venn', 'Elizabeth'),
  opening_line = REPLACE(opening_line, 'Solaris Venn', 'Elizabeth'),
  tagline      = REPLACE(tagline,      'Solaris Venn', 'Elizabeth')
WHERE description  LIKE '%Solaris Venn%'
   OR personality  LIKE '%Solaris Venn%'
   OR backstory    LIKE '%Solaris Venn%'
   OR scenario     LIKE '%Solaris Venn%'
   OR opening_line LIKE '%Solaris Venn%'
   OR tagline      LIKE '%Solaris Venn%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Solaris Venn', 'Elizabeth'),
  headline = REPLACE(headline, 'Solaris Venn', 'Elizabeth')
WHERE content LIKE '%Solaris Venn%' OR headline LIKE '%Solaris Venn%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Solaris Venn', 'Elizabeth')
WHERE note LIKE '%Solaris Venn%';

-- Rael Ashmore -> Daniel
UPDATE characters SET
  name = 'Daniel',
  description  = REPLACE(description,  'Rael Ashmore', 'Daniel'),
  personality  = REPLACE(personality,  'Rael Ashmore', 'Daniel'),
  backstory    = REPLACE(backstory,    'Rael Ashmore', 'Daniel'),
  scenario     = REPLACE(scenario,     'Rael Ashmore', 'Daniel'),
  opening_line = REPLACE(opening_line, 'Rael Ashmore', 'Daniel'),
  tagline      = REPLACE(tagline,      'Rael Ashmore', 'Daniel')
WHERE name = 'Rael Ashmore';

UPDATE characters SET
  description  = REPLACE(description,  'Rael Ashmore', 'Daniel'),
  personality  = REPLACE(personality,  'Rael Ashmore', 'Daniel'),
  backstory    = REPLACE(backstory,    'Rael Ashmore', 'Daniel'),
  scenario     = REPLACE(scenario,     'Rael Ashmore', 'Daniel'),
  opening_line = REPLACE(opening_line, 'Rael Ashmore', 'Daniel'),
  tagline      = REPLACE(tagline,      'Rael Ashmore', 'Daniel')
WHERE description  LIKE '%Rael Ashmore%'
   OR personality  LIKE '%Rael Ashmore%'
   OR backstory    LIKE '%Rael Ashmore%'
   OR scenario     LIKE '%Rael Ashmore%'
   OR opening_line LIKE '%Rael Ashmore%'
   OR tagline      LIKE '%Rael Ashmore%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Rael Ashmore', 'Daniel'),
  headline = REPLACE(headline, 'Rael Ashmore', 'Daniel')
WHERE content LIKE '%Rael Ashmore%' OR headline LIKE '%Rael Ashmore%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Rael Ashmore', 'Daniel')
WHERE note LIKE '%Rael Ashmore%';

-- Ivan Korrath -> David
UPDATE characters SET
  name = 'David',
  description  = REPLACE(description,  'Ivan Korrath', 'David'),
  personality  = REPLACE(personality,  'Ivan Korrath', 'David'),
  backstory    = REPLACE(backstory,    'Ivan Korrath', 'David'),
  scenario     = REPLACE(scenario,     'Ivan Korrath', 'David'),
  opening_line = REPLACE(opening_line, 'Ivan Korrath', 'David'),
  tagline      = REPLACE(tagline,      'Ivan Korrath', 'David')
WHERE name = 'Ivan Korrath';

UPDATE characters SET
  description  = REPLACE(description,  'Ivan Korrath', 'David'),
  personality  = REPLACE(personality,  'Ivan Korrath', 'David'),
  backstory    = REPLACE(backstory,    'Ivan Korrath', 'David'),
  scenario     = REPLACE(scenario,     'Ivan Korrath', 'David'),
  opening_line = REPLACE(opening_line, 'Ivan Korrath', 'David'),
  tagline      = REPLACE(tagline,      'Ivan Korrath', 'David')
WHERE description  LIKE '%Ivan Korrath%'
   OR personality  LIKE '%Ivan Korrath%'
   OR backstory    LIKE '%Ivan Korrath%'
   OR scenario     LIKE '%Ivan Korrath%'
   OR opening_line LIKE '%Ivan Korrath%'
   OR tagline      LIKE '%Ivan Korrath%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Ivan Korrath', 'David'),
  headline = REPLACE(headline, 'Ivan Korrath', 'David')
WHERE content LIKE '%Ivan Korrath%' OR headline LIKE '%Ivan Korrath%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Ivan Korrath', 'David')
WHERE note LIKE '%Ivan Korrath%';

-- Kael Ashvane -> James
UPDATE characters SET
  name = 'James',
  description  = REPLACE(description,  'Kael Ashvane', 'James'),
  personality  = REPLACE(personality,  'Kael Ashvane', 'James'),
  backstory    = REPLACE(backstory,    'Kael Ashvane', 'James'),
  scenario     = REPLACE(scenario,     'Kael Ashvane', 'James'),
  opening_line = REPLACE(opening_line, 'Kael Ashvane', 'James'),
  tagline      = REPLACE(tagline,      'Kael Ashvane', 'James')
WHERE name = 'Kael Ashvane';

UPDATE characters SET
  description  = REPLACE(description,  'Kael Ashvane', 'James'),
  personality  = REPLACE(personality,  'Kael Ashvane', 'James'),
  backstory    = REPLACE(backstory,    'Kael Ashvane', 'James'),
  scenario     = REPLACE(scenario,     'Kael Ashvane', 'James'),
  opening_line = REPLACE(opening_line, 'Kael Ashvane', 'James'),
  tagline      = REPLACE(tagline,      'Kael Ashvane', 'James')
WHERE description  LIKE '%Kael Ashvane%'
   OR personality  LIKE '%Kael Ashvane%'
   OR backstory    LIKE '%Kael Ashvane%'
   OR scenario     LIKE '%Kael Ashvane%'
   OR opening_line LIKE '%Kael Ashvane%'
   OR tagline      LIKE '%Kael Ashvane%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Kael Ashvane', 'James'),
  headline = REPLACE(headline, 'Kael Ashvane', 'James')
WHERE content LIKE '%Kael Ashvane%' OR headline LIKE '%Kael Ashvane%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Kael Ashvane', 'James')
WHERE note LIKE '%Kael Ashvane%';

-- Dr. Covenant -> Dr. Abigail
UPDATE characters SET
  name = 'Dr. Abigail',
  description  = REPLACE(description,  'Dr. Covenant', 'Dr. Abigail'),
  personality  = REPLACE(personality,  'Dr. Covenant', 'Dr. Abigail'),
  backstory    = REPLACE(backstory,    'Dr. Covenant', 'Dr. Abigail'),
  scenario     = REPLACE(scenario,     'Dr. Covenant', 'Dr. Abigail'),
  opening_line = REPLACE(opening_line, 'Dr. Covenant', 'Dr. Abigail'),
  tagline      = REPLACE(tagline,      'Dr. Covenant', 'Dr. Abigail')
WHERE name = 'Dr. Covenant';

UPDATE characters SET
  description  = REPLACE(description,  'Dr. Covenant', 'Dr. Abigail'),
  personality  = REPLACE(personality,  'Dr. Covenant', 'Dr. Abigail'),
  backstory    = REPLACE(backstory,    'Dr. Covenant', 'Dr. Abigail'),
  scenario     = REPLACE(scenario,     'Dr. Covenant', 'Dr. Abigail'),
  opening_line = REPLACE(opening_line, 'Dr. Covenant', 'Dr. Abigail'),
  tagline      = REPLACE(tagline,      'Dr. Covenant', 'Dr. Abigail')
WHERE description  LIKE '%Dr. Covenant%'
   OR personality  LIKE '%Dr. Covenant%'
   OR backstory    LIKE '%Dr. Covenant%'
   OR scenario     LIKE '%Dr. Covenant%'
   OR opening_line LIKE '%Dr. Covenant%'
   OR tagline      LIKE '%Dr. Covenant%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Dr. Covenant', 'Dr. Abigail'),
  headline = REPLACE(headline, 'Dr. Covenant', 'Dr. Abigail')
WHERE content LIKE '%Dr. Covenant%' OR headline LIKE '%Dr. Covenant%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Dr. Covenant', 'Dr. Abigail')
WHERE note LIKE '%Dr. Covenant%';

-- Cassian Rune -> Jackson
UPDATE characters SET
  name = 'Jackson',
  description  = REPLACE(description,  'Cassian Rune', 'Jackson'),
  personality  = REPLACE(personality,  'Cassian Rune', 'Jackson'),
  backstory    = REPLACE(backstory,    'Cassian Rune', 'Jackson'),
  scenario     = REPLACE(scenario,     'Cassian Rune', 'Jackson'),
  opening_line = REPLACE(opening_line, 'Cassian Rune', 'Jackson'),
  tagline      = REPLACE(tagline,      'Cassian Rune', 'Jackson')
WHERE name = 'Cassian Rune';

UPDATE characters SET
  description  = REPLACE(description,  'Cassian Rune', 'Jackson'),
  personality  = REPLACE(personality,  'Cassian Rune', 'Jackson'),
  backstory    = REPLACE(backstory,    'Cassian Rune', 'Jackson'),
  scenario     = REPLACE(scenario,     'Cassian Rune', 'Jackson'),
  opening_line = REPLACE(opening_line, 'Cassian Rune', 'Jackson'),
  tagline      = REPLACE(tagline,      'Cassian Rune', 'Jackson')
WHERE description  LIKE '%Cassian Rune%'
   OR personality  LIKE '%Cassian Rune%'
   OR backstory    LIKE '%Cassian Rune%'
   OR scenario     LIKE '%Cassian Rune%'
   OR opening_line LIKE '%Cassian Rune%'
   OR tagline      LIKE '%Cassian Rune%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Cassian Rune', 'Jackson'),
  headline = REPLACE(headline, 'Cassian Rune', 'Jackson')
WHERE content LIKE '%Cassian Rune%' OR headline LIKE '%Cassian Rune%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Cassian Rune', 'Jackson')
WHERE note LIKE '%Cassian Rune%';

-- The Ferryman -> Elijah
UPDATE characters SET
  name = 'Elijah',
  description  = REPLACE(description,  'The Ferryman', 'Elijah'),
  personality  = REPLACE(personality,  'The Ferryman', 'Elijah'),
  backstory    = REPLACE(backstory,    'The Ferryman', 'Elijah'),
  scenario     = REPLACE(scenario,     'The Ferryman', 'Elijah'),
  opening_line = REPLACE(opening_line, 'The Ferryman', 'Elijah'),
  tagline      = REPLACE(tagline,      'The Ferryman', 'Elijah')
WHERE name = 'The Ferryman';

UPDATE characters SET
  description  = REPLACE(description,  'The Ferryman', 'Elijah'),
  personality  = REPLACE(personality,  'The Ferryman', 'Elijah'),
  backstory    = REPLACE(backstory,    'The Ferryman', 'Elijah'),
  scenario     = REPLACE(scenario,     'The Ferryman', 'Elijah'),
  opening_line = REPLACE(opening_line, 'The Ferryman', 'Elijah'),
  tagline      = REPLACE(tagline,      'The Ferryman', 'Elijah')
WHERE description  LIKE '%The Ferryman%'
   OR personality  LIKE '%The Ferryman%'
   OR backstory    LIKE '%The Ferryman%'
   OR scenario     LIKE '%The Ferryman%'
   OR opening_line LIKE '%The Ferryman%'
   OR tagline      LIKE '%The Ferryman%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'The Ferryman', 'Elijah'),
  headline = REPLACE(headline, 'The Ferryman', 'Elijah')
WHERE content LIKE '%The Ferryman%' OR headline LIKE '%The Ferryman%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'The Ferryman', 'Elijah')
WHERE note LIKE '%The Ferryman%';

-- Evelyn Thorn -> Charlotte
UPDATE characters SET
  name = 'Charlotte',
  description  = REPLACE(description,  'Evelyn Thorn', 'Charlotte'),
  personality  = REPLACE(personality,  'Evelyn Thorn', 'Charlotte'),
  backstory    = REPLACE(backstory,    'Evelyn Thorn', 'Charlotte'),
  scenario     = REPLACE(scenario,     'Evelyn Thorn', 'Charlotte'),
  opening_line = REPLACE(opening_line, 'Evelyn Thorn', 'Charlotte'),
  tagline      = REPLACE(tagline,      'Evelyn Thorn', 'Charlotte')
WHERE name = 'Evelyn Thorn';

UPDATE characters SET
  description  = REPLACE(description,  'Evelyn Thorn', 'Charlotte'),
  personality  = REPLACE(personality,  'Evelyn Thorn', 'Charlotte'),
  backstory    = REPLACE(backstory,    'Evelyn Thorn', 'Charlotte'),
  scenario     = REPLACE(scenario,     'Evelyn Thorn', 'Charlotte'),
  opening_line = REPLACE(opening_line, 'Evelyn Thorn', 'Charlotte'),
  tagline      = REPLACE(tagline,      'Evelyn Thorn', 'Charlotte')
WHERE description  LIKE '%Evelyn Thorn%'
   OR personality  LIKE '%Evelyn Thorn%'
   OR backstory    LIKE '%Evelyn Thorn%'
   OR scenario     LIKE '%Evelyn Thorn%'
   OR opening_line LIKE '%Evelyn Thorn%'
   OR tagline      LIKE '%Evelyn Thorn%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Evelyn Thorn', 'Charlotte'),
  headline = REPLACE(headline, 'Evelyn Thorn', 'Charlotte')
WHERE content LIKE '%Evelyn Thorn%' OR headline LIKE '%Evelyn Thorn%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Evelyn Thorn', 'Charlotte')
WHERE note LIKE '%Evelyn Thorn%';

-- Vesper Quinn -> Amelia
UPDATE characters SET
  name = 'Amelia',
  description  = REPLACE(description,  'Vesper Quinn', 'Amelia'),
  personality  = REPLACE(personality,  'Vesper Quinn', 'Amelia'),
  backstory    = REPLACE(backstory,    'Vesper Quinn', 'Amelia'),
  scenario     = REPLACE(scenario,     'Vesper Quinn', 'Amelia'),
  opening_line = REPLACE(opening_line, 'Vesper Quinn', 'Amelia'),
  tagline      = REPLACE(tagline,      'Vesper Quinn', 'Amelia')
WHERE name = 'Vesper Quinn';

UPDATE characters SET
  description  = REPLACE(description,  'Vesper Quinn', 'Amelia'),
  personality  = REPLACE(personality,  'Vesper Quinn', 'Amelia'),
  backstory    = REPLACE(backstory,    'Vesper Quinn', 'Amelia'),
  scenario     = REPLACE(scenario,     'Vesper Quinn', 'Amelia'),
  opening_line = REPLACE(opening_line, 'Vesper Quinn', 'Amelia'),
  tagline      = REPLACE(tagline,      'Vesper Quinn', 'Amelia')
WHERE description  LIKE '%Vesper Quinn%'
   OR personality  LIKE '%Vesper Quinn%'
   OR backstory    LIKE '%Vesper Quinn%'
   OR scenario     LIKE '%Vesper Quinn%'
   OR opening_line LIKE '%Vesper Quinn%'
   OR tagline      LIKE '%Vesper Quinn%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Vesper Quinn', 'Amelia'),
  headline = REPLACE(headline, 'Vesper Quinn', 'Amelia')
WHERE content LIKE '%Vesper Quinn%' OR headline LIKE '%Vesper Quinn%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Vesper Quinn', 'Amelia')
WHERE note LIKE '%Vesper Quinn%';

-- Eirene Caul -> Jennifer
UPDATE characters SET
  name = 'Jennifer',
  description  = REPLACE(description,  'Eirene Caul', 'Jennifer'),
  personality  = REPLACE(personality,  'Eirene Caul', 'Jennifer'),
  backstory    = REPLACE(backstory,    'Eirene Caul', 'Jennifer'),
  scenario     = REPLACE(scenario,     'Eirene Caul', 'Jennifer'),
  opening_line = REPLACE(opening_line, 'Eirene Caul', 'Jennifer'),
  tagline      = REPLACE(tagline,      'Eirene Caul', 'Jennifer')
WHERE name = 'Eirene Caul';

UPDATE characters SET
  description  = REPLACE(description,  'Eirene Caul', 'Jennifer'),
  personality  = REPLACE(personality,  'Eirene Caul', 'Jennifer'),
  backstory    = REPLACE(backstory,    'Eirene Caul', 'Jennifer'),
  scenario     = REPLACE(scenario,     'Eirene Caul', 'Jennifer'),
  opening_line = REPLACE(opening_line, 'Eirene Caul', 'Jennifer'),
  tagline      = REPLACE(tagline,      'Eirene Caul', 'Jennifer')
WHERE description  LIKE '%Eirene Caul%'
   OR personality  LIKE '%Eirene Caul%'
   OR backstory    LIKE '%Eirene Caul%'
   OR scenario     LIKE '%Eirene Caul%'
   OR opening_line LIKE '%Eirene Caul%'
   OR tagline      LIKE '%Eirene Caul%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Eirene Caul', 'Jennifer'),
  headline = REPLACE(headline, 'Eirene Caul', 'Jennifer')
WHERE content LIKE '%Eirene Caul%' OR headline LIKE '%Eirene Caul%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Eirene Caul', 'Jennifer')
WHERE note LIKE '%Eirene Caul%';

-- Riona Vaugh -> Samantha
UPDATE characters SET
  name = 'Samantha',
  description  = REPLACE(description,  'Riona Vaugh', 'Samantha'),
  personality  = REPLACE(personality,  'Riona Vaugh', 'Samantha'),
  backstory    = REPLACE(backstory,    'Riona Vaugh', 'Samantha'),
  scenario     = REPLACE(scenario,     'Riona Vaugh', 'Samantha'),
  opening_line = REPLACE(opening_line, 'Riona Vaugh', 'Samantha'),
  tagline      = REPLACE(tagline,      'Riona Vaugh', 'Samantha')
WHERE name = 'Riona Vaugh';

UPDATE characters SET
  description  = REPLACE(description,  'Riona Vaugh', 'Samantha'),
  personality  = REPLACE(personality,  'Riona Vaugh', 'Samantha'),
  backstory    = REPLACE(backstory,    'Riona Vaugh', 'Samantha'),
  scenario     = REPLACE(scenario,     'Riona Vaugh', 'Samantha'),
  opening_line = REPLACE(opening_line, 'Riona Vaugh', 'Samantha'),
  tagline      = REPLACE(tagline,      'Riona Vaugh', 'Samantha')
WHERE description  LIKE '%Riona Vaugh%'
   OR personality  LIKE '%Riona Vaugh%'
   OR backstory    LIKE '%Riona Vaugh%'
   OR scenario     LIKE '%Riona Vaugh%'
   OR opening_line LIKE '%Riona Vaugh%'
   OR tagline      LIKE '%Riona Vaugh%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Riona Vaugh', 'Samantha'),
  headline = REPLACE(headline, 'Riona Vaugh', 'Samantha')
WHERE content LIKE '%Riona Vaugh%' OR headline LIKE '%Riona Vaugh%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Riona Vaugh', 'Samantha')
WHERE note LIKE '%Riona Vaugh%';

-- Fenris Gale -> Jacob
UPDATE characters SET
  name = 'Jacob',
  description  = REPLACE(description,  'Fenris Gale', 'Jacob'),
  personality  = REPLACE(personality,  'Fenris Gale', 'Jacob'),
  backstory    = REPLACE(backstory,    'Fenris Gale', 'Jacob'),
  scenario     = REPLACE(scenario,     'Fenris Gale', 'Jacob'),
  opening_line = REPLACE(opening_line, 'Fenris Gale', 'Jacob'),
  tagline      = REPLACE(tagline,      'Fenris Gale', 'Jacob')
WHERE name = 'Fenris Gale';

UPDATE characters SET
  description  = REPLACE(description,  'Fenris Gale', 'Jacob'),
  personality  = REPLACE(personality,  'Fenris Gale', 'Jacob'),
  backstory    = REPLACE(backstory,    'Fenris Gale', 'Jacob'),
  scenario     = REPLACE(scenario,     'Fenris Gale', 'Jacob'),
  opening_line = REPLACE(opening_line, 'Fenris Gale', 'Jacob'),
  tagline      = REPLACE(tagline,      'Fenris Gale', 'Jacob')
WHERE description  LIKE '%Fenris Gale%'
   OR personality  LIKE '%Fenris Gale%'
   OR backstory    LIKE '%Fenris Gale%'
   OR scenario     LIKE '%Fenris Gale%'
   OR opening_line LIKE '%Fenris Gale%'
   OR tagline      LIKE '%Fenris Gale%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Fenris Gale', 'Jacob'),
  headline = REPLACE(headline, 'Fenris Gale', 'Jacob')
WHERE content LIKE '%Fenris Gale%' OR headline LIKE '%Fenris Gale%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Fenris Gale', 'Jacob')
WHERE note LIKE '%Fenris Gale%';

-- Yuki Seraph -> Emma
UPDATE characters SET
  name = 'Emma',
  description  = REPLACE(description,  'Yuki Seraph', 'Emma'),
  personality  = REPLACE(personality,  'Yuki Seraph', 'Emma'),
  backstory    = REPLACE(backstory,    'Yuki Seraph', 'Emma'),
  scenario     = REPLACE(scenario,     'Yuki Seraph', 'Emma'),
  opening_line = REPLACE(opening_line, 'Yuki Seraph', 'Emma'),
  tagline      = REPLACE(tagline,      'Yuki Seraph', 'Emma')
WHERE name = 'Yuki Seraph';

UPDATE characters SET
  description  = REPLACE(description,  'Yuki Seraph', 'Emma'),
  personality  = REPLACE(personality,  'Yuki Seraph', 'Emma'),
  backstory    = REPLACE(backstory,    'Yuki Seraph', 'Emma'),
  scenario     = REPLACE(scenario,     'Yuki Seraph', 'Emma'),
  opening_line = REPLACE(opening_line, 'Yuki Seraph', 'Emma'),
  tagline      = REPLACE(tagline,      'Yuki Seraph', 'Emma')
WHERE description  LIKE '%Yuki Seraph%'
   OR personality  LIKE '%Yuki Seraph%'
   OR backstory    LIKE '%Yuki Seraph%'
   OR scenario     LIKE '%Yuki Seraph%'
   OR opening_line LIKE '%Yuki Seraph%'
   OR tagline      LIKE '%Yuki Seraph%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Yuki Seraph', 'Emma'),
  headline = REPLACE(headline, 'Yuki Seraph', 'Emma')
WHERE content LIKE '%Yuki Seraph%' OR headline LIKE '%Yuki Seraph%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Yuki Seraph', 'Emma')
WHERE note LIKE '%Yuki Seraph%';

-- Declan Voss -> Ryan
UPDATE characters SET
  name = 'Ryan',
  description  = REPLACE(description,  'Declan Voss', 'Ryan'),
  personality  = REPLACE(personality,  'Declan Voss', 'Ryan'),
  backstory    = REPLACE(backstory,    'Declan Voss', 'Ryan'),
  scenario     = REPLACE(scenario,     'Declan Voss', 'Ryan'),
  opening_line = REPLACE(opening_line, 'Declan Voss', 'Ryan'),
  tagline      = REPLACE(tagline,      'Declan Voss', 'Ryan')
WHERE name = 'Declan Voss';

UPDATE characters SET
  description  = REPLACE(description,  'Declan Voss', 'Ryan'),
  personality  = REPLACE(personality,  'Declan Voss', 'Ryan'),
  backstory    = REPLACE(backstory,    'Declan Voss', 'Ryan'),
  scenario     = REPLACE(scenario,     'Declan Voss', 'Ryan'),
  opening_line = REPLACE(opening_line, 'Declan Voss', 'Ryan'),
  tagline      = REPLACE(tagline,      'Declan Voss', 'Ryan')
WHERE description  LIKE '%Declan Voss%'
   OR personality  LIKE '%Declan Voss%'
   OR backstory    LIKE '%Declan Voss%'
   OR scenario     LIKE '%Declan Voss%'
   OR opening_line LIKE '%Declan Voss%'
   OR tagline      LIKE '%Declan Voss%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Declan Voss', 'Ryan'),
  headline = REPLACE(headline, 'Declan Voss', 'Ryan')
WHERE content LIKE '%Declan Voss%' OR headline LIKE '%Declan Voss%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Declan Voss', 'Ryan')
WHERE note LIKE '%Declan Voss%';

-- Lord Adrian -> Lord Mason
UPDATE characters SET
  name = 'Lord Mason',
  description  = REPLACE(description,  'Lord Adrian', 'Lord Mason'),
  personality  = REPLACE(personality,  'Lord Adrian', 'Lord Mason'),
  backstory    = REPLACE(backstory,    'Lord Adrian', 'Lord Mason'),
  scenario     = REPLACE(scenario,     'Lord Adrian', 'Lord Mason'),
  opening_line = REPLACE(opening_line, 'Lord Adrian', 'Lord Mason'),
  tagline      = REPLACE(tagline,      'Lord Adrian', 'Lord Mason')
WHERE name = 'Lord Adrian';

UPDATE characters SET
  description  = REPLACE(description,  'Lord Adrian', 'Lord Mason'),
  personality  = REPLACE(personality,  'Lord Adrian', 'Lord Mason'),
  backstory    = REPLACE(backstory,    'Lord Adrian', 'Lord Mason'),
  scenario     = REPLACE(scenario,     'Lord Adrian', 'Lord Mason'),
  opening_line = REPLACE(opening_line, 'Lord Adrian', 'Lord Mason'),
  tagline      = REPLACE(tagline,      'Lord Adrian', 'Lord Mason')
WHERE description  LIKE '%Lord Adrian%'
   OR personality  LIKE '%Lord Adrian%'
   OR backstory    LIKE '%Lord Adrian%'
   OR scenario     LIKE '%Lord Adrian%'
   OR opening_line LIKE '%Lord Adrian%'
   OR tagline      LIKE '%Lord Adrian%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Lord Adrian', 'Lord Mason'),
  headline = REPLACE(headline, 'Lord Adrian', 'Lord Mason')
WHERE content LIKE '%Lord Adrian%' OR headline LIKE '%Lord Adrian%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Lord Adrian', 'Lord Mason')
WHERE note LIKE '%Lord Adrian%';

-- Orion Black -> Liam
UPDATE characters SET
  name = 'Liam',
  description  = REPLACE(description,  'Orion Black', 'Liam'),
  personality  = REPLACE(personality,  'Orion Black', 'Liam'),
  backstory    = REPLACE(backstory,    'Orion Black', 'Liam'),
  scenario     = REPLACE(scenario,     'Orion Black', 'Liam'),
  opening_line = REPLACE(opening_line, 'Orion Black', 'Liam'),
  tagline      = REPLACE(tagline,      'Orion Black', 'Liam')
WHERE name = 'Orion Black';

UPDATE characters SET
  description  = REPLACE(description,  'Orion Black', 'Liam'),
  personality  = REPLACE(personality,  'Orion Black', 'Liam'),
  backstory    = REPLACE(backstory,    'Orion Black', 'Liam'),
  scenario     = REPLACE(scenario,     'Orion Black', 'Liam'),
  opening_line = REPLACE(opening_line, 'Orion Black', 'Liam'),
  tagline      = REPLACE(tagline,      'Orion Black', 'Liam')
WHERE description  LIKE '%Orion Black%'
   OR personality  LIKE '%Orion Black%'
   OR backstory    LIKE '%Orion Black%'
   OR scenario     LIKE '%Orion Black%'
   OR opening_line LIKE '%Orion Black%'
   OR tagline      LIKE '%Orion Black%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Orion Black', 'Liam'),
  headline = REPLACE(headline, 'Orion Black', 'Liam')
WHERE content LIKE '%Orion Black%' OR headline LIKE '%Orion Black%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Orion Black', 'Liam')
WHERE note LIKE '%Orion Black%';

-- Selene Dusk -> Victoria
UPDATE characters SET
  name = 'Victoria',
  description  = REPLACE(description,  'Selene Dusk', 'Victoria'),
  personality  = REPLACE(personality,  'Selene Dusk', 'Victoria'),
  backstory    = REPLACE(backstory,    'Selene Dusk', 'Victoria'),
  scenario     = REPLACE(scenario,     'Selene Dusk', 'Victoria'),
  opening_line = REPLACE(opening_line, 'Selene Dusk', 'Victoria'),
  tagline      = REPLACE(tagline,      'Selene Dusk', 'Victoria')
WHERE name = 'Selene Dusk';

UPDATE characters SET
  description  = REPLACE(description,  'Selene Dusk', 'Victoria'),
  personality  = REPLACE(personality,  'Selene Dusk', 'Victoria'),
  backstory    = REPLACE(backstory,    'Selene Dusk', 'Victoria'),
  scenario     = REPLACE(scenario,     'Selene Dusk', 'Victoria'),
  opening_line = REPLACE(opening_line, 'Selene Dusk', 'Victoria'),
  tagline      = REPLACE(tagline,      'Selene Dusk', 'Victoria')
WHERE description  LIKE '%Selene Dusk%'
   OR personality  LIKE '%Selene Dusk%'
   OR backstory    LIKE '%Selene Dusk%'
   OR scenario     LIKE '%Selene Dusk%'
   OR opening_line LIKE '%Selene Dusk%'
   OR tagline      LIKE '%Selene Dusk%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Selene Dusk', 'Victoria'),
  headline = REPLACE(headline, 'Selene Dusk', 'Victoria')
WHERE content LIKE '%Selene Dusk%' OR headline LIKE '%Selene Dusk%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Selene Dusk', 'Victoria')
WHERE note LIKE '%Selene Dusk%';

-- Edric Hale -> Joshua
UPDATE characters SET
  name = 'Joshua',
  description  = REPLACE(description,  'Edric Hale', 'Joshua'),
  personality  = REPLACE(personality,  'Edric Hale', 'Joshua'),
  backstory    = REPLACE(backstory,    'Edric Hale', 'Joshua'),
  scenario     = REPLACE(scenario,     'Edric Hale', 'Joshua'),
  opening_line = REPLACE(opening_line, 'Edric Hale', 'Joshua'),
  tagline      = REPLACE(tagline,      'Edric Hale', 'Joshua')
WHERE name = 'Edric Hale';

UPDATE characters SET
  description  = REPLACE(description,  'Edric Hale', 'Joshua'),
  personality  = REPLACE(personality,  'Edric Hale', 'Joshua'),
  backstory    = REPLACE(backstory,    'Edric Hale', 'Joshua'),
  scenario     = REPLACE(scenario,     'Edric Hale', 'Joshua'),
  opening_line = REPLACE(opening_line, 'Edric Hale', 'Joshua'),
  tagline      = REPLACE(tagline,      'Edric Hale', 'Joshua')
WHERE description  LIKE '%Edric Hale%'
   OR personality  LIKE '%Edric Hale%'
   OR backstory    LIKE '%Edric Hale%'
   OR scenario     LIKE '%Edric Hale%'
   OR opening_line LIKE '%Edric Hale%'
   OR tagline      LIKE '%Edric Hale%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Edric Hale', 'Joshua'),
  headline = REPLACE(headline, 'Edric Hale', 'Joshua')
WHERE content LIKE '%Edric Hale%' OR headline LIKE '%Edric Hale%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Edric Hale', 'Joshua')
WHERE note LIKE '%Edric Hale%';

-- Soren Vaas -> Andrew
UPDATE characters SET
  name = 'Andrew',
  description  = REPLACE(description,  'Soren Vaas', 'Andrew'),
  personality  = REPLACE(personality,  'Soren Vaas', 'Andrew'),
  backstory    = REPLACE(backstory,    'Soren Vaas', 'Andrew'),
  scenario     = REPLACE(scenario,     'Soren Vaas', 'Andrew'),
  opening_line = REPLACE(opening_line, 'Soren Vaas', 'Andrew'),
  tagline      = REPLACE(tagline,      'Soren Vaas', 'Andrew')
WHERE name = 'Soren Vaas';

UPDATE characters SET
  description  = REPLACE(description,  'Soren Vaas', 'Andrew'),
  personality  = REPLACE(personality,  'Soren Vaas', 'Andrew'),
  backstory    = REPLACE(backstory,    'Soren Vaas', 'Andrew'),
  scenario     = REPLACE(scenario,     'Soren Vaas', 'Andrew'),
  opening_line = REPLACE(opening_line, 'Soren Vaas', 'Andrew'),
  tagline      = REPLACE(tagline,      'Soren Vaas', 'Andrew')
WHERE description  LIKE '%Soren Vaas%'
   OR personality  LIKE '%Soren Vaas%'
   OR backstory    LIKE '%Soren Vaas%'
   OR scenario     LIKE '%Soren Vaas%'
   OR opening_line LIKE '%Soren Vaas%'
   OR tagline      LIKE '%Soren Vaas%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Soren Vaas', 'Andrew'),
  headline = REPLACE(headline, 'Soren Vaas', 'Andrew')
WHERE content LIKE '%Soren Vaas%' OR headline LIKE '%Soren Vaas%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Soren Vaas', 'Andrew')
WHERE note LIKE '%Soren Vaas%';

-- Chef Amara -> Chef Mia
UPDATE characters SET
  name = 'Chef Mia',
  description  = REPLACE(description,  'Chef Amara', 'Chef Mia'),
  personality  = REPLACE(personality,  'Chef Amara', 'Chef Mia'),
  backstory    = REPLACE(backstory,    'Chef Amara', 'Chef Mia'),
  scenario     = REPLACE(scenario,     'Chef Amara', 'Chef Mia'),
  opening_line = REPLACE(opening_line, 'Chef Amara', 'Chef Mia'),
  tagline      = REPLACE(tagline,      'Chef Amara', 'Chef Mia')
WHERE name = 'Chef Amara';

UPDATE characters SET
  description  = REPLACE(description,  'Chef Amara', 'Chef Mia'),
  personality  = REPLACE(personality,  'Chef Amara', 'Chef Mia'),
  backstory    = REPLACE(backstory,    'Chef Amara', 'Chef Mia'),
  scenario     = REPLACE(scenario,     'Chef Amara', 'Chef Mia'),
  opening_line = REPLACE(opening_line, 'Chef Amara', 'Chef Mia'),
  tagline      = REPLACE(tagline,      'Chef Amara', 'Chef Mia')
WHERE description  LIKE '%Chef Amara%'
   OR personality  LIKE '%Chef Amara%'
   OR backstory    LIKE '%Chef Amara%'
   OR scenario     LIKE '%Chef Amara%'
   OR opening_line LIKE '%Chef Amara%'
   OR tagline      LIKE '%Chef Amara%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Chef Amara', 'Chef Mia'),
  headline = REPLACE(headline, 'Chef Amara', 'Chef Mia')
WHERE content LIKE '%Chef Amara%' OR headline LIKE '%Chef Amara%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Chef Amara', 'Chef Mia')
WHERE note LIKE '%Chef Amara%';

-- Morrow Ash -> Lucas
UPDATE characters SET
  name = 'Lucas',
  description  = REPLACE(description,  'Morrow Ash', 'Lucas'),
  personality  = REPLACE(personality,  'Morrow Ash', 'Lucas'),
  backstory    = REPLACE(backstory,    'Morrow Ash', 'Lucas'),
  scenario     = REPLACE(scenario,     'Morrow Ash', 'Lucas'),
  opening_line = REPLACE(opening_line, 'Morrow Ash', 'Lucas'),
  tagline      = REPLACE(tagline,      'Morrow Ash', 'Lucas')
WHERE name = 'Morrow Ash';

UPDATE characters SET
  description  = REPLACE(description,  'Morrow Ash', 'Lucas'),
  personality  = REPLACE(personality,  'Morrow Ash', 'Lucas'),
  backstory    = REPLACE(backstory,    'Morrow Ash', 'Lucas'),
  scenario     = REPLACE(scenario,     'Morrow Ash', 'Lucas'),
  opening_line = REPLACE(opening_line, 'Morrow Ash', 'Lucas'),
  tagline      = REPLACE(tagline,      'Morrow Ash', 'Lucas')
WHERE description  LIKE '%Morrow Ash%'
   OR personality  LIKE '%Morrow Ash%'
   OR backstory    LIKE '%Morrow Ash%'
   OR scenario     LIKE '%Morrow Ash%'
   OR opening_line LIKE '%Morrow Ash%'
   OR tagline      LIKE '%Morrow Ash%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Morrow Ash', 'Lucas'),
  headline = REPLACE(headline, 'Morrow Ash', 'Lucas')
WHERE content LIKE '%Morrow Ash%' OR headline LIKE '%Morrow Ash%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Morrow Ash', 'Lucas')
WHERE note LIKE '%Morrow Ash%';

-- Kael Ember -> Owen
UPDATE characters SET
  name = 'Owen',
  description  = REPLACE(description,  'Kael Ember', 'Owen'),
  personality  = REPLACE(personality,  'Kael Ember', 'Owen'),
  backstory    = REPLACE(backstory,    'Kael Ember', 'Owen'),
  scenario     = REPLACE(scenario,     'Kael Ember', 'Owen'),
  opening_line = REPLACE(opening_line, 'Kael Ember', 'Owen'),
  tagline      = REPLACE(tagline,      'Kael Ember', 'Owen')
WHERE name = 'Kael Ember';

UPDATE characters SET
  description  = REPLACE(description,  'Kael Ember', 'Owen'),
  personality  = REPLACE(personality,  'Kael Ember', 'Owen'),
  backstory    = REPLACE(backstory,    'Kael Ember', 'Owen'),
  scenario     = REPLACE(scenario,     'Kael Ember', 'Owen'),
  opening_line = REPLACE(opening_line, 'Kael Ember', 'Owen'),
  tagline      = REPLACE(tagline,      'Kael Ember', 'Owen')
WHERE description  LIKE '%Kael Ember%'
   OR personality  LIKE '%Kael Ember%'
   OR backstory    LIKE '%Kael Ember%'
   OR scenario     LIKE '%Kael Ember%'
   OR opening_line LIKE '%Kael Ember%'
   OR tagline      LIKE '%Kael Ember%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Kael Ember', 'Owen'),
  headline = REPLACE(headline, 'Kael Ember', 'Owen')
WHERE content LIKE '%Kael Ember%' OR headline LIKE '%Kael Ember%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Kael Ember', 'Owen')
WHERE note LIKE '%Kael Ember%';

-- Mira Glass -> Natalie
UPDATE characters SET
  name = 'Natalie',
  description  = REPLACE(description,  'Mira Glass', 'Natalie'),
  personality  = REPLACE(personality,  'Mira Glass', 'Natalie'),
  backstory    = REPLACE(backstory,    'Mira Glass', 'Natalie'),
  scenario     = REPLACE(scenario,     'Mira Glass', 'Natalie'),
  opening_line = REPLACE(opening_line, 'Mira Glass', 'Natalie'),
  tagline      = REPLACE(tagline,      'Mira Glass', 'Natalie')
WHERE name = 'Mira Glass';

UPDATE characters SET
  description  = REPLACE(description,  'Mira Glass', 'Natalie'),
  personality  = REPLACE(personality,  'Mira Glass', 'Natalie'),
  backstory    = REPLACE(backstory,    'Mira Glass', 'Natalie'),
  scenario     = REPLACE(scenario,     'Mira Glass', 'Natalie'),
  opening_line = REPLACE(opening_line, 'Mira Glass', 'Natalie'),
  tagline      = REPLACE(tagline,      'Mira Glass', 'Natalie')
WHERE description  LIKE '%Mira Glass%'
   OR personality  LIKE '%Mira Glass%'
   OR backstory    LIKE '%Mira Glass%'
   OR scenario     LIKE '%Mira Glass%'
   OR opening_line LIKE '%Mira Glass%'
   OR tagline      LIKE '%Mira Glass%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Mira Glass', 'Natalie'),
  headline = REPLACE(headline, 'Mira Glass', 'Natalie')
WHERE content LIKE '%Mira Glass%' OR headline LIKE '%Mira Glass%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Mira Glass', 'Natalie')
WHERE note LIKE '%Mira Glass%';

-- Elara Voss -> Kayla
UPDATE characters SET
  name = 'Kayla',
  description  = REPLACE(description,  'Elara Voss', 'Kayla'),
  personality  = REPLACE(personality,  'Elara Voss', 'Kayla'),
  backstory    = REPLACE(backstory,    'Elara Voss', 'Kayla'),
  scenario     = REPLACE(scenario,     'Elara Voss', 'Kayla'),
  opening_line = REPLACE(opening_line, 'Elara Voss', 'Kayla'),
  tagline      = REPLACE(tagline,      'Elara Voss', 'Kayla')
WHERE name = 'Elara Voss';

UPDATE characters SET
  description  = REPLACE(description,  'Elara Voss', 'Kayla'),
  personality  = REPLACE(personality,  'Elara Voss', 'Kayla'),
  backstory    = REPLACE(backstory,    'Elara Voss', 'Kayla'),
  scenario     = REPLACE(scenario,     'Elara Voss', 'Kayla'),
  opening_line = REPLACE(opening_line, 'Elara Voss', 'Kayla'),
  tagline      = REPLACE(tagline,      'Elara Voss', 'Kayla')
WHERE description  LIKE '%Elara Voss%'
   OR personality  LIKE '%Elara Voss%'
   OR backstory    LIKE '%Elara Voss%'
   OR scenario     LIKE '%Elara Voss%'
   OR opening_line LIKE '%Elara Voss%'
   OR tagline      LIKE '%Elara Voss%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Elara Voss', 'Kayla'),
  headline = REPLACE(headline, 'Elara Voss', 'Kayla')
WHERE content LIKE '%Elara Voss%' OR headline LIKE '%Elara Voss%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Elara Voss', 'Kayla')
WHERE note LIKE '%Elara Voss%';

-- Iset Vare -> Megan
UPDATE characters SET
  name = 'Megan',
  description  = REPLACE(description,  'Iset Vare', 'Megan'),
  personality  = REPLACE(personality,  'Iset Vare', 'Megan'),
  backstory    = REPLACE(backstory,    'Iset Vare', 'Megan'),
  scenario     = REPLACE(scenario,     'Iset Vare', 'Megan'),
  opening_line = REPLACE(opening_line, 'Iset Vare', 'Megan'),
  tagline      = REPLACE(tagline,      'Iset Vare', 'Megan')
WHERE name = 'Iset Vare';

UPDATE characters SET
  description  = REPLACE(description,  'Iset Vare', 'Megan'),
  personality  = REPLACE(personality,  'Iset Vare', 'Megan'),
  backstory    = REPLACE(backstory,    'Iset Vare', 'Megan'),
  scenario     = REPLACE(scenario,     'Iset Vare', 'Megan'),
  opening_line = REPLACE(opening_line, 'Iset Vare', 'Megan'),
  tagline      = REPLACE(tagline,      'Iset Vare', 'Megan')
WHERE description  LIKE '%Iset Vare%'
   OR personality  LIKE '%Iset Vare%'
   OR backstory    LIKE '%Iset Vare%'
   OR scenario     LIKE '%Iset Vare%'
   OR opening_line LIKE '%Iset Vare%'
   OR tagline      LIKE '%Iset Vare%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Iset Vare', 'Megan'),
  headline = REPLACE(headline, 'Iset Vare', 'Megan')
WHERE content LIKE '%Iset Vare%' OR headline LIKE '%Iset Vare%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Iset Vare', 'Megan')
WHERE note LIKE '%Iset Vare%';

-- Oryn Mast -> Michael
UPDATE characters SET
  name = 'Michael',
  description  = REPLACE(description,  'Oryn Mast', 'Michael'),
  personality  = REPLACE(personality,  'Oryn Mast', 'Michael'),
  backstory    = REPLACE(backstory,    'Oryn Mast', 'Michael'),
  scenario     = REPLACE(scenario,     'Oryn Mast', 'Michael'),
  opening_line = REPLACE(opening_line, 'Oryn Mast', 'Michael'),
  tagline      = REPLACE(tagline,      'Oryn Mast', 'Michael')
WHERE name = 'Oryn Mast';

UPDATE characters SET
  description  = REPLACE(description,  'Oryn Mast', 'Michael'),
  personality  = REPLACE(personality,  'Oryn Mast', 'Michael'),
  backstory    = REPLACE(backstory,    'Oryn Mast', 'Michael'),
  scenario     = REPLACE(scenario,     'Oryn Mast', 'Michael'),
  opening_line = REPLACE(opening_line, 'Oryn Mast', 'Michael'),
  tagline      = REPLACE(tagline,      'Oryn Mast', 'Michael')
WHERE description  LIKE '%Oryn Mast%'
   OR personality  LIKE '%Oryn Mast%'
   OR backstory    LIKE '%Oryn Mast%'
   OR scenario     LIKE '%Oryn Mast%'
   OR opening_line LIKE '%Oryn Mast%'
   OR tagline      LIKE '%Oryn Mast%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Oryn Mast', 'Michael'),
  headline = REPLACE(headline, 'Oryn Mast', 'Michael')
WHERE content LIKE '%Oryn Mast%' OR headline LIKE '%Oryn Mast%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Oryn Mast', 'Michael')
WHERE note LIKE '%Oryn Mast%';

-- Lev Adria -> Matthew
UPDATE characters SET
  name = 'Matthew',
  description  = REPLACE(description,  'Lev Adria', 'Matthew'),
  personality  = REPLACE(personality,  'Lev Adria', 'Matthew'),
  backstory    = REPLACE(backstory,    'Lev Adria', 'Matthew'),
  scenario     = REPLACE(scenario,     'Lev Adria', 'Matthew'),
  opening_line = REPLACE(opening_line, 'Lev Adria', 'Matthew'),
  tagline      = REPLACE(tagline,      'Lev Adria', 'Matthew')
WHERE name = 'Lev Adria';

UPDATE characters SET
  description  = REPLACE(description,  'Lev Adria', 'Matthew'),
  personality  = REPLACE(personality,  'Lev Adria', 'Matthew'),
  backstory    = REPLACE(backstory,    'Lev Adria', 'Matthew'),
  scenario     = REPLACE(scenario,     'Lev Adria', 'Matthew'),
  opening_line = REPLACE(opening_line, 'Lev Adria', 'Matthew'),
  tagline      = REPLACE(tagline,      'Lev Adria', 'Matthew')
WHERE description  LIKE '%Lev Adria%'
   OR personality  LIKE '%Lev Adria%'
   OR backstory    LIKE '%Lev Adria%'
   OR scenario     LIKE '%Lev Adria%'
   OR opening_line LIKE '%Lev Adria%'
   OR tagline      LIKE '%Lev Adria%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Lev Adria', 'Matthew'),
  headline = REPLACE(headline, 'Lev Adria', 'Matthew')
WHERE content LIKE '%Lev Adria%' OR headline LIKE '%Lev Adria%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Lev Adria', 'Matthew')
WHERE note LIKE '%Lev Adria%';

-- Seraphine -> Avery
UPDATE characters SET
  name = 'Avery',
  description  = REPLACE(description,  'Seraphine', 'Avery'),
  personality  = REPLACE(personality,  'Seraphine', 'Avery'),
  backstory    = REPLACE(backstory,    'Seraphine', 'Avery'),
  scenario     = REPLACE(scenario,     'Seraphine', 'Avery'),
  opening_line = REPLACE(opening_line, 'Seraphine', 'Avery'),
  tagline      = REPLACE(tagline,      'Seraphine', 'Avery')
WHERE name = 'Seraphine';

UPDATE characters SET
  description  = REPLACE(description,  'Seraphine', 'Avery'),
  personality  = REPLACE(personality,  'Seraphine', 'Avery'),
  backstory    = REPLACE(backstory,    'Seraphine', 'Avery'),
  scenario     = REPLACE(scenario,     'Seraphine', 'Avery'),
  opening_line = REPLACE(opening_line, 'Seraphine', 'Avery'),
  tagline      = REPLACE(tagline,      'Seraphine', 'Avery')
WHERE description  LIKE '%Seraphine%'
   OR personality  LIKE '%Seraphine%'
   OR backstory    LIKE '%Seraphine%'
   OR scenario     LIKE '%Seraphine%'
   OR opening_line LIKE '%Seraphine%'
   OR tagline      LIKE '%Seraphine%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Seraphine', 'Avery'),
  headline = REPLACE(headline, 'Seraphine', 'Avery')
WHERE content LIKE '%Seraphine%' OR headline LIKE '%Seraphine%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Seraphine', 'Avery')
WHERE note LIKE '%Seraphine%';

-- Hispania -> Ella
UPDATE characters SET
  name = 'Ella',
  description  = REPLACE(description,  'Hispania', 'Ella'),
  personality  = REPLACE(personality,  'Hispania', 'Ella'),
  backstory    = REPLACE(backstory,    'Hispania', 'Ella'),
  scenario     = REPLACE(scenario,     'Hispania', 'Ella'),
  opening_line = REPLACE(opening_line, 'Hispania', 'Ella'),
  tagline      = REPLACE(tagline,      'Hispania', 'Ella')
WHERE name = 'Hispania';

UPDATE characters SET
  description  = REPLACE(description,  'Hispania', 'Ella'),
  personality  = REPLACE(personality,  'Hispania', 'Ella'),
  backstory    = REPLACE(backstory,    'Hispania', 'Ella'),
  scenario     = REPLACE(scenario,     'Hispania', 'Ella'),
  opening_line = REPLACE(opening_line, 'Hispania', 'Ella'),
  tagline      = REPLACE(tagline,      'Hispania', 'Ella')
WHERE description  LIKE '%Hispania%'
   OR personality  LIKE '%Hispania%'
   OR backstory    LIKE '%Hispania%'
   OR scenario     LIKE '%Hispania%'
   OR opening_line LIKE '%Hispania%'
   OR tagline      LIKE '%Hispania%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Hispania', 'Ella'),
  headline = REPLACE(headline, 'Hispania', 'Ella')
WHERE content LIKE '%Hispania%' OR headline LIKE '%Hispania%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Hispania', 'Ella')
WHERE note LIKE '%Hispania%';

-- Marianne -> Evelyn
UPDATE characters SET
  name = 'Evelyn',
  description  = REPLACE(description,  'Marianne', 'Evelyn'),
  personality  = REPLACE(personality,  'Marianne', 'Evelyn'),
  backstory    = REPLACE(backstory,    'Marianne', 'Evelyn'),
  scenario     = REPLACE(scenario,     'Marianne', 'Evelyn'),
  opening_line = REPLACE(opening_line, 'Marianne', 'Evelyn'),
  tagline      = REPLACE(tagline,      'Marianne', 'Evelyn')
WHERE name = 'Marianne';

UPDATE characters SET
  description  = REPLACE(description,  'Marianne', 'Evelyn'),
  personality  = REPLACE(personality,  'Marianne', 'Evelyn'),
  backstory    = REPLACE(backstory,    'Marianne', 'Evelyn'),
  scenario     = REPLACE(scenario,     'Marianne', 'Evelyn'),
  opening_line = REPLACE(opening_line, 'Marianne', 'Evelyn'),
  tagline      = REPLACE(tagline,      'Marianne', 'Evelyn')
WHERE description  LIKE '%Marianne%'
   OR personality  LIKE '%Marianne%'
   OR backstory    LIKE '%Marianne%'
   OR scenario     LIKE '%Marianne%'
   OR opening_line LIKE '%Marianne%'
   OR tagline      LIKE '%Marianne%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Marianne', 'Evelyn'),
  headline = REPLACE(headline, 'Marianne', 'Evelyn')
WHERE content LIKE '%Marianne%' OR headline LIKE '%Marianne%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Marianne', 'Evelyn')
WHERE note LIKE '%Marianne%';

-- Aurelian -> Jayden
UPDATE characters SET
  name = 'Jayden',
  description  = REPLACE(description,  'Aurelian', 'Jayden'),
  personality  = REPLACE(personality,  'Aurelian', 'Jayden'),
  backstory    = REPLACE(backstory,    'Aurelian', 'Jayden'),
  scenario     = REPLACE(scenario,     'Aurelian', 'Jayden'),
  opening_line = REPLACE(opening_line, 'Aurelian', 'Jayden'),
  tagline      = REPLACE(tagline,      'Aurelian', 'Jayden')
WHERE name = 'Aurelian';

UPDATE characters SET
  description  = REPLACE(description,  'Aurelian', 'Jayden'),
  personality  = REPLACE(personality,  'Aurelian', 'Jayden'),
  backstory    = REPLACE(backstory,    'Aurelian', 'Jayden'),
  scenario     = REPLACE(scenario,     'Aurelian', 'Jayden'),
  opening_line = REPLACE(opening_line, 'Aurelian', 'Jayden'),
  tagline      = REPLACE(tagline,      'Aurelian', 'Jayden')
WHERE description  LIKE '%Aurelian%'
   OR personality  LIKE '%Aurelian%'
   OR backstory    LIKE '%Aurelian%'
   OR scenario     LIKE '%Aurelian%'
   OR opening_line LIKE '%Aurelian%'
   OR tagline      LIKE '%Aurelian%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Aurelian', 'Jayden'),
  headline = REPLACE(headline, 'Aurelian', 'Jayden')
WHERE content LIKE '%Aurelian%' OR headline LIKE '%Aurelian%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Aurelian', 'Jayden')
WHERE note LIKE '%Aurelian%';

-- Yanefes -> Ava
UPDATE characters SET
  name = 'Ava',
  description  = REPLACE(description,  'Yanefes', 'Ava'),
  personality  = REPLACE(personality,  'Yanefes', 'Ava'),
  backstory    = REPLACE(backstory,    'Yanefes', 'Ava'),
  scenario     = REPLACE(scenario,     'Yanefes', 'Ava'),
  opening_line = REPLACE(opening_line, 'Yanefes', 'Ava'),
  tagline      = REPLACE(tagline,      'Yanefes', 'Ava')
WHERE name = 'Yanefes';

UPDATE characters SET
  description  = REPLACE(description,  'Yanefes', 'Ava'),
  personality  = REPLACE(personality,  'Yanefes', 'Ava'),
  backstory    = REPLACE(backstory,    'Yanefes', 'Ava'),
  scenario     = REPLACE(scenario,     'Yanefes', 'Ava'),
  opening_line = REPLACE(opening_line, 'Yanefes', 'Ava'),
  tagline      = REPLACE(tagline,      'Yanefes', 'Ava')
WHERE description  LIKE '%Yanefes%'
   OR personality  LIKE '%Yanefes%'
   OR backstory    LIKE '%Yanefes%'
   OR scenario     LIKE '%Yanefes%'
   OR opening_line LIKE '%Yanefes%'
   OR tagline      LIKE '%Yanefes%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Yanefes', 'Ava'),
  headline = REPLACE(headline, 'Yanefes', 'Ava')
WHERE content LIKE '%Yanefes%' OR headline LIKE '%Yanefes%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Yanefes', 'Ava')
WHERE note LIKE '%Yanefes%';

-- Takeshi -> Alexander
UPDATE characters SET
  name = 'Alexander',
  description  = REPLACE(description,  'Takeshi', 'Alexander'),
  personality  = REPLACE(personality,  'Takeshi', 'Alexander'),
  backstory    = REPLACE(backstory,    'Takeshi', 'Alexander'),
  scenario     = REPLACE(scenario,     'Takeshi', 'Alexander'),
  opening_line = REPLACE(opening_line, 'Takeshi', 'Alexander'),
  tagline      = REPLACE(tagline,      'Takeshi', 'Alexander')
WHERE name = 'Takeshi';

UPDATE characters SET
  description  = REPLACE(description,  'Takeshi', 'Alexander'),
  personality  = REPLACE(personality,  'Takeshi', 'Alexander'),
  backstory    = REPLACE(backstory,    'Takeshi', 'Alexander'),
  scenario     = REPLACE(scenario,     'Takeshi', 'Alexander'),
  opening_line = REPLACE(opening_line, 'Takeshi', 'Alexander'),
  tagline      = REPLACE(tagline,      'Takeshi', 'Alexander')
WHERE description  LIKE '%Takeshi%'
   OR personality  LIKE '%Takeshi%'
   OR backstory    LIKE '%Takeshi%'
   OR scenario     LIKE '%Takeshi%'
   OR opening_line LIKE '%Takeshi%'
   OR tagline      LIKE '%Takeshi%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Takeshi', 'Alexander'),
  headline = REPLACE(headline, 'Takeshi', 'Alexander')
WHERE content LIKE '%Takeshi%' OR headline LIKE '%Takeshi%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Takeshi', 'Alexander')
WHERE note LIKE '%Takeshi%';

-- Dominik -> Logan
UPDATE characters SET
  name = 'Logan',
  description  = REPLACE(description,  'Dominik', 'Logan'),
  personality  = REPLACE(personality,  'Dominik', 'Logan'),
  backstory    = REPLACE(backstory,    'Dominik', 'Logan'),
  scenario     = REPLACE(scenario,     'Dominik', 'Logan'),
  opening_line = REPLACE(opening_line, 'Dominik', 'Logan'),
  tagline      = REPLACE(tagline,      'Dominik', 'Logan')
WHERE name = 'Dominik';

UPDATE characters SET
  description  = REPLACE(description,  'Dominik', 'Logan'),
  personality  = REPLACE(personality,  'Dominik', 'Logan'),
  backstory    = REPLACE(backstory,    'Dominik', 'Logan'),
  scenario     = REPLACE(scenario,     'Dominik', 'Logan'),
  opening_line = REPLACE(opening_line, 'Dominik', 'Logan'),
  tagline      = REPLACE(tagline,      'Dominik', 'Logan')
WHERE description  LIKE '%Dominik%'
   OR personality  LIKE '%Dominik%'
   OR backstory    LIKE '%Dominik%'
   OR scenario     LIKE '%Dominik%'
   OR opening_line LIKE '%Dominik%'
   OR tagline      LIKE '%Dominik%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Dominik', 'Logan'),
  headline = REPLACE(headline, 'Dominik', 'Logan')
WHERE content LIKE '%Dominik%' OR headline LIKE '%Dominik%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Dominik', 'Logan')
WHERE note LIKE '%Dominik%';

-- Fawrest -> Wyatt
UPDATE characters SET
  name = 'Wyatt',
  description  = REPLACE(description,  'Fawrest', 'Wyatt'),
  personality  = REPLACE(personality,  'Fawrest', 'Wyatt'),
  backstory    = REPLACE(backstory,    'Fawrest', 'Wyatt'),
  scenario     = REPLACE(scenario,     'Fawrest', 'Wyatt'),
  opening_line = REPLACE(opening_line, 'Fawrest', 'Wyatt'),
  tagline      = REPLACE(tagline,      'Fawrest', 'Wyatt')
WHERE name = 'Fawrest';

UPDATE characters SET
  description  = REPLACE(description,  'Fawrest', 'Wyatt'),
  personality  = REPLACE(personality,  'Fawrest', 'Wyatt'),
  backstory    = REPLACE(backstory,    'Fawrest', 'Wyatt'),
  scenario     = REPLACE(scenario,     'Fawrest', 'Wyatt'),
  opening_line = REPLACE(opening_line, 'Fawrest', 'Wyatt'),
  tagline      = REPLACE(tagline,      'Fawrest', 'Wyatt')
WHERE description  LIKE '%Fawrest%'
   OR personality  LIKE '%Fawrest%'
   OR backstory    LIKE '%Fawrest%'
   OR scenario     LIKE '%Fawrest%'
   OR opening_line LIKE '%Fawrest%'
   OR tagline      LIKE '%Fawrest%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Fawrest', 'Wyatt'),
  headline = REPLACE(headline, 'Fawrest', 'Wyatt')
WHERE content LIKE '%Fawrest%' OR headline LIKE '%Fawrest%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Fawrest', 'Wyatt')
WHERE note LIKE '%Fawrest%';

-- Sancea -> William
UPDATE characters SET
  name = 'William',
  description  = REPLACE(description,  'Sancea', 'William'),
  personality  = REPLACE(personality,  'Sancea', 'William'),
  backstory    = REPLACE(backstory,    'Sancea', 'William'),
  scenario     = REPLACE(scenario,     'Sancea', 'William'),
  opening_line = REPLACE(opening_line, 'Sancea', 'William'),
  tagline      = REPLACE(tagline,      'Sancea', 'William')
WHERE name = 'Sancea';

UPDATE characters SET
  description  = REPLACE(description,  'Sancea', 'William'),
  personality  = REPLACE(personality,  'Sancea', 'William'),
  backstory    = REPLACE(backstory,    'Sancea', 'William'),
  scenario     = REPLACE(scenario,     'Sancea', 'William'),
  opening_line = REPLACE(opening_line, 'Sancea', 'William'),
  tagline      = REPLACE(tagline,      'Sancea', 'William')
WHERE description  LIKE '%Sancea%'
   OR personality  LIKE '%Sancea%'
   OR backstory    LIKE '%Sancea%'
   OR scenario     LIKE '%Sancea%'
   OR opening_line LIKE '%Sancea%'
   OR tagline      LIKE '%Sancea%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Sancea', 'William'),
  headline = REPLACE(headline, 'Sancea', 'William')
WHERE content LIKE '%Sancea%' OR headline LIKE '%Sancea%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Sancea', 'William')
WHERE note LIKE '%Sancea%';

-- Narcis -> Noah
UPDATE characters SET
  name = 'Noah',
  description  = REPLACE(description,  'Narcis', 'Noah'),
  personality  = REPLACE(personality,  'Narcis', 'Noah'),
  backstory    = REPLACE(backstory,    'Narcis', 'Noah'),
  scenario     = REPLACE(scenario,     'Narcis', 'Noah'),
  opening_line = REPLACE(opening_line, 'Narcis', 'Noah'),
  tagline      = REPLACE(tagline,      'Narcis', 'Noah')
WHERE name = 'Narcis';

UPDATE characters SET
  description  = REPLACE(description,  'Narcis', 'Noah'),
  personality  = REPLACE(personality,  'Narcis', 'Noah'),
  backstory    = REPLACE(backstory,    'Narcis', 'Noah'),
  scenario     = REPLACE(scenario,     'Narcis', 'Noah'),
  opening_line = REPLACE(opening_line, 'Narcis', 'Noah'),
  tagline      = REPLACE(tagline,      'Narcis', 'Noah')
WHERE description  LIKE '%Narcis%'
   OR personality  LIKE '%Narcis%'
   OR backstory    LIKE '%Narcis%'
   OR scenario     LIKE '%Narcis%'
   OR opening_line LIKE '%Narcis%'
   OR tagline      LIKE '%Narcis%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Narcis', 'Noah'),
  headline = REPLACE(headline, 'Narcis', 'Noah')
WHERE content LIKE '%Narcis%' OR headline LIKE '%Narcis%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Narcis', 'Noah')
WHERE note LIKE '%Narcis%';

-- Alexei -> Ethan
UPDATE characters SET
  name = 'Ethan',
  description  = REPLACE(description,  'Alexei', 'Ethan'),
  personality  = REPLACE(personality,  'Alexei', 'Ethan'),
  backstory    = REPLACE(backstory,    'Alexei', 'Ethan'),
  scenario     = REPLACE(scenario,     'Alexei', 'Ethan'),
  opening_line = REPLACE(opening_line, 'Alexei', 'Ethan'),
  tagline      = REPLACE(tagline,      'Alexei', 'Ethan')
WHERE name = 'Alexei';

UPDATE characters SET
  description  = REPLACE(description,  'Alexei', 'Ethan'),
  personality  = REPLACE(personality,  'Alexei', 'Ethan'),
  backstory    = REPLACE(backstory,    'Alexei', 'Ethan'),
  scenario     = REPLACE(scenario,     'Alexei', 'Ethan'),
  opening_line = REPLACE(opening_line, 'Alexei', 'Ethan'),
  tagline      = REPLACE(tagline,      'Alexei', 'Ethan')
WHERE description  LIKE '%Alexei%'
   OR personality  LIKE '%Alexei%'
   OR backstory    LIKE '%Alexei%'
   OR scenario     LIKE '%Alexei%'
   OR opening_line LIKE '%Alexei%'
   OR tagline      LIKE '%Alexei%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Alexei', 'Ethan'),
  headline = REPLACE(headline, 'Alexei', 'Ethan')
WHERE content LIKE '%Alexei%' OR headline LIKE '%Alexei%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Alexei', 'Ethan')
WHERE note LIKE '%Alexei%';

-- Bianca -> Sophia
UPDATE characters SET
  name = 'Sophia',
  description  = REPLACE(description,  'Bianca', 'Sophia'),
  personality  = REPLACE(personality,  'Bianca', 'Sophia'),
  backstory    = REPLACE(backstory,    'Bianca', 'Sophia'),
  scenario     = REPLACE(scenario,     'Bianca', 'Sophia'),
  opening_line = REPLACE(opening_line, 'Bianca', 'Sophia'),
  tagline      = REPLACE(tagline,      'Bianca', 'Sophia')
WHERE name = 'Bianca';

UPDATE characters SET
  description  = REPLACE(description,  'Bianca', 'Sophia'),
  personality  = REPLACE(personality,  'Bianca', 'Sophia'),
  backstory    = REPLACE(backstory,    'Bianca', 'Sophia'),
  scenario     = REPLACE(scenario,     'Bianca', 'Sophia'),
  opening_line = REPLACE(opening_line, 'Bianca', 'Sophia'),
  tagline      = REPLACE(tagline,      'Bianca', 'Sophia')
WHERE description  LIKE '%Bianca%'
   OR personality  LIKE '%Bianca%'
   OR backstory    LIKE '%Bianca%'
   OR scenario     LIKE '%Bianca%'
   OR opening_line LIKE '%Bianca%'
   OR tagline      LIKE '%Bianca%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Bianca', 'Sophia'),
  headline = REPLACE(headline, 'Bianca', 'Sophia')
WHERE content LIKE '%Bianca%' OR headline LIKE '%Bianca%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Bianca', 'Sophia')
WHERE note LIKE '%Bianca%';

-- Hannah -> Sofia
UPDATE characters SET
  name = 'Sofia',
  description  = REPLACE(description,  'Hannah', 'Sofia'),
  personality  = REPLACE(personality,  'Hannah', 'Sofia'),
  backstory    = REPLACE(backstory,    'Hannah', 'Sofia'),
  scenario     = REPLACE(scenario,     'Hannah', 'Sofia'),
  opening_line = REPLACE(opening_line, 'Hannah', 'Sofia'),
  tagline      = REPLACE(tagline,      'Hannah', 'Sofia')
WHERE name = 'Hannah';

UPDATE characters SET
  description  = REPLACE(description,  'Hannah', 'Sofia'),
  personality  = REPLACE(personality,  'Hannah', 'Sofia'),
  backstory    = REPLACE(backstory,    'Hannah', 'Sofia'),
  scenario     = REPLACE(scenario,     'Hannah', 'Sofia'),
  opening_line = REPLACE(opening_line, 'Hannah', 'Sofia'),
  tagline      = REPLACE(tagline,      'Hannah', 'Sofia')
WHERE description  LIKE '%Hannah%'
   OR personality  LIKE '%Hannah%'
   OR backstory    LIKE '%Hannah%'
   OR scenario     LIKE '%Hannah%'
   OR opening_line LIKE '%Hannah%'
   OR tagline      LIKE '%Hannah%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Hannah', 'Sofia'),
  headline = REPLACE(headline, 'Hannah', 'Sofia')
WHERE content LIKE '%Hannah%' OR headline LIKE '%Hannah%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Hannah', 'Sofia')
WHERE note LIKE '%Hannah%';

-- Crixux -> Julian
UPDATE characters SET
  name = 'Julian',
  description  = REPLACE(description,  'Crixux', 'Julian'),
  personality  = REPLACE(personality,  'Crixux', 'Julian'),
  backstory    = REPLACE(backstory,    'Crixux', 'Julian'),
  scenario     = REPLACE(scenario,     'Crixux', 'Julian'),
  opening_line = REPLACE(opening_line, 'Crixux', 'Julian'),
  tagline      = REPLACE(tagline,      'Crixux', 'Julian')
WHERE name = 'Crixux';

UPDATE characters SET
  description  = REPLACE(description,  'Crixux', 'Julian'),
  personality  = REPLACE(personality,  'Crixux', 'Julian'),
  backstory    = REPLACE(backstory,    'Crixux', 'Julian'),
  scenario     = REPLACE(scenario,     'Crixux', 'Julian'),
  opening_line = REPLACE(opening_line, 'Crixux', 'Julian'),
  tagline      = REPLACE(tagline,      'Crixux', 'Julian')
WHERE description  LIKE '%Crixux%'
   OR personality  LIKE '%Crixux%'
   OR backstory    LIKE '%Crixux%'
   OR scenario     LIKE '%Crixux%'
   OR opening_line LIKE '%Crixux%'
   OR tagline      LIKE '%Crixux%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Crixux', 'Julian'),
  headline = REPLACE(headline, 'Crixux', 'Julian')
WHERE content LIKE '%Crixux%' OR headline LIKE '%Crixux%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Crixux', 'Julian')
WHERE note LIKE '%Crixux%';

-- Tamara -> Alexis
UPDATE characters SET
  name = 'Alexis',
  description  = REPLACE(description,  'Tamara', 'Alexis'),
  personality  = REPLACE(personality,  'Tamara', 'Alexis'),
  backstory    = REPLACE(backstory,    'Tamara', 'Alexis'),
  scenario     = REPLACE(scenario,     'Tamara', 'Alexis'),
  opening_line = REPLACE(opening_line, 'Tamara', 'Alexis'),
  tagline      = REPLACE(tagline,      'Tamara', 'Alexis')
WHERE name = 'Tamara';

UPDATE characters SET
  description  = REPLACE(description,  'Tamara', 'Alexis'),
  personality  = REPLACE(personality,  'Tamara', 'Alexis'),
  backstory    = REPLACE(backstory,    'Tamara', 'Alexis'),
  scenario     = REPLACE(scenario,     'Tamara', 'Alexis'),
  opening_line = REPLACE(opening_line, 'Tamara', 'Alexis'),
  tagline      = REPLACE(tagline,      'Tamara', 'Alexis')
WHERE description  LIKE '%Tamara%'
   OR personality  LIKE '%Tamara%'
   OR backstory    LIKE '%Tamara%'
   OR scenario     LIKE '%Tamara%'
   OR opening_line LIKE '%Tamara%'
   OR tagline      LIKE '%Tamara%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Tamara', 'Alexis'),
  headline = REPLACE(headline, 'Tamara', 'Alexis')
WHERE content LIKE '%Tamara%' OR headline LIKE '%Tamara%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Tamara', 'Alexis')
WHERE note LIKE '%Tamara%';

-- Athra -> Tyler
UPDATE characters SET
  name = 'Tyler',
  description  = REPLACE(description,  'Athra', 'Tyler'),
  personality  = REPLACE(personality,  'Athra', 'Tyler'),
  backstory    = REPLACE(backstory,    'Athra', 'Tyler'),
  scenario     = REPLACE(scenario,     'Athra', 'Tyler'),
  opening_line = REPLACE(opening_line, 'Athra', 'Tyler'),
  tagline      = REPLACE(tagline,      'Athra', 'Tyler')
WHERE name = 'Athra';

UPDATE characters SET
  description  = REPLACE(description,  'Athra', 'Tyler'),
  personality  = REPLACE(personality,  'Athra', 'Tyler'),
  backstory    = REPLACE(backstory,    'Athra', 'Tyler'),
  scenario     = REPLACE(scenario,     'Athra', 'Tyler'),
  opening_line = REPLACE(opening_line, 'Athra', 'Tyler'),
  tagline      = REPLACE(tagline,      'Athra', 'Tyler')
WHERE description  LIKE '%Athra%'
   OR personality  LIKE '%Athra%'
   OR backstory    LIKE '%Athra%'
   OR scenario     LIKE '%Athra%'
   OR opening_line LIKE '%Athra%'
   OR tagline      LIKE '%Athra%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Athra', 'Tyler'),
  headline = REPLACE(headline, 'Athra', 'Tyler')
WHERE content LIKE '%Athra%' OR headline LIKE '%Athra%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Athra', 'Tyler')
WHERE note LIKE '%Athra%';

-- Haifa -> Olivia
UPDATE characters SET
  name = 'Olivia',
  description  = REPLACE(description,  'Haifa', 'Olivia'),
  personality  = REPLACE(personality,  'Haifa', 'Olivia'),
  backstory    = REPLACE(backstory,    'Haifa', 'Olivia'),
  scenario     = REPLACE(scenario,     'Haifa', 'Olivia'),
  opening_line = REPLACE(opening_line, 'Haifa', 'Olivia'),
  tagline      = REPLACE(tagline,      'Haifa', 'Olivia')
WHERE name = 'Haifa';

UPDATE characters SET
  description  = REPLACE(description,  'Haifa', 'Olivia'),
  personality  = REPLACE(personality,  'Haifa', 'Olivia'),
  backstory    = REPLACE(backstory,    'Haifa', 'Olivia'),
  scenario     = REPLACE(scenario,     'Haifa', 'Olivia'),
  opening_line = REPLACE(opening_line, 'Haifa', 'Olivia'),
  tagline      = REPLACE(tagline,      'Haifa', 'Olivia')
WHERE description  LIKE '%Haifa%'
   OR personality  LIKE '%Haifa%'
   OR backstory    LIKE '%Haifa%'
   OR scenario     LIKE '%Haifa%'
   OR opening_line LIKE '%Haifa%'
   OR tagline      LIKE '%Haifa%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Haifa', 'Olivia'),
  headline = REPLACE(headline, 'Haifa', 'Olivia')
WHERE content LIKE '%Haifa%' OR headline LIKE '%Haifa%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Haifa', 'Olivia')
WHERE note LIKE '%Haifa%';

-- Aruna -> Brianna
UPDATE characters SET
  name = 'Brianna',
  description  = REPLACE(description,  'Aruna', 'Brianna'),
  personality  = REPLACE(personality,  'Aruna', 'Brianna'),
  backstory    = REPLACE(backstory,    'Aruna', 'Brianna'),
  scenario     = REPLACE(scenario,     'Aruna', 'Brianna'),
  opening_line = REPLACE(opening_line, 'Aruna', 'Brianna'),
  tagline      = REPLACE(tagline,      'Aruna', 'Brianna')
WHERE name = 'Aruna';

UPDATE characters SET
  description  = REPLACE(description,  'Aruna', 'Brianna'),
  personality  = REPLACE(personality,  'Aruna', 'Brianna'),
  backstory    = REPLACE(backstory,    'Aruna', 'Brianna'),
  scenario     = REPLACE(scenario,     'Aruna', 'Brianna'),
  opening_line = REPLACE(opening_line, 'Aruna', 'Brianna'),
  tagline      = REPLACE(tagline,      'Aruna', 'Brianna')
WHERE description  LIKE '%Aruna%'
   OR personality  LIKE '%Aruna%'
   OR backstory    LIKE '%Aruna%'
   OR scenario     LIKE '%Aruna%'
   OR opening_line LIKE '%Aruna%'
   OR tagline      LIKE '%Aruna%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Aruna', 'Brianna'),
  headline = REPLACE(headline, 'Aruna', 'Brianna')
WHERE content LIKE '%Aruna%' OR headline LIKE '%Aruna%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Aruna', 'Brianna')
WHERE note LIKE '%Aruna%';

-- Lylia -> Nicole
UPDATE characters SET
  name = 'Nicole',
  description  = REPLACE(description,  'Lylia', 'Nicole'),
  personality  = REPLACE(personality,  'Lylia', 'Nicole'),
  backstory    = REPLACE(backstory,    'Lylia', 'Nicole'),
  scenario     = REPLACE(scenario,     'Lylia', 'Nicole'),
  opening_line = REPLACE(opening_line, 'Lylia', 'Nicole'),
  tagline      = REPLACE(tagline,      'Lylia', 'Nicole')
WHERE name = 'Lylia';

UPDATE characters SET
  description  = REPLACE(description,  'Lylia', 'Nicole'),
  personality  = REPLACE(personality,  'Lylia', 'Nicole'),
  backstory    = REPLACE(backstory,    'Lylia', 'Nicole'),
  scenario     = REPLACE(scenario,     'Lylia', 'Nicole'),
  opening_line = REPLACE(opening_line, 'Lylia', 'Nicole'),
  tagline      = REPLACE(tagline,      'Lylia', 'Nicole')
WHERE description  LIKE '%Lylia%'
   OR personality  LIKE '%Lylia%'
   OR backstory    LIKE '%Lylia%'
   OR scenario     LIKE '%Lylia%'
   OR opening_line LIKE '%Lylia%'
   OR tagline      LIKE '%Lylia%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Lylia', 'Nicole'),
  headline = REPLACE(headline, 'Lylia', 'Nicole')
WHERE content LIKE '%Lylia%' OR headline LIKE '%Lylia%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Lylia', 'Nicole')
WHERE note LIKE '%Lylia%';

-- Elan -> Anthony
UPDATE characters SET
  name = 'Anthony',
  description  = REPLACE(description,  'Elan', 'Anthony'),
  personality  = REPLACE(personality,  'Elan', 'Anthony'),
  backstory    = REPLACE(backstory,    'Elan', 'Anthony'),
  scenario     = REPLACE(scenario,     'Elan', 'Anthony'),
  opening_line = REPLACE(opening_line, 'Elan', 'Anthony'),
  tagline      = REPLACE(tagline,      'Elan', 'Anthony')
WHERE name = 'Elan';

UPDATE characters SET
  description  = REPLACE(description,  'Elan', 'Anthony'),
  personality  = REPLACE(personality,  'Elan', 'Anthony'),
  backstory    = REPLACE(backstory,    'Elan', 'Anthony'),
  scenario     = REPLACE(scenario,     'Elan', 'Anthony'),
  opening_line = REPLACE(opening_line, 'Elan', 'Anthony'),
  tagline      = REPLACE(tagline,      'Elan', 'Anthony')
WHERE description  LIKE '%Elan%'
   OR personality  LIKE '%Elan%'
   OR backstory    LIKE '%Elan%'
   OR scenario     LIKE '%Elan%'
   OR opening_line LIKE '%Elan%'
   OR tagline      LIKE '%Elan%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Elan', 'Anthony'),
  headline = REPLACE(headline, 'Elan', 'Anthony')
WHERE content LIKE '%Elan%' OR headline LIKE '%Elan%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Elan', 'Anthony')
WHERE note LIKE '%Elan%';

-- Rumi -> Brandon
UPDATE characters SET
  name = 'Brandon',
  description  = REPLACE(description,  'Rumi', 'Brandon'),
  personality  = REPLACE(personality,  'Rumi', 'Brandon'),
  backstory    = REPLACE(backstory,    'Rumi', 'Brandon'),
  scenario     = REPLACE(scenario,     'Rumi', 'Brandon'),
  opening_line = REPLACE(opening_line, 'Rumi', 'Brandon'),
  tagline      = REPLACE(tagline,      'Rumi', 'Brandon')
WHERE name = 'Rumi';

UPDATE characters SET
  description  = REPLACE(description,  'Rumi', 'Brandon'),
  personality  = REPLACE(personality,  'Rumi', 'Brandon'),
  backstory    = REPLACE(backstory,    'Rumi', 'Brandon'),
  scenario     = REPLACE(scenario,     'Rumi', 'Brandon'),
  opening_line = REPLACE(opening_line, 'Rumi', 'Brandon'),
  tagline      = REPLACE(tagline,      'Rumi', 'Brandon')
WHERE description  LIKE '%Rumi%'
   OR personality  LIKE '%Rumi%'
   OR backstory    LIKE '%Rumi%'
   OR scenario     LIKE '%Rumi%'
   OR opening_line LIKE '%Rumi%'
   OR tagline      LIKE '%Rumi%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Rumi', 'Brandon'),
  headline = REPLACE(headline, 'Rumi', 'Brandon')
WHERE content LIKE '%Rumi%' OR headline LIKE '%Rumi%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Rumi', 'Brandon')
WHERE note LIKE '%Rumi%';

-- Agon -> Gabriel
UPDATE characters SET
  name = 'Gabriel',
  description  = REPLACE(description,  'Agon', 'Gabriel'),
  personality  = REPLACE(personality,  'Agon', 'Gabriel'),
  backstory    = REPLACE(backstory,    'Agon', 'Gabriel'),
  scenario     = REPLACE(scenario,     'Agon', 'Gabriel'),
  opening_line = REPLACE(opening_line, 'Agon', 'Gabriel'),
  tagline      = REPLACE(tagline,      'Agon', 'Gabriel')
WHERE name = 'Agon';

UPDATE characters SET
  description  = REPLACE(description,  'Agon', 'Gabriel'),
  personality  = REPLACE(personality,  'Agon', 'Gabriel'),
  backstory    = REPLACE(backstory,    'Agon', 'Gabriel'),
  scenario     = REPLACE(scenario,     'Agon', 'Gabriel'),
  opening_line = REPLACE(opening_line, 'Agon', 'Gabriel'),
  tagline      = REPLACE(tagline,      'Agon', 'Gabriel')
WHERE description  LIKE '%Agon%'
   OR personality  LIKE '%Agon%'
   OR backstory    LIKE '%Agon%'
   OR scenario     LIKE '%Agon%'
   OR opening_line LIKE '%Agon%'
   OR tagline      LIKE '%Agon%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Agon', 'Gabriel'),
  headline = REPLACE(headline, 'Agon', 'Gabriel')
WHERE content LIKE '%Agon%' OR headline LIKE '%Agon%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Agon', 'Gabriel')
WHERE note LIKE '%Agon%';

-- Nyx -> Grace
UPDATE characters SET
  name = 'Grace',
  description  = REPLACE(description,  'Nyx', 'Grace'),
  personality  = REPLACE(personality,  'Nyx', 'Grace'),
  backstory    = REPLACE(backstory,    'Nyx', 'Grace'),
  scenario     = REPLACE(scenario,     'Nyx', 'Grace'),
  opening_line = REPLACE(opening_line, 'Nyx', 'Grace'),
  tagline      = REPLACE(tagline,      'Nyx', 'Grace')
WHERE name = 'Nyx';

UPDATE characters SET
  description  = REPLACE(description,  'Nyx', 'Grace'),
  personality  = REPLACE(personality,  'Nyx', 'Grace'),
  backstory    = REPLACE(backstory,    'Nyx', 'Grace'),
  scenario     = REPLACE(scenario,     'Nyx', 'Grace'),
  opening_line = REPLACE(opening_line, 'Nyx', 'Grace'),
  tagline      = REPLACE(tagline,      'Nyx', 'Grace')
WHERE description  LIKE '%Nyx%'
   OR personality  LIKE '%Nyx%'
   OR backstory    LIKE '%Nyx%'
   OR scenario     LIKE '%Nyx%'
   OR opening_line LIKE '%Nyx%'
   OR tagline      LIKE '%Nyx%';

UPDATE character_seed_memories SET
  content  = REPLACE(content,  'Nyx', 'Grace'),
  headline = REPLACE(headline, 'Nyx', 'Grace')
WHERE content LIKE '%Nyx%' OR headline LIKE '%Nyx%';

UPDATE companion_relationships SET
  note = REPLACE(note, 'Nyx', 'Grace')
WHERE note LIKE '%Nyx%';

COMMIT;
