import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PublicCharacter } from "@/lib/seo/public-character";

/**
 * public_tag_counts (supabase/migrations/20270114_public_tag_counts.sql)
 * is a brand-new RPC — the generated Database type in @/types/supabase
 * won't know about it until `supabase gen types` is re-run after the
 * migration is applied, so the real generated client type can't resolve
 * this call. Same cast-to-narrow-shape pattern as safe-rpc.ts /
 * trending.ts / character-embeddings.ts for exactly this situation
 * (dynamic/not-yet-generated RPC name) rather than widening to `any`.
 * Safe to remove this local type and call supabaseAdmin.rpc(...) directly
 * once types are regenerated — the runtime call is identical either way.
 */
type RpcCapable = {
  rpc(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ data: unknown; error: unknown }>;
};

/**
 * Public, crawlable per-tag browse pages (/tags/[tag]).
 *
 * `characters.tags` is a text[] column already populated for the
 * discover grid and already fed into generateCharacterSchema()'s
 * `keywords` field (see structured.ts) — but until now nothing exposed
 * an indexable page *per tag*. This mirrors public-character.ts's
 * five-clause "what counts as public" filter exactly (active,
 * is_public, is_live, moderation_status = 'approved', is_nsfw = false)
 * for the same reason: an anonymous crawler must never see a tag page
 * that surfaces NSFW-gated content, and RLS alone can't be trusted to
 * enforce that (see that file's own header comment).
 *
 * Tag slugs are the tag text itself, lowercased and hyphenated
 * (slugifyTag below) rather than a separate `tags` table with its own
 * ids — tags here are free-text labels applied at character-creation
 * time, not a fixed taxonomy, so a lookup table would just be another
 * thing to keep in sync. Both public_tag_counts() and
 * public_characters_by_tag() group/match on lower(btrim(tag)) in
 * Postgres, so "Tsundere" and "tsundere" always collapse to the same
 * page and the same character set — counting and fetching can never
 * disagree about which characters belong to a tag. The RPC returns the
 * lowercased canonical form; toTagLabel() below derives a display
 * label by title-casing it rather than trying to preserve any one
 * character's original casing as "the" label for a shared tag.
 */

export interface PublicTag {
  slug: string;
  /** Lowercased, trimmed canonical form returned by the RPC — the exact
   *  value public_characters_by_tag() matches against. Kept alongside
   *  `label` so callers never need to reverse-derive it from the
   *  slug or the title-cased display label (lossy for punctuation,
   *  e.g. "sci-fi" vs "sci fi"). */
  canonical: string;
  label: string;
  count: number;
}

/**
 * Capped at 500 distinct tags — an order of magnitude more than any
 * realistic free-text tag vocabulary produces, and it bounds the
 * sitemap contribution (same reasoning as MAX_PUBLIC_CHARACTER_IDS in
 * public-character.ts) even if tag text is never curated. Only tags
 * that appear on at least MIN_TAG_COUNT public characters get a page —
 * a tag used by one character isn't worth an indexable URL and would
 * just read as thin/duplicate content to a crawler.
 */
const MAX_PUBLIC_TAGS = 500;
const MIN_TAG_COUNT = 3;

export function slugifyTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Title-cases a lowercased canonical tag ("slow burn" -> "Slow Burn") for display. */
function toTagLabel(lowerTag: string): string {
  return lowerTag
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Aggregates tag → count across every public character via a single
 * RPC (see supabase/migrations for public_tag_counts) rather than
 * pulling every character row into Node and reducing client-side —
 * this runs on every sitemap build and every /tags index-page request,
 * so pushing the unnest/group-by into Postgres is worth the one-time
 * migration cost. Falls back to [] on any error so a broken RPC never
 * takes down the sitemap or robots build.
 */
export async function getPublicTags(): Promise<PublicTag[]> {
  const { data, error } = await (supabaseAdmin as unknown as RpcCapable).rpc(
    "public_tag_counts",
    { min_count: MIN_TAG_COUNT, max_tags: MAX_PUBLIC_TAGS }
  );
  if (error || !data) return [];

  return (data as { tag: string; count: number }[])
    .map((row) => ({
      slug: slugifyTag(row.tag),
      canonical: row.tag,
      label: toTagLabel(row.tag),
      count: row.count,
    }))
    .filter((t) => t.slug.length > 0);
}

export async function getPublicTagSlugs(): Promise<string[]> {
  const tags = await getPublicTags();
  return tags.map((t) => t.slug);
}

/**
 * Characters shown on a given tag's page. Delegates the actual
 * character-matching to public_characters_by_tag() (same migration as
 * public_tag_counts()) rather than a client-side `.contains` on the
 * tags array — a `.contains` lookup would need the tag's exact
 * original casing, but slugs are derived from the lowercased canonical
 * form (see slugifyTag/toTagLabel above), so counting and fetching
 * must share one case-insensitive matching rule or they can silently
 * disagree about which characters belong to a tag. The RPC already
 * applies the same five-clause public filter as every other crawlable
 * character surface (see public-character.ts).
 */
export async function getCharactersByTag(
  slug: string,
  limit = 60
): Promise<{ label: string; characters: PublicCharacter[] } | null> {
  const tags = await getPublicTags();
  const match = tags.find((t) => t.slug === slug);
  if (!match) return null;

  const { data, error } = await (
    supabaseAdmin as unknown as RpcCapable
  ).rpc("public_characters_by_tag", { p_tag: match.canonical, p_limit: limit });

  if (error || !data) return { label: match.label, characters: [] };

  const characters = (data as Record<string, unknown>[]).map((row) => ({
    ...row,
    tags: (row.tags as string[] | null) ?? [],
    created_at: (row.created_at as string | null) ?? new Date(0).toISOString(),
  })) as PublicCharacter[];

  return { label: match.label, characters };
}
