import type { Metadata } from "next";
import Link from "next/link";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  getPublicLocation,
  getPublicLocationSlugs,
} from "@/lib/seo/public-location";
import { generateLocationSchema, safeJsonLd } from "@/lib/seo/structured";
import { resolveImageSrc, absoluteUrl, WORLD_IMAGE_FALLBACK } from "@/lib/utils";
import { PublicHeader } from "@/components/public/public-header";
import { Footer } from "@/components/home/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * SEO-LOCATIONS FIX (2026-09-08): public, crawlable version of the
 * world atlas's location pages. Mirrors (seo)/companions/[id]/page.tsx
 * exactly (static params + metadata + JSON-LD via safeJsonLd,
 * PublicHeader/Footer shell) — same established pattern this codebase
 * already uses for every other indexable route.
 *
 * The in-app version at /world/locations/[slug] (see that page's own
 * file) stays behind auth and keeps rendering the full live-simulation
 * payload (governance, economy, crisis, weather, diplomacy) — none of
 * that belongs on a page a crawler or a signed-out visitor hits, both
 * because it's fast-changing (bad for a cached search snippet) and
 * because it's gated content. Route is /locations/[slug], not
 * /world/locations/[slug], for the same reason /companions/[id] isn't
 * /characters/[id]: Next can't resolve two page.tsx files to one path
 * even across route groups, so the indexable surface needs a distinct
 * path from the authenticated one.
 */
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  const slugs = await getPublicLocationSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const location = await getPublicLocation(slug);
  if (!location) return {};

  const url = absoluteUrl(`/locations/${location.slug}`);
  const title = `${location.name} — A Vantrix World Location | Vantrix`;
  const description =
    location.description?.slice(0, 155) ??
    `Explore ${location.name}, a living location in the Vantrix universe, and meet the AI companions who call it home.`;
  const image = resolveImageSrc(location.image_url, WORLD_IMAGE_FALLBACK);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Vantrix",
      type: "website",
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function PublicLocationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [location, nonce] = await Promise.all([
    getPublicLocation(slug),
    (async () => (await headers()).get("x-nonce"))(),
  ]);
  if (!location) notFound();

  const schema = generateLocationSchema({
    slug: location.slug,
    name: location.name,
    description: location.description,
    image_url: resolveImageSrc(location.image_url, WORLD_IMAGE_FALLBACK),
    archetype: location.archetype,
  });

  return (
    <div className="min-h-screen bg-base">
      {/* eslint-disable-next-line @next/next/no-sync-scripts -- static JSON-LD, escaped via safeJsonLd */}
      <script
        type="application/ld+json"
        nonce={nonce ?? undefined}
        dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
      />

      <PublicHeader />

      <section className="px-4 md:px-8 pt-12 pb-16 max-w-4xl mx-auto">
        <div className="relative aspect-[16/7] w-full rounded-lg overflow-hidden border border-border-hairline">
          <Image
            src={resolveImageSrc(location.image_url, WORLD_IMAGE_FALLBACK)}
            alt={location.name}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            priority
            className="object-cover"
          />
          {location.is_capital && (
            <div className="absolute top-3 left-3">
              <Badge>Capital</Badge>
            </div>
          )}
        </div>

        <div className="mt-5">
          <h1 className="font-display text-3xl md:text-4xl text-text-primary">
            {location.name}
          </h1>
          <p className="text-sm text-text-secondary mt-1 capitalize">
            {[location.archetype, location.culture, location.population ? `${location.population.toLocaleString()} residents` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {location.seal_motto && (
            <p className="text-sm text-gold-400 italic mt-2">&ldquo;{location.seal_motto}&rdquo;</p>
          )}
          {location.description && (
            <p className="mt-4 text-[15px] text-text-primary leading-relaxed">
              {location.description}
            </p>
          )}
        </div>

        {location.residents.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-xl text-text-primary mb-4">
              Who you&apos;ll meet in {location.name}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {location.residents.map((r) => (
                <Link
                  key={r.id}
                  href={`/companions/${r.id}`}
                  className="group flex flex-col items-center gap-2 rounded-lg border border-border-hairline p-3 transition-colors ease-premium hover:border-gold-500/40"
                >
                  <div className="relative h-20 w-20 overflow-hidden rounded-full">
                    <Image
                      src={resolveImageSrc(r.image_url)}
                      alt={r.name}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </div>
                  <span className="text-sm font-semibold text-text-primary group-hover:text-gold-400">
                    {r.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="px-4 md:px-8 pb-16 max-w-4xl mx-auto border-t border-border-hairline pt-10 text-center">
        <p className="text-text-secondary text-sm">
          Want to step into {location.name} yourself?
        </p>
        <Button asChild variant="secondary" className="mt-3">
          <Link href={`/login?mode=sign-up&redirect=${encodeURIComponent("/world")}`}>
            Explore the Vantrix world
          </Link>
        </Button>
      </section>

      <Footer />
    </div>
  );
}
