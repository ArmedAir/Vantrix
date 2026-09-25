import { Metadata } from "next";
import { absoluteUrl } from "@/lib/utils";
import { env } from "@/env";

/**
 * GOOGLE-VERIFICATION-CONSISTENCY FIX: this is the same real Search Console
 * verification token layout.tsx hardcodes as its own fallback (not a
 * secret -- Google's HTML-tag verification method embeds it in public page
 * HTML on every verified site by design). Exported from here so BOTH
 * layout.tsx's root metadata AND every page's generateSEOMeta() resolve to
 * the identical value regardless of whether GOOGLE_SITE_VERIFICATION is
 * set in the environment.
 *
 * Before this fix, generateSEOMeta() returned `verification: { google:
 * env.GOOGLE_SITE_VERIFICATION }` with NO fallback -- so on every route
 * with its own metadata export (i.e. every real page, including "/"
 * itself via (app)/page.tsx), that object was `{ google: undefined }`
 * whenever the env var was unset. Next.js's documented metadata-merge
 * behavior REPLACES a parent segment's nested object fields (like
 * `verification`) with the child's, rather than deep-merging them -- so
 * that undefined `google` value didn't fall back to layout.tsx's good
 * token, it silently overwrote it, and the rendered page had no
 * verification meta tag at all. Since Search Console's HTML-tag
 * verification check fetches exactly this root page, that could mean
 * domain ownership verification never actually completed -- which would
 * also mean no sitemap submission or "request indexing" through Search
 * Console, independent of whether robots.txt/sitemap.ts are correct.
 */
export const GOOGLE_SITE_VERIFICATION =
  env.GOOGLE_SITE_VERIFICATION ?? "dZC8yjP4DGNU1fjD589zwm_-jDQINFXfrZMrUyrbR9o";

interface SEOMetaOptions {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: "website" | "article" | "product";
  publishedTime?: string;
  modifiedTime?: string;
  keywords?: string[];
  noIndex?: boolean;
}

export function generateSEOMeta({
  title,
  description,
  path,
  image = "/og-image.jpg",
  type = "website",
  publishedTime,
  modifiedTime,
  keywords = [],
  noIndex = false,
}: SEOMetaOptions): Metadata {
  const url = absoluteUrl(path);
  const ogImage = absoluteUrl(image);

  // TITLE-LENGTH-FIX: after the double-branding fix above stopped the
  // layout template from appending its own 24-char suffix, ~24 pages
  // were still over Google's ~60-char truncation point purely from their
  // own already-complete title -- every one of them ending in the same
  // literal " | Vantrix" every caller appends by convention (see this
  // file's DOUBLE-BRANDING-FIX comment for the exact call sites: blog
  // posts, landing pages, location pages, tag pages). Dropping just that
  // known suffix, and only when the title is already over the limit
  // without it, recovers up to 10 characters on exactly the pages that
  // need it and does nothing to the ~80 pages already under 60 -- a
  // one-place fix instead of hand-editing every long post/page title
  // individually. Scoped to the <title> tag/search snippet only: OG and
  // Twitter cards keep the full title below, since they aren't truncated
  // the same way and the brand suffix reads fine there.
  const TITLE_MAX = 60;
  const BRAND_SUFFIX = " | Vantrix";
  const pageTitle =
    title.length > TITLE_MAX && title.endsWith(BRAND_SUFFIX)
      ? title.slice(0, -BRAND_SUFFIX.length)
      : title;

  return {
    // DOUBLE-BRANDING-FIX: every caller of generateSEOMeta() already passes
    // a complete, final title (e.g. blog/[slug]'s `${post.title} | Vantrix`,
    // tag pages' `${label} AI Companions — Chat Free | Vantrix`) — none of
    // them are written expecting more to be appended. But a plain string
    // title is still subject to the root layout's title template
    // (`"%s — Vantrix AI Companions"`, added there specifically so a child
    // route that sets NO title of its own still gets a properly-branded
    // one) — so every page using this helper was getting that same
    // 24-character suffix appended on top of its own already-complete
    // title. A real crawl caught the result directly: titles like
    // "...| Vantrix — Vantrix AI Companions" (redundant brand, doubled) and
    // roughly 60 pages pushed past Google's ~60-char truncation point by
    // that unwanted suffix alone. `{ absolute: title }` is Next's supported
    // way for a child page to opt out of an inherited template — the
    // layout's `default` (for routes that truly set no title) is untouched.
    title: { absolute: pageTitle },
    description,
    keywords: [
      "AI companion",
      "AI girlfriend",
      "AI boyfriend",
      "AI chat",
      "AI dating",
      "anime AI",
      "character AI",
      "virtual companion",
      ...keywords,
    ],
    authors: [{ name: "Vantrix Ai" }],
    creator: "Vantrix Ai",
    publisher: "Vantrix Ai",
    metadataBase: new URL(absoluteUrl("/")),
    alternates: {
      // Canonical only — hreflang removed until i18n routes (/en/, /es/ etc)
      // actually exist. Fake hreflang pointing to 404s wastes crawl budget
      // and can cause Google to deindex pages.
      canonical: url,
    },
    openGraph: ({
      title,
      description,
      url,
      siteName: "Vantrix Ai",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: "en_US",
      type,
      ...(publishedTime && { publishedTime }),
      ...(modifiedTime && { modifiedTime }),
    } as Record<string, unknown>),
  twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
      creator: "@vantrixai",
    },
    robots: {
      index: !noIndex,
      follow: !noIndex,
      googleBot: {
        index: !noIndex,
        follow: !noIndex,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    verification: {
      google: GOOGLE_SITE_VERIFICATION,
    },
  };
}

// Dynamic OG image URL for character pages
export function characterOgImageUrl(name: string, imageUrl?: string | null): string {
  const APP_URL = env.NEXT_PUBLIC_APP_URL;
  const params = new URLSearchParams({ title: name });
  if (imageUrl) params.set("image", imageUrl);
  return `${APP_URL}/api/og?${params.toString()}`;
}
