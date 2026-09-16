import "server-only";
import { fetchInternal } from "./api";
import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * §11: characters/mine, characters/market -> Studio (creation/training).
 * Both routes do real shaping (ownership-scoped select, leaderboard
 * ranking/filtering) rather than a thin passthrough, so per §10 these go
 * through fetchInternal rather than a direct query.
 *
 * SELF-FETCH-RACE-FIX (this revision): getMyCharacters() below is the one
 * exception — see its own comment. getMarketLeaderboard() is unauthenticated
 * and unaffected, so it's left on the standard fetchInternal path.
 */
export interface MyCharacter {
  id: string;
  name: string;
  image_url: string | null;
  category: string;
  active: boolean;
  is_public: boolean;
  dating_enabled: boolean;
  moderation_status: string;
  moderation_note: string | null;
  created_at: string;
}

export interface MarketCharacter {
  character_id: string;
  name: string;
  image_url: string | null;
  value_score: number;
  percentile: number;
  rarity_tier: string;
  computed_at: string;
}

/**
 * ROOT CAUSE of "Couldn't load your characters right now" (the null/error
 * state below, as distinct from a genuine zero-characters empty state —
 * see MYCHARACTERS-ERROR-VISIBILITY below): this used to call
 * `/api/characters/mine` through fetchInternal, i.e. a real outbound HTTP
 * self-fetch from this Server Component back into the app's own edge
 * middleware.
 *
 * studio/page.tsx fires this alongside getMarketLeaderboard() via
 * Promise.all — so on every /studio load there are *three* concurrent
 * requests independently re-entering middleware.ts at effectively the same
 * instant: the original /studio navigation itself, this self-fetch, and
 * the market self-fetch. middleware.ts unconditionally calls
 * `supabase.auth.getSession()`/`getUser()` on every one of them (see
 * `sessionPromise` there) to refresh the session — and when the access
 * token is at/near expiry, Supabase's refresh-token rotation only lets ONE
 * concurrent refresh using a given refresh token succeed; any other
 * request racing it with the same (now-just-rotated) token comes back
 * invalid for THAT request only. That's a real, if narrow, window — enough
 * to intermittently 401 exactly one of these three, nondeterministically.
 * Confirmed live: production logs show GET /api/characters/mine 401 and
 * GET /api/characters/market 200 at the identical timestamp, twice, from
 * the same Promise.all pair — a smoking gun for a same-instant race, not a
 * real auth failure (this account's session was valid throughout; every
 * other route succeeded around it).
 *
 * This is the same underlying anti-pattern — a Server Component
 * self-fetching its own API route — behind the two previously-fixed
 * "Couldn't load your characters" incidents (Vercel SSO-protection
 * self-fetch, PWA auth-cookie-key self-fetch): three different failure
 * modes, one root cause. Fixed here by removing the self-fetch entirely
 * for this call: query the same data directly with the already-request-
 * scoped getAuthedUser() (cached per-request, see that file) and
 * supabaseAdmin, exactly what /api/characters/mine/route.ts itself does —
 * no extra HTTP round trip, no second middleware pass, nothing left to
 * race against the page's own request. /api/characters/mine stays in
 * place unchanged for any external/client caller that still needs it.
 */
export async function getMyCharacters(): Promise<MyCharacter[] | null> {
  try {
    const { user } = await getAuthedUser();
    if (!user) return null;

    const { data, error } = await supabaseAdmin
      .from('characters')
      .select('id,name,image_url,category,active,is_public,dating_enabled,moderation_status,moderation_note,created_at')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data ?? [];
  } catch {
    // MYCHARACTERS-ERROR-VISIBILITY: this used to return [] on any
    // fetch failure (401 from a stale/missing session, a transient 500,
    // etc.) — identical to "you genuinely have zero characters", so a
    // real creator with real characters could see the empty "You
    // haven't created a companion yet" state with no way to tell it
    // apart from an actual error. null is a distinct third state the
    // page can render differently; see studio/page.tsx.
    return null;
  }
}

export async function getMarketLeaderboard(): Promise<MarketCharacter[]> {
  try {
    const body = await fetchInternal<{ characters: MarketCharacter[] }>(
      "/api/characters/market?limit=30"
    );
    return body.characters ?? [];
  } catch {
    return [];
  }
}
