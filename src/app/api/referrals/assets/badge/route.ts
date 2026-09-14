import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { renderQlinkBadge } from '@/lib/referral-assets';
import { resolvePartnerByCodeOrSlug } from '@/lib/referral-engine';
import { withErrorHandling } from '@/lib/api/with-error-handling';

/**
 * GET /api/referrals/assets/badge?code=PARTNERCODE&size=120
 *
 * Circular "Qlink" badge — a small round partner pin, meant for a sidebar,
 * footer, or next to a bio. Same validation and caching approach as the
 * banner route.
 *
 * RELIABILITY FIX (2026-09-14): this is embedded as an <img> on partner
 * sites we don't control — it had no try/catch and wasn't wired into the
 * shared withErrorHandling boundary (see that file's header: 245/248
 * other routes already are). Any unhandled throw here — a Supabase env
 * misconfig, resolvePartnerByCodeOrSlug hitting a real DB error instead
 * of returning null, renderQlinkBadge throwing — returned Next's default
 * HTML error page instead of a JSON/SVG response, silently breaking the
 * badge on every partner site that has it installed, with no
 * logger.error() call to ever surface it. Wrapped like every other route.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const code = req.nextUrl.searchParams.get('code');
  const sizeParam = req.nextUrl.searchParams.get('size');
  const diameter = Math.min(400, Math.max(48, Number(sizeParam) || 120));

  if (!code) {
    return NextResponse.json({ error: 'Missing ?code=<your referral code>' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  // FIX: see referral-engine.ts's resolvePartnerByCodeOrSlug docstring —
  // this used to look `code` up against the `code` column only, so a
  // partner's embed badge 404'd whenever they'd built the snippet around
  // their vanity slug instead of their raw code.
  const partner = await resolvePartnerByCodeOrSlug(supabase, code, 'id,status,class') as
    | { id: string; status: string; class: string }
    | null;

  if (!partner || partner.status !== 'active') {
    return NextResponse.json({ error: 'Unknown or inactive referral code' }, { status: 404 });
  }

  const label = partner.class === 'influencer' ? 'Vantrix Creator' : partner.class === 'dev' ? 'Vantrix Dev Partner' : 'Vantrix Partner';
  const svg = renderQlinkBadge({ diameter, label });

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}, 'referrals/assets/badge');
