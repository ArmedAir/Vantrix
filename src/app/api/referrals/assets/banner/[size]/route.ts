import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { renderBanner, BANNER_SIZES, type BannerSize } from '@/lib/referral-assets';
import { resolvePartnerByCodeOrSlug } from '@/lib/referral-engine';

/**
 * GET /api/referrals/assets/banner/[size]?code=PARTNERCODE
 *
 * Returns an SVG banner image, ready to drop straight into an <img> tag
 * on a dev's site — e.g.:
 *   <img src="https://vantrix.ink/api/referrals/assets/banner/728x90?code=MIRA20" />
 *
 * The banner itself is just a picture — it doesn't carry the click
 * attribution. Pair it with an <a> tag pointing at /r/<code> (see the
 * copy-paste embed snippets on /referrals/assets) so the click, not the
 * image request, is what gets tracked.
 *
 * Validates the code against a real, active partner so a banner can't be
 * generated for a made-up or suspended code — keeps this from being an
 * open image-hosting endpoint.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const code = req.nextUrl.searchParams.get('code');

  if (!(size in BANNER_SIZES)) {
    return NextResponse.json({ error: `Unknown size "${size}". Valid sizes: ${Object.keys(BANNER_SIZES).join(', ')}` }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: 'Missing ?code=<your referral code>' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  // FIX: see referral-engine.ts's resolvePartnerByCodeOrSlug docstring —
  // this used to look `code` up against the `code` column only, so a
  // partner's embed banner 404'd whenever they'd built the snippet
  // around their vanity slug instead of their raw code.
  const partner = await resolvePartnerByCodeOrSlug(supabase, code, 'id,status') as
    | { id: string; status: string }
    | null;

  if (!partner || partner.status !== 'active') {
    return NextResponse.json({ error: 'Unknown or inactive referral code' }, { status: 404 });
  }

  const svg = renderBanner(size as BannerSize);

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      // Cacheable — the banner content doesn't change per-request, only per code+size.
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
