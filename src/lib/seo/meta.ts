import { Metadata } from "next";
import { absoluteUrl } from "@/lib/utils";
import { env } from "@/env";

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
    title: { absolute: title },
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
      google: env.GOOGLE_SITE_VERIFICATION,
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
