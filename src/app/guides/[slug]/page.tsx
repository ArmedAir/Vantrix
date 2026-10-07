import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { PublicHeader } from "@/components/public/public-header";
import { Footer } from "@/components/home/footer";
import { getGuide, getGuideSlugs, getRelatedGuides } from "@/lib/guides/posts";
import {
  generateArticleSchema,
  generateBreadcrumbSchema,
  safeJsonLd,
} from "@/lib/seo/structured";
import { generateSEOMeta } from "@/lib/seo/meta";

export async function generateStaticParams() {
  return getGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};

  return generateSEOMeta({
    title: `${guide.title} | Vantrix`,
    description: guide.description,
    path: `/guides/${guide.slug}`,
    type: "article",
    publishedTime: guide.datePublished,
    modifiedTime: guide.dateModified,
  });
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const nonce = (await headers()).get("x-nonce");
  const schema = generateArticleSchema({
    slug: guide.slug,
    title: guide.title,
    description: guide.description,
    datePublished: guide.datePublished,
    dateModified: guide.dateModified,
  });
  const breadcrumbs = generateBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Guides", path: "/guides" },
    { name: guide.title },
  ]);
  const related = getRelatedGuides(guide);

  return (
    <div className="min-h-screen bg-base">
      {/* eslint-disable-next-line @next/next/no-sync-scripts -- static JSON-LD, escaped via safeJsonLd */}
      <script
        type="application/ld+json"
        nonce={nonce ?? undefined}
        dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
      />
      {/* eslint-disable-next-line @next/next/no-sync-scripts -- static JSON-LD, escaped via safeJsonLd */}
      <script
        type="application/ld+json"
        nonce={nonce ?? undefined}
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbs) }}
      />
      <PublicHeader />
      <main className="max-w-2xl mx-auto px-4 md:px-8 py-16">
        <Link
          href="/guides"
          className="text-sm text-text-tertiary hover:text-gold-400"
        >
          ← Guides
        </Link>

        <h1 className="mt-4 font-display text-3xl md:text-4xl text-text-primary">
          {guide.title}
        </h1>
        <p className="mt-3 text-sm text-text-tertiary">
          {new Date(guide.datePublished).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}{" "}
          · {guide.readingTime}
        </p>

        <div className="mt-8 space-y-6">
          {guide.body.map((section, i) => (
            <div key={i}>
              {section.heading && (
                <h2 className="font-display text-xl text-text-primary mb-2">
                  {section.heading}
                </h2>
              )}
              {section.paragraphs.map((p, j) => (
                <p
                  key={j}
                  className="mt-2 text-[15px] leading-relaxed text-text-secondary"
                >
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>

        {related.length > 0 && (
          <div className="mt-10 pt-6 border-t border-border-hairline">
            <p className="text-sm font-semibold text-text-primary">
              Related guides
            </p>
            <ul className="mt-3 space-y-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/guides/${r.slug}`}
                    className="text-sm text-gold-400 hover:text-gold-300"
                  >
                    {r.title} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CROSS-LINK-FIX: links to the matching direct-comparison landing
            page when this guide covers one competitor by name ? see
            landingPageSlug's own comment in lib/guides/posts.ts. */}
        {guide.landingPageSlug && (
          <div className="mt-12 pt-8 border-t border-border-hairline text-center">
            <p className="text-text-secondary text-sm">
              Want the direct feature-by-feature comparison?
            </p>
            <Link
              href={`/${guide.landingPageSlug}`}
              className="mt-3 inline-block text-sm font-semibold text-gold-400 hover:text-gold-300"
            >
              See the full comparison →
            </Link>
          </div>
        )}

        <div className="mt-12 pt-8 border-t border-border-hairline text-center">
          <p className="text-text-secondary text-sm">
            Want to see persistent AI memory for yourself?
          </p>
          <Link
            href="/discover"
            className="mt-3 inline-block text-sm font-semibold text-gold-400 hover:text-gold-300"
          >
            Browse Vantrix companions →
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
