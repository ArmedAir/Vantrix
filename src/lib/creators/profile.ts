import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveNsfwDiscoveryAccess } from "@/lib/access/character-gate";

/**
 * CREATORS-ROUTES FIX: backs the new /creators/[id] public creator
 * profile page. Until now this app had no standalone public
 * creator-profile route at all (see creators-you-follow.tsx's own
 * FOLLOW-LINK-FIX comment) — the homepage rail could only link to a
 * character the viewer happened to follow that creator through, and its
 * "See all" link pointed at /studio, the owner-only Creator Studio.
 *
 * profiles has no public-read RLS policy (only "profiles_own" and
 * "profiles_admin_read"), so the profile row itself is read via
 * supabaseAdmin, same service-role-plus-explicit-scope pattern
 * lib/creators/followed.ts and community/posts/route.ts already use to
 * show another user's username/avatar to any viewer — only the specific
 * public-safe columns below are selected, never the full row.
 */

export interface CreatorProfile {
  id: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

export interface CreatorCharacterSummary {
  id: string;
  name: string;
  image_url: string | null;
  tags: string[];
  gender: string | null;
  archetype: string | null;
  is_premium: boolean;
  is_new: boolean;
  is_nsfw: boolean;
  like_count: number;
  follower_count: number;
}

/**
 * Returns null for any id that isn't a genuine creator — i.e. has no
 * public, active character to their name — rather than exposing an
 * arbitrary account's username/bio to anyone who can guess a profile id.
 * This is a privacy boundary, not just a "nothing to show" convenience:
 * profiles.bio can hold real personal text, and every other reader of
 * this table (creators-followed, community posts) is scoped to a
 * specific relationship (a follow, a post) rather than a bare id lookup.
 */
// PERF: creators/[id]/page.tsx calls getCreatorProfile(id) once in
// generateMetadata() and once in the page body — two Supabase round-trips
// (a count query plus a profile lookup, so four queries total) for one
// page load without cache(). This function reads through supabaseAdmin
// with no per-request/user context, so memoizing it for the life of one
// request/render is safe — it never leaks across requests or users.
export const getCreatorProfile = cache(async function getCreatorProfile(
  id: string
): Promise<CreatorProfile | null> {
  const { count } = await supabaseAdmin
    .from("characters")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", id)
    .eq("active", true)
    .eq("is_public", true);

  if (!count) return null;

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    handle: data.username ?? data.display_name ?? "creator",
    displayName: data.display_name ?? null,
    avatarUrl: data.avatar_url ?? null,
    bio: data.bio ?? null,
  };
});

const CHAR_SELECT =
  "id,name,image_url,tags,gender,archetype,is_premium,is_new,is_nsfw,like_count,follower_count";

/**
 * A creator's public character catalog — same visibility rules (active,
 * is_public, NSFW-gated) every other discovery surface applies, via the
 * RLS-respecting client rather than supabaseAdmin (unlike the profile
 * lookup above, character rows already have public-read RLS for
 * active+public rows, same as /api/characters).
 */
export async function getCreatorCharacters(
  creatorId: string,
  viewerId: string | null
): Promise<CreatorCharacterSummary[]> {
  const supabase = await createClient();

  let query = supabase
    .from("characters")
    .select(CHAR_SELECT)
    .eq("creator_id", creatorId)
    .eq("active", true)
    .eq("is_public", true)
    .order("follower_count", { ascending: false });

  const nsfwEnabled = await resolveNsfwDiscoveryAccess(viewerId);
  if (!nsfwEnabled) {
    query = query.eq("is_nsfw", false);
  }

  const { data } = await query;
  return (data ?? []) as CreatorCharacterSummary[];
}
