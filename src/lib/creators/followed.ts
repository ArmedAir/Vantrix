import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * CREATORS-ROUTES FIX: extracted from GET /api/user/creators-followed's
 * handler so the same real, DB-backed grouping logic can be called
 * in-process from a Server Component page (see (app)/creators/following)
 * without a self-fetch HTTP round trip back into this same Next.js
 * process — the exact pattern (app)/dating/page.tsx's own ROOT-CAUSE FIX
 * comment already documents as a real source of production 404s
 * (lib/dating/get-world-home.ts). The API route below now just calls
 * this and stays a thin HTTP wrapper for any client-side/external caller;
 * the page calls it directly.
 *
 * Follows are per-character, not per-creator, so this groups a user's
 * followed characters by their characters.creator_id and returns one row
 * per distinct creator (most-recently-followed character first).
 * Characters with no creator_id — platform-seeded launch characters, not
 * authored by any user — are skipped, since there's no creator profile to
 * show for them.
 *
 * profiles has no public-read RLS policy — only "profiles_own" and
 * "profiles_admin_read" — so reading a *different* user's
 * username/avatar_url goes through supabaseAdmin, the same
 * service-role-plus-explicit-scope pattern the rest of this file's
 * callers use. The character_follows lookup itself is explicitly scoped
 * to the passed-in userId, so this can never return another user's follow
 * list.
 */

export interface FollowedCreator {
  id: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  /** The most-recently-followed character that surfaced this creator —
   *  used by the homepage rail's fallback avatar and as a "you followed
   *  them through ___" link before a real creator profile page existed.
   *  Kept for that caller; the creator profile page itself
   *  ((app)/creators/[id]) is now the real destination for a creator's
   *  own info. */
  characterId: string;
}

// Over-fetch follows since several often share one creator.
const FOLLOWS_LOOKBACK = 200;
// Default cap for the homepage rail (a horizontal-scroll strip, not a
// full list) — callers that want the complete list (the /creators/following
// page) pass a higher explicit max.
const DEFAULT_MAX_CREATORS = 12;

interface FollowRow {
  character_id: string;
  created_at: string;
}

interface CharacterRow {
  id: string;
  name: string;
  image_url: string | null;
  creator_id: string | null;
}

interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export async function fetchFollowedCreators(
  userId: string,
  opts: { max?: number } = {}
): Promise<FollowedCreator[]> {
  const max = opts.max ?? DEFAULT_MAX_CREATORS;

  try {
    const { data: follows, error: followsError } = await supabaseAdmin
      .from("character_follows")
      .select("character_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(FOLLOWS_LOOKBACK);

    if (followsError) throw followsError;

    const followRows = (follows ?? []) as FollowRow[];
    if (followRows.length === 0) return [];

    const characterIds = followRows.map((f) => f.character_id);
    const { data: characters, error: charactersError } = await supabaseAdmin
      .from("characters")
      .select("id, name, image_url, creator_id")
      .in("id", characterIds);

    if (charactersError) throw charactersError;

    const charactersById = new Map(
      ((characters ?? []) as CharacterRow[]).map((c) => [c.id, c])
    );

    const creatorIds = Array.from(
      new Set(
        ((characters ?? []) as CharacterRow[])
          .map((c) => c.creator_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (creatorIds.length === 0) return [];

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio")
      .in("id", creatorIds);

    if (profilesError) throw profilesError;

    const profilesById = new Map(
      ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p])
    );

    // Walk follows in recency order, keep the first (= most recently
    // followed) character per distinct creator; skip characters with no
    // creator or no resolvable profile (e.g. a deleted account).
    const seenCreators = new Set<string>();
    const creators: FollowedCreator[] = [];

    for (const follow of followRows) {
      const character = charactersById.get(follow.character_id);
      if (!character?.creator_id) continue;
      if (seenCreators.has(character.creator_id)) continue;

      const profile = profilesById.get(character.creator_id);
      if (!profile) continue;

      seenCreators.add(character.creator_id);
      creators.push({
        id: profile.id,
        handle: profile.username ?? profile.display_name ?? "creator",
        avatar_url: profile.avatar_url ?? character.image_url ?? null,
        bio: profile.bio ?? null,
        characterId: character.id,
      });

      if (creators.length >= max) break;
    }

    return creators;
  } catch (err) {
    logger.error("fetchFollowedCreators error", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Fail soft — every caller (homepage rail, following page) already
    // degrades gracefully to an empty list.
    return [];
  }
}
