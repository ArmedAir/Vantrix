import "server-only";
import { fetchInternal } from "./api";

/**
 * §11: characters/mine, characters/market -> Studio (creation/training).
 * Both routes do real shaping (ownership-scoped select, leaderboard
 * ranking/filtering) rather than a thin passthrough, so per §10 these go
 * through fetchInternal rather than a direct query.
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

export async function getMyCharacters(): Promise<MyCharacter[] | null> {
  try {
    const body = await fetchInternal<{ characters: MyCharacter[] }>(
      "/api/characters/mine"
    );
    return body.characters ?? [];
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
