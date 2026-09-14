import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { SafeImage as Image } from "@/components/ui/safe-image";
import {
  getCharactersByTag,
  getPublicTagSlugs,
} from "@/lib/seo/public-tag";
import {
  generateBreadcrumbSchema,
  safeJsonLd,
} from "@/lib/seo/structured";
import { resolveImageSrc, absoluteUrl } from "@/lib/utils";
import { PublicHeader } from "@/components/public/public-header";
import { Footer } from "@/components/home/footer";
import { Button } from "@/components/ui/button";

/**
 * /tags/[tag] — public, crawlable tag-browse pages.
 *
 * Mirrors (seo)/companions/[id]/page.tsx and (seo)/locations/[slug]/page.tsx:
 * same static-params + metadata + JSON-LD + PublicHeader/Footer shell,
 * same force-dynamic reasoning (the underlying public-character set
 * changes continuously; this is a long-tail page per tag, not worth
 * ISR complexity), same dynamicParams default (a tag that crosses
 * MIN_TAG_COUNT after the last build is still reachable, not 404'd
 * until the next deploy).
 *
 * This is the missing discovery surface flagged during the SEO/ASO
 * review: character.tags already existed, already fed
 * generateCharacterSchema()'s `keywords` field on individual companion
 * pages, but /discover only ever filtered by gender — there was no
 * page (in-app or indexable) for "show me every companion tagged
 * tsundere / slow-burn / royalty / etc." This closes that gap on both
 * sides at once: it's a real in-app browse surface AND a crawlable,
 * intent-matched URL for the exact long-tail queries people type
 * ("ai girlfriend tsundere", "ai companion slow burn").
 *
 * BreadcrumbList schema (not CollectionPage/ItemList) was chosen over
 * a full ItemList of every character shown, matching this app's
 * existing pattern of using Breadcrumb for hierarchy context on
 * listing-style pages and per-entity schema (Person, via
 * generateCharacterSchema) on the individual companion pages that
 * page links to — avoids describing the same character twice with two
 * different schema shapes on two different pages.
 */
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  const slugs = await getPublicTagSlugs();
  return slugs.map((tag) => ({ tag }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const result = await getCharactersByTag(tag);
  if (!result || result.characters.length === 0) return {};

  const url = absoluteUrl(`/tags/${tag}`);
  const title = `${result.label} AI Companions — Chat Free | Vantrix`;
  const description = `Browse ${result.characters.length}+ ${result.label.toLowerCase()} AI companions on Vantrix. Persistent memory, evolving personalities, free to start chatting.`;

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
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const [result, nonce] = await Promise.all([
    getCharactersByTag(tag),
    (async () => (await headers()).get("x-nonce"))(),
  ]);
  if (!result || result.characters.length === 0) notFound();

  const { label, characters } = result;
  const breadcrumbs = generateBreadcrumbSchema([
    { name: "Discover", path: "/discover" },
    { name: label, path: `/tags/${tag}` },
  ]);

  return (
    <div className="min-h-screen bg-base">
      {/* eslint-disable-next-line @next/next/no-sync-scripts -- static JSON-LD, escaped via safeJsonLd */}
      <script
        type="application/ld+json"
        nonce={nonce ?? undefined}
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbs) }}
      />

      <PublicHeader />

      <section className="px-4 md:px-8 pt-12 pb-8 max-w-5xl mx-auto">
        <p className="text-sm text-text-secondary">
          <Link href="/discover" className="hover:text-text-primary">
            Discover
          </Link>{" "}
          / {label}
        </p>
        <h1 className="mt-2 font-display text-3xl md:text-4xl text-text-primary">
          {label} AI Companions
        </h1>
        <p className="mt-3 text-text-secondary max-w-2xl">
          {characters.length}+ {label.toLowerCase()} companions with
          persistent memory — they remember your conversations and evolve
          over time, not a chatbot that resets every session.
        </p>
      </section>

      <section className="px-4 md:px-8 pb-20 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {characters.map((c) => (
            <Link
              key={c.id}
              href={`/companions/${c.id}`}
              className="group rounded-md overflow-hidden border border-border-hairline"
            >
              <div className="relative aspect-[3/4]">
                <Image
                  src={resolveImageSrc(c.image_url)}
                  alt={c.name}
                  fill
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover transition-transform ease-premium duration-200 group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-2.5">
                <p className="text-sm font-semibold text-text-primary truncate">
                  {c.name}
                  {c.age ? (
                    <span className="text-text-secondary font-normal">
                      {" "}
                      · {c.age}
                    </span>
                  ) : null}
                </p>
                {c.archetype && (
                  <p className="text-xs text-text-secondary truncate mt-0.5">
                    {c.archetype}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="px-4 md:px-8 pb-16 max-w-5xl mx-auto border-t border-border-hairline pt-10 text-center">
        <p className="text-text-secondary text-sm">
          Looking for something else? Browse the full companion roster.
        </p>
        <Button asChild variant="secondary" className="mt-3">
          <Link href="/discover">Browse all companions</Link>
        </Button>
      </section>

      <Footer />
    </div>
  );
}
