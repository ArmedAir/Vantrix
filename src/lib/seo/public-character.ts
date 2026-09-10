import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * §2.5 — public, crawlable character pages.
 *
 * GET /api/characters/:id is owner-only by design (see that route's own
 * docstring: "public viewers use /discover queries elsewhere"), and the
 * `characters_read` RLS policy (active = TRUE AND moderation_status =
 * 'approved') never learned about the later `is_public` column added in
 * 20260623_character_activation_and_visibility.sql — it's the ANON-key
 * guest client that's supposed to gate on is_public, not RLS, and every
 * existing anon caller (discover/featured, dating pools) already adds
 * `.eq("is_public", true)` by hand for exactly that reason. This file is
 * a new anon-reachable surface for that same "public" character subset,
 * so it uses supabaseAdmin (bypasses RLS entirely) and applies the full
 * explicit filter set itself rather than leaning on a policy that would
 * silently under-gate it if RLS were ever relied on alone:
 * active, is_public, is_live, moderation_status = 'approved', and
 * is_nsfw = false (a crawler/anonymous visitor never gets NSFW content —
 * there's no session here to apply resolveNsfwDiscoveryAccess() against).
 */

export interface PublicCharacter {
  id: string;
  name: string;
  age: number | null;
  gender: string | null;
  description: string | null;
  image_url: string | null;
  tags: string[];
  archetype: string | null;
  occupation: string | null;
  category: string | null;
  opening_line: string | null;
  like_count: number;
  follower_count: number;
  created_at: string;
}

const PUBLIC_CHAR_SELECT =
  "id,name,age,gender,description,image_url,tags,archetype,occupation,category,opening_line,like_count,follower_count,created_at";

const PUBLIC_FILTER_COLUMNS = "active,is_public,is_live,moderation_status,is_nsfw" as const;

type PublicFilterRow = {
  active: boolean;
  is_public: boolean;
  is_live: boolean | null;
  moderation_status: string;
  is_nsfw: boolean;
};

function isPublicRow(row: PublicFilterRow): boolean {
  return Boolean(
    row.active &&
    row.is_public &&
    row.is_live &&
    row.moderation_status === "approved" &&
    !row.is_nsfw
  );
}

/**
 * The one place the five-clause "what counts as public" filter is spelled
 * out. Previously duplicated verbatim across getPublicCharacterIds() and
 * getPublicCharacters() (three .eq() chains, five lines each) — a future
 * change to the definition (e.g. adding a new gating column) only had to
 * update isPublicRow() for the single-row lookup, not this list-query
 * chain, which is exactly the kind of drift this file's own header warns
 * about re: RLS. Generic over the query builder type so both the
 * `select("id")` and full-row callers can share it.
 */
function applyPublicListFilters<Q>(query: Q): Q {
  // Supabase's generated `.eq()` overloads are typed with column-name
  // literals specific to each table's row shape, which don't structurally
  // unify with a loose generic `(column, value) => Q` constraint — hence
  // the narrow, deliberate `any` here rather than fighting the generated
  // types. The external signature (`Q in, Q out`) keeps call sites
  // type-safe; only this internal chain is unchecked.
  type LooseFilter = { eq: (column: string, value: unknown) => LooseFilter };
  return (query as unknown as LooseFilter)
    .eq("active", true)
    .eq("is_public", true)
    .eq("is_live", true)
    .eq("moderation_status", "approved")
    .eq("is_nsfw", false) as unknown as Q;
}

/** Strips the filter-only columns off a fetched row, leaving PublicCharacter's shape. */
function toPublicCharacter(row: PublicFilterRow & Record<string, unknown>): PublicCharacter {
  const { active: _a, is_public: _p, is_live: _l, moderation_status: _m, is_nsfw: _n, ...pub } = row;
  return {
    ...pub,
    tags: (pub.tags as string[] | null) ?? [],
    // created_at is nullable at the DB-schema level, but every row reaching
    // this point is an active/public/live character, which always has one
    // set (DB default). Fall back defensively rather than widening the
    // public PublicCharacter#created_at type to string | null for callers.
    created_at: (pub.created_at as string | null) ?? new Date(0).toISOString(),
  } as PublicCharacter;
}

export async function getPublicCharacter(
  id: string
): Promise<PublicCharacter | null> {
  const { data, error } = await supabaseAdmin
    .from("characters")
    .select(`${PUBLIC_CHAR_SELECT},${PUBLIC_FILTER_COLUMNS}`)
    .eq("id", id)
    .maybeSingle();

  if (error || !data || !isPublicRow(data)) return null;

  return toPublicCharacter(data);
}

/**
 * Used by generateStaticParams (build-time) and sitemap.ts. Capped —
 * these are the same two data-driven, no-second-file-to-remember
 * conventions sitemap.ts/robots.ts already use for LANDING_PAGES, applied
 * to a set that's an order of magnitude bigger and actually changes daily,
 * so an unbounded fetch here is the wrong default. 5,000 keeps the sitemap
 * (and the build-time static-param list) well under Google's 50k-URL/file
 * sitemap limit even after future landing/other-route entries are added,
 * while still covering the platform's realistic public-character count.
 */
const MAX_PUBLIC_CHARACTER_IDS = 5000;

export async function getPublicCharacterIds(): Promise<string[]> {
  const { data, error } = await applyPublicListFilters(
    supabaseAdmin.from("characters").select("id")
  )
    .order("created_at", { ascending: false })
    .limit(MAX_PUBLIC_CHARACTER_IDS);

  if (error || !data) return [];
  return data.map((row) => row.id as string);
}

/**
 * Used by the pre-signup onboarding flow's character-reveal step
 * (/api/public/onboarding-characters) to pick a companion for an
 * anonymous visitor. Same exact filter set as getPublicCharacterIds —
 * this is not a new, separately-maintained notion of "public" — just
 * returning the fields needed to score a match (tags/archetype) instead
 * of bare ids. Capped small: this feeds a client-side pick from a
 * shortlist, not a paginated browse surface (that's /discover).
 */
const ONBOARDING_POOL_LIMIT = 60;

/**
 * ONBOARDING-GENDER-LOCK: the pre-signup "First Chapter" flow's copy and
 * imagery (character-reveal.tsx's "her"/"Meet her", choose-your-opening.tsx's
 * "She sits beside you.") is written exclusively for a female companion —
 * it was never a neutral flow that happened to usually roll female, so a
 * male/non-binary character surfacing here would be a copy mismatch, not
 * just a personalization miss. Filtered server-side (not left to
 * select-character.ts's client-side scoring) so the shortlist itself is
 * gender-correct before any tag-matching happens.
 *
 * PERF NOTE: paired with a composite index on
 * (gender, is_nsfw, moderation_status, is_public, is_live, active) —
 * see supabase/migrations/20270111_onboarding_gender_filter_index.sql —
 * so this added .eq("gender", ...) is an index-covered filter rather than
 * a sequential scan on top of the existing five-clause filter.
 */
const ONBOARDING_GENDER = "female";

export async function getPublicCharacters(
  limit: number = ONBOARDING_POOL_LIMIT,
  gender?: string
): Promise<PublicCharacter[]> {
  let query = applyPublicListFilters(
    supabaseAdmin.from("characters").select(`${PUBLIC_CHAR_SELECT},${PUBLIC_FILTER_COLUMNS}`)
  );

  if (gender) {
    query = query.eq("gender", gender);
  }

  const { data, error } = await query
    .order("like_count", { ascending: false })
    .limit(Math.min(limit, ONBOARDING_POOL_LIMIT));

  if (error || !data) return [];

  return data.map(toPublicCharacter);
}

/**
 * Onboarding-specific wrapper around getPublicCharacters() — see
 * ONBOARDING-GENDER-LOCK above for why the "First Chapter" flow's pool is
 * locked to female characters rather than left open like the general
 * public-character surfaces (getPublicCharacter/getPublicCharacterIds).
 */
export async function getOnboardingCharacterPool(
  limit: number = ONBOARDING_POOL_LIMIT
): Promise<PublicCharacter[]> {
  return getPublicCharacters(limit, ONBOARDING_GENDER);
}
