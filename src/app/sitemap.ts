import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/utils";
import { getLandingPageSlugs } from "@/lib/seo/landing-pages";
import { getPublicCharacterIds } from "@/lib/seo/public-character";
import { getPublicLocationSlugs } from "@/lib/seo/public-location";
import { getPublicTagSlugs } from "@/lib/seo/public-tag";
import { getBlogSlugs } from "@/lib/blog/posts";

/**
 * ROUTING-FIX: /discover, /about, /careers, /blog, /support, /terms, and
 * /privacy are now real public pages (previously only /login was — see
 * robots.ts for the fuller history of that gap). forgot-password/
 * reset-password stay excluded, same reasoning as before: they're only
 * ever reached via an emailed link with a token, never a page anyone
 * should land on from a search result.
 *
 * 0.3.1/14.1/14.2 FIX: "/" is now the real public homepage — the top of
 * the acquisition funnel — rather than an unconditional /login redirect
 * (see (app)/layout.tsx's 0.3.1 FIX comment), so it belongs here at the
 * top with the highest priority. The programmatic SEO landing pages
 * (LANDING_PAGES, rendered by app/(seo)/[landing]/page.tsx) are pulled
 * in via getLandingPageSlugs() rather than hand-listed, so a new entry
 * added to that config is automatically included here — the same
 * data-driven approach robots.ts now uses for the same list.
 *
 * TAGS FIX: /tags/[tag] (the new public tag-browse pages — see
 * (seo)/tags/[tag]/page.tsx + lib/seo/public-tag.ts) is pulled in the
 * same data-driven way as characterIds/locationSlugs below, via
 * getPublicTagSlugs() (already capped at 500 there, well under the
 * per-file sitemap limit even combined with every other entry here).
 *
 * §2.5 FIX: /companions/[id] (the new public, crawlable character pages —
 * see src/app/(seo)/companions/[id]/page.tsx) is pulled in the same
 * data-driven way as the landing-page slugs above, via
 * getPublicCharacterIds() (already capped at 5,000 there — see that
 * file's own comment on why — well under Google's 50k-URL/file sitemap
 * limit even combined with every other entry here). Async because that
 * fetch is a real DB round-trip; Next's sitemap() export supports an
 * async function the same as any other route-metadata file.
 */
// WWW-CANONICAL-STALENESS-FIX: sitemap.ts had no `dynamic`/`revalidate`
// export, so Next.js statically generates it once at build time and Vercel
// can reuse that cached output across later deployments whose other routes
// changed but this one's tracked inputs didn't appear to. Every <loc> here
// comes from absoluteUrl(), which reads NEXT_PUBLIC_APP_URL — the exact same
// source every page's own <link rel="canonical"> tag uses (generateSEOMeta
// in lib/seo/meta.ts). Since real crawls showed canonical tags correctly
// resolving to https://www.vantrix.ink while the sitemap's own entries
// still pointed at the non-www https://vantrix.ink (which then 301s to
// www), the two could only have diverged by reading that inlined value from
// two different builds — i.e. a stale cached sitemap output surviving past
// the point NEXT_PUBLIC_APP_URL was corrected. Forcing this route dynamic
// makes it evaluate fresh on every request, so it can never again lag
// behind the live env value the way a statically-cached build artifact can.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [characterIds, locationSlugs, tagSlugs] = await Promise.all([
    getPublicCharacterIds(),
    getPublicLocationSlugs(),
    getPublicTagSlugs(),
  ]);
  return [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    ...getLandingPageSlugs().map((slug) => ({
      url: absoluteUrl(`/${slug}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    {
      url: absoluteUrl("/login"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // PRICING-PUBLIC FIX: /premium is now a public pricing page (see
    // robots.ts's own PRICING-PUBLIC FIX) — high priority since it's a
    // direct-conversion page, same tier as /discover.
    {
      url: absoluteUrl("/premium"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    // RAAS-PUBLIC FIX: /relationships is a public explainer page for the
    // Spark/Bond/Soulbound tiers (see (app)/relationships/page.tsx) —
    // same tier as /premium, the other direct-conversion pricing page.
    {
      url: absoluteUrl("/relationships"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/discover"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/about"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: absoluteUrl("/careers"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/blog"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.3,
    },
    ...getBlogSlugs().map((slug) => ({
      url: absoluteUrl(`/blog/${slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    {
      url: absoluteUrl("/support"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: absoluteUrl("/press"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/terms"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: absoluteUrl("/privacy"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    ...characterIds.map((id) => ({
      url: absoluteUrl(`/companions/${id}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    // SEO-LOCATIONS FIX: public /locations/[slug] pages (see
    // (seo)/locations/[slug]/page.tsx + lib/seo/public-location.ts) —
    // same data-driven pattern as characterIds above.
    ...locationSlugs.map((slug) => ({
      url: absoluteUrl(`/locations/${slug}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.55,
    })),
    // TAGS FIX: public /tags/[tag] browse pages — same data-driven
    // pattern as characterIds/locationSlugs above.
    ...tagSlugs.map((slug) => ({
      url: absoluteUrl(`/tags/${slug}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
