/**
 * GET /api/curator/home — the AI curator's cross-app digest: top dating
 * candidates, top "for you" feed posts, and current universe/world state,
 * in one payload.
 *
 * Thin wrapper around curator/curator-engine.ts's getCuratorDigest() —
 * same division of responsibility as /api/recommendations/route.ts: this
 * route resolves auth/tier/NSFW-access/mood/gender the same way that route
 * already does (identical derivation, intentionally not re-invented), and
 * the engine module stays free of request/response concerns.
 *
 * Works for logged-out visitors too, same fallback contract as
 * /api/recommendations and /api/feed: userId='' + tier='free' degrades
 * dating to the popularity-weighted fallback and feed to its own
 * logged-out behavior, rather than erroring.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { getCuratorDigest } from '@/lib/curator/curator-engine';
import { isUserMood } from '@/lib/recommendations/engine';
import { normalizeTier, type Tier } from '@/lib/rate-limit';
import { resolveNsfwDiscoveryAccess } from '@/lib/access/character-gate';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuthedUser();
    const { searchParams } = new URL(req.url);

    const rawMood = searchParams.get('mood');
    const mood = isUserMood(rawMood) ? rawMood : null;

    const rawGender = searchParams.get('gender');
    const genderFilter: 'male' | 'female' | 'non_binary' | null =
      rawGender === 'male' || rawGender === 'female' || rawGender === 'non_binary' ? rawGender : null;

    let userId = '';
    let tier: Tier = 'free';
    let allowNsfw = false;

    if (user) {
      userId = user.id;
      const [{ data: profile }, nsfwAllowed] = await Promise.all([
        supabase.from('profiles').select('tier').eq('id', userId).single(),
        resolveNsfwDiscoveryAccess(userId),
      ]);
      tier = normalizeTier((profile?.tier as string) ?? 'free');
      allowNsfw = nsfwAllowed;
    }

    const digest = await getCuratorDigest(userId, tier, { mood, allowNsfw, genderFilter });

    return NextResponse.json(digest, {
      headers: {
        // Same reasoning as /api/recommendations: varies per-user
        // (NSFW gating depends on auth + age-verification + preference
        // state), so this must stay private, never shared/public.
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    logger.error('curator:home-route-error', { error: String(error) });
    return NextResponse.json(
      { dating: { topCandidates: [] }, feed: { topPosts: [] }, universe: { overview: null } },
      { status: 200 }
    );
  }
}
