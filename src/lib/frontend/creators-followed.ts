import "server-only";
import { fetchInternal } from "./api";

/**
 * Mirrors GET /api/user/creators-followed's response exactly — see that
 * route's own docstring for why the grouping/auth/RLS logic lives there
 * rather than here (FRONTEND_DIRECTIVE §10: real request-shaping stays in
 * the route, this stays a thin HTTP wrapper, same split home-context.ts
 * already uses).
 *
 * FOLLOW-DATA-FIX: replaces page.tsx's placeholder — `allCharacters.slice(0, 6)`
 * relabeled as fake "creators" — with the user's real followed creators.
 */
export interface FollowedCreator {
  id: string;
  handle: string;
  avatar_url: string | null;
  characterId: string;
}

const EMPTY: FollowedCreator[] = [];

/** Fails soft to an empty list, same contract as getHomeContext(). */
export async function getCreatorsFollowed(): Promise<FollowedCreator[]> {
  try {
    const body = await fetchInternal<{ creators: FollowedCreator[] }>(
      "/api/user/creators-followed"
    );
    return body.creators ?? EMPTY;
  } catch {
    return EMPTY;
  }
}
