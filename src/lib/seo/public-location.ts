import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * SEO-LOCATIONS FIX (2026-09-08): world_locations has no is_public/
 * moderation gate the way `characters` does (see public-character.ts's
 * own comment on that column) — every location in the world atlas is
 * platform-authored, not user-submitted, so there's nothing to approve
 * or hide. That means these pages can be a straight, lean read: no
 * live simulation state (governance/economy/crisis/weather — see
 * getLocationBySlug in lib/universe/world-atlas.ts for that full,
 * fast-changing payload, which is exactly why this file does NOT reuse
 * it), just the stable descriptive fields a search result snippet or an
 * LLM citation would actually want: name, archetype, culture,
 * population, description, and a handful of real resident characters
 * for internal linking into /companions/[id].
 */

export interface PublicLocation {
  id: string;
  name: string;
  slug: string;
  archetype: string | null;
  description: string | null;
  culture: string | null;
  population: number | null;
  is_capital: boolean;
  seal_motto: string | null;
  image_url: string | null;
  residents: { id: string; name: string; image_url: string | null }[];
}

const LOCATION_SELECT =
  "id,name,slug,archetype,description,culture,population,is_capital,seal_motto,image_url";

/**
 * Capped at 2,000 — comfortably covers the world atlas today with
 * headroom, well under the sitemap file's 50k-URL limit, same
 * reasoning as getPublicCharacterIds()'s own cap.
 */
export async function getPublicLocationSlugs(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("world_locations")
    .select("slug")
    .limit(2000);
  if (error || !data) return [];
  return data.map((row) => row.slug as string).filter(Boolean);
}

// PERF: this page's generateMetadata() and page body both call
// getPublicLocation() with the same slug. Because this is a plain
// Supabase call (not fetch()), Next's automatic per-request request
// memoization never applies to it — without cache(), that's two full
// round-trips to Supabase for one page load. React's cache() memoizes by
// arguments for the lifetime of a single request/render, so the second
// call is free, and the cache never leaks across requests.
export const getPublicLocation = cache(async function getPublicLocation(slug: string): Promise<PublicLocation | null> {
  const { data: location, error } = await supabaseAdmin
    .from("world_locations")
    .select(LOCATION_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error || !location) return null;

  // Same public-character filter set as public-character.ts — a
  // resident listed on a crawlable page must itself be a character an
  // anonymous visitor is actually allowed to see.
  const { data: occupations } = await supabaseAdmin
    .from("companion_occupations")
    .select(
      "character:characters!inner( id, name, image_url, active, is_public, is_live, moderation_status, is_nsfw )"
    )
    .eq("location_id", location.id)
    .eq("character.active", true)
    .eq("character.is_public", true)
    .eq("character.is_live", true)
    .eq("character.moderation_status", "approved")
    .eq("character.is_nsfw", false)
    .limit(12);

  const residents = (occupations ?? [])
    .map((row) => row.character as unknown as { id: string; name: string; image_url: string | null } | null)
    .filter((c): c is { id: string; name: string; image_url: string | null } => Boolean(c));

  return { ...(location as Omit<PublicLocation, "residents">), residents };
});
