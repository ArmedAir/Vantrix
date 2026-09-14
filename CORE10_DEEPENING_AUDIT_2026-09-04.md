# Core 10 Character Deepening — Audit & Delivery, 2026-09-04

## What was checked before writing anything

Confirmed against the actual codebase (`vantrix-x-social-admin-ui.zip`), not assumed from the reference doc:

1. **Character coverage** — grepped `docs/character-source-data/{canon,seeds}.ts.txt` for all 10 names.
   Only **Yanefes, Ghost of Muru, Dominik** exist in this codebase's seed data. The other 7
   (Aruna, Lylia, Fawrest, Agon, Crixux, Tamara, Elara Voss) are not present here — matches
   what the reference doc itself flagged under "Environment note." The migration is name-keyed
   and idempotent by design, so this is a no-op for those 7 until they're seeded, not a bug.
2. **Schema** — `character_seed_memories` (`20260803_character_seed_memories.sql`) has no
   `is_testable`/`test_hint` columns on its own; those are added by a later `ALTER TABLE` in
   `20260822_archive_of_echoes_roleplay_system.sql`, which already ships in this repo. Confirmed
   present before relying on them.
3. **`companion_relationships`** (also `20260822_...roleplay_system.sql`) has a `CHECK` constraint
   on `relationship_type` (`unresolved_thread` is a valid value) and `reveal_tier`
   (`catastrophic` is a valid value) — both values the doc's migration uses are legal.
4. **`characters.attachment_style` / `love_language`** — both plain `TEXT`, no enum constraint,
   confirmed via `20240101_production.sql`. Confirmed the 3 seeded characters don't already set
   these fields in `seeds.ts` — consistent with the doc's claim they were NULL.

## The real problem: the supplied `.sql` file was not usable

`20260904_deepen_core10_characters.sql` (the second uploaded PDF) is a PDF-text-extraction of
the migration, not the file itself — every `UPDATE`/`INSERT` statement is truncated mid-string
(e.g. `SELECT v_char_id, v_owner_id, 'psychology', ..., 'Aruna proce` — cut off, no closing
quote, no rest of the statement). None of it would run. I did not try to patch the fragments;
I rebuilt the migration from scratch using the full prose in the first PDF (the character
reference doc), against the column shapes actually confirmed in step 2–4 above, matching the
exact `INSERT ... SELECT ... WHERE NOT EXISTS` idiom already used in
`20260822_archive_of_echoes_roleplay_system.sql` (same file the doc says it's imitating).

Two smaller corrections along the way:
- **Filename** — the doc's proposed `20260904_deepen_core10_characters.sql` collides with this
  repo's actual convention (`YYYYMMDDNN`, two-digit sequence suffix — e.g. `2026090400`,
  `2026090401`, `2026090402` already exist for today). Delivered as
  **`2026090403_deepen_core10_characters.sql`**.
- **Row count** — the doc's own summary says "74 seed-memory rows," but its own described
  structure (7 rows × 10 characters, +1 catastrophic row each for Yanefes and Ghost of Muru
  only) is 7×10 + 2 = **72**, which is what's actually in the delivered file. Not a functional
  issue, just flagging the doc's total was off by 2.

## What's in the delivered migration

`supabase/migrations/2026090403_deepen_core10_characters.sql`:
- 10 `UPDATE characters SET love_language = ..., attachment_style = ...` (name-keyed)
- 72 `character_seed_memories` inserts (psychology / romance / speech / known / hidden / dark /
  relationship_stages for all 10, + catastrophic for Yanefes and Ghost of Muru), each guarded
  by `WHERE NOT EXISTS (... AND headline = '...')`
- Dark-secret rows carry `is_testable = TRUE` + a short `test_hint`, matching the existing
  convention `memory-test-engine.ts` reads
- 2 `companion_relationships` rows (`unresolved_thread` / `catastrophic`) linking
  Yanefes  Ghost of Muru, each guarded against re-insertion

Verified statically (no live DB in this sandbox — same limitation as prior sessions, flagged
each time): quote-escaping balanced, every one of the 72 inserts has its own guard clause,
no filename collision, all referenced columns/tables/constraints confirmed to exist in this
exact codebase. **Not yet run against a real Postgres instance** — `scripts/verify-migrations.sh`
needs Docker + Supabase CLI, which this sandbox can't reach. Recommend running that script, or
applying it to your Supabase project directly, before trusting it in production.

## Not touched

No other files in the codebase were modified. This is additive schema data only — nothing in
`replyguard.ts`, `moderation/index.ts`, or `keyword-watch.ts` was touched, matching the original
doc's own scope note.
