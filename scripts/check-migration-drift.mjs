#!/usr/bin/env node
// scripts/check-migration-drift.mjs
//
// WHY THIS EXISTS: on 2026-09-11 we found 87 migrations that had been
// applied directly to production (via the Supabase dashboard/SQL editor,
// or a prior session) but were never committed to supabase/migrations/.
// That means `git clone` + `supabase db push` did NOT actually reproduce
// production — anyone bootstrapping a new environment from git alone was
// silently missing schema. verify-migrations.sh doesn't catch this: it only
// checks that the files *in the repo* apply cleanly, not whether the repo
// is *missing* files that are already live.
//
// This script closes that gap. It reads Supabase's own migration ledger
// (supabase_migrations.schema_migrations) directly and diffs it against
// supabase/migrations/ in git.
//
// USAGE:
//   SUPABASE_DB_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" \
//     node scripts/check-migration-drift.mjs
//
// Get that connection string from Project Settings > Database > Connection
// string (URI) in the Supabase dashboard. Use the direct (non-pooler)
// connection — this runs one query and exits, no pooling benefit either way.
//
// Exits non-zero (and lists exactly which migrations) if production has
// applied migrations that don't exist in git. Never writes anything —
// read-only against both the DB and the filesystem. Run this:
//   - in CI, on a schedule (not just on push — drift happens *between*
//     pushes, whenever someone runs SQL directly against the dashboard)
//   - manually, any time before you trust `supabase/migrations/` as a
//     complete record of what's live
//
// If it finds drift, the fix is the same manual step we did by hand this
// session: pull each missing version's `statements` from
// supabase_migrations.schema_migrations and write it to
// supabase/migrations/<version>_<name>.sql. This script only detects the
// gap — it deliberately does not auto-write migration files, since that
// should be a reviewed commit, not a background script's side effect.
//
// NOTE ON IMPLEMENTATION: this queries supabase_migrations.schema_migrations
// directly (via the `pg` package) rather than either of the more obvious
// options:
//   - Supabase's Management API (GET /v1/projects/{ref}/database/migrations)
//     is real but gated to approved customers only as of writing.
//   - The Supabase CLI's `migration list --linked` has a documented bug
//     (supabase/cli#4758) that mis-parses 8/10-digit version strings as
//     timestamps and produces false Local/Remote mismatches — this repo's
//     migrations mix 8, 10, and 14-digit version formats, so that bug would
//     hit us directly. Querying the table ourselves sidesteps it entirely.
//
// Requires the `pg` package (`npm install --save-dev pg` if not already a
// dependency).

import { readdirSync } from "node:fs";
import pg from "pg";

async function getLiveMigrations() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error(
      "Missing SUPABASE_DB_URL env var. Get the direct connection string from\n" +
      "Project Settings > Database > Connection string (URI) in the Supabase\n" +
      "dashboard, then: SUPABASE_DB_URL=\"...\" node scripts/check-migration-drift.mjs"
    );
    process.exit(2);
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query(
      "select version, name from supabase_migrations.schema_migrations order by version"
    );
    return rows;
  } finally {
    await client.end();
  }
}

// Same normalization used to reconcile the 87-migration backfill: strip a
// leading date-ish prefix (git files and Supabase's `name` field both
// sometimes carry one), then keep only alphanumerics, so
// "20260909201135_20270112_creator_monetization.sql" and
// "20270112_creator_monetization" are recognized as the same migration.
function normalize(s) {
  return s
    .replace(/\.sql$/, "")
    // `+` here matters: some migration names carry a nested extra date
    // prefix (e.g. "20260909201135_20270112_creator_monetization" — the
    // real version, then an unrelated date someone typed into the name).
    // A single non-repeating strip left that second prefix behind and
    // caused 19 false "missing" hits during the manual reconciliation
    // this script is based on. Strip every leading run of them.
    .replace(/^(?:[0-9]{6,14}_?)+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getGitMigrationFiles() {
  return readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
}

const gitFiles = getGitMigrationFiles();
const liveMigrations = await getLiveMigrations();

const gitNormalized = new Set(gitFiles.map(normalize));
const missing = liveMigrations.filter((m) => !gitNormalized.has(normalize(m.name)));

if (missing.length === 0) {
  console.log(
    `✅ No drift: all ${liveMigrations.length} production migrations have a matching file in supabase/migrations/ (${gitFiles.length} files).`
  );
  process.exit(0);
}

console.error(
  `❌ Drift detected: ${missing.length} migration(s) are applied in production but missing from supabase/migrations/:\n`
);
for (const m of missing) {
  console.error(`  ${m.version}  ${m.name}`);
}
console.error(
  `\nFix: pull each version's SQL from supabase_migrations.schema_migrations.statements\n` +
  `and commit it as supabase/migrations/<version>_<name>.sql. Do not skip this —\n` +
  `a fresh clone + 'supabase db push' will not reproduce production until these\n` +
  `files exist in git.`
);
process.exit(1);
