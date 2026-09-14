import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { PublicHeader } from "@/components/public/public-header";
import { Footer } from "@/components/home/footer";
import { getBlogPost, getBlogSlugs } from "@/lib/blog/posts";
import {
  generateArticleSchema,
  generateBreadcrumbSchema,
  safeJsonLd,
} from "@/lib/seo/structured";
import { generateSEOMeta } from "@/lib/seo/meta";

export async function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};

  return generateSEOMeta({
    title: `${post.title} | Vantrix`,
    description: post.description,
    path: `/blog/${post.slug}`,
    type: "article",
    publishedTime: post.datePublished,
    modifiedTime: post.dateModified,
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const nonce = (await headers()).get("x-nonce");
  const schema = generateArticleSchema({
    slug: post.slug,
    title: post.title,
    description: post.description,
    datePublished: post.datePublished,
    dateModified: post.dateModified,
  });
  const breadcrumbs = generateBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: post.title },
  ]);

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
          href="/blog"
          className="text-sm text-text-tertiary hover:text-gold-400"
        >
          ← Blog
        </Link>

        <h1 className="mt-4 font-display text-3xl md:text-4xl text-text-primary">
          {post.title}
        </h1>
        <p className="mt-3 text-sm text-text-tertiary">
          {new Date(post.datePublished).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}{" "}
          · {post.readingTime} · By Covenant Alphonsus
        </p>

        <div className="mt-8 space-y-6">
          {post.body.map((section, i) => (
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
