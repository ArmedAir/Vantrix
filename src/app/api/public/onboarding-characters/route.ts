/**
 * GET /api/public/onboarding-characters
 *
 * Feeds the "Character Reveal" step of the pre-signup onboarding flow
 * (see components/onboarding/*). Anonymous-reachable by design — this
 * runs before signup, so there's no session to gate on. Returns the same
 * safety-filtered public/non-NSFW character subset getPublicCharacter()
 * and getPublicCharacterIds() already use (see lib/seo/public-character.ts's
 * own docstring on why that filter is applied explicitly here rather than
 * relied on via RLS alone).
 *
 * The actual "which character matches this visitor's onboarding choices"
 * scoring happens client-side (lib/onboarding/select-character.ts) against
 * this shortlist — kept client-side deliberately: it's a shallow tag/
 * archetype match against a few dozen rows, not worth a new server-side
 * scoring endpoint, and it keeps this route a plain, cacheable read.
 */
import { NextResponse } from "next/server";
import { getPublicCharacters } from "@/lib/seo/public-character";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET() {
  const characters = await getPublicCharacters();
  return NextResponse.json(
    { characters },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
  );
}
