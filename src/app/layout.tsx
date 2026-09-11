import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Script from "next/script";
import { display, sans } from "@/lib/fonts";
import { ServiceWorkerRegister } from "@/components/shell/sw-register";
import { ViewportHeightSync } from "@/components/shell/viewport-height-sync";
import { AnalyticsPageview } from "@/lib/analytics/client";
import { ThemeHydration } from "@/components/theme/theme-hydration";
import { CookieConsentBanner } from "@/components/consent/cookie-consent-banner";
import {
  generateOrganizationSchema,
  generateSoftwareApplicationSchema,
  generateWebSiteSchema,
  safeJsonLd,
} from "@/lib/seo/structured";
import "./globals.css";
import { env } from "@/env";

// BRAND POSITIONING (keep in sync with src/app/llms.txt/route.ts and
// the brand positioning doc): tagline "A living universe of AI
// companions who remember you, always," promise "They change with you. Their
// world keeps going." Title/description below are the copy search
// engines and AI answer engines pull first, so they carry the
// persistence differentiator rather than generic "AI companion" copy.
const SITE_TITLE = "Vantrix — A Living Universe of AI Companions Who Remember You, Always";
const SITE_DESCRIPTION =
  "Vantrix is a living universe of AI companions who remember you, always. They change with you, and their world keeps going — persistent memory and evolving personalities, not a chatbot that resets every session.";

export const metadata: Metadata = {
  // SOCIAL-PREVIEW FIX: root layout had no metadataBase/openGraph/twitter,
  // so any route that doesn't set its own generateMetadata() (including the
  // bare vantrix.ink homepage) fell back to this object and rendered no
  // title/image card when shared — link-preview crawlers (Facebook,
  // Twitter/X, Discord, WhatsApp, iMessage, Slack) had nothing to read.
  // metadataBase lets every relative `images` URL below (and in child
  // routes that don't set their own) resolve to an absolute URL, which
  // Open Graph requires. Falls back to localhost in dev so this never
  // throws on a missing env var; production always has NEXT_PUBLIC_APP_URL.
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  // BRAND-DISAMBIGUATION FIX: this used to be a flat `title: SITE_TITLE`,
  // which meant any child route setting its own plain `title: "..."`
  // string (e.g. /enter's old `title: "Vantrix"`) fully replaced it —
  // silently dropping the "AI Companions" disambiguator on exactly the
  // pages most likely to get indexed or read by an AI crawler, undoing
  // the entity-disambiguation work described above `SITE_TITLE`. A title
  // template means any child page can set a short title (e.g. "Vantrix
  // AI") and Next appends `template` around it automatically, while
  // `default` still covers routes that set no title at all. Child pages
  // that need a fully custom title (rare) can still override with an
  // `absolute` title field.
  title: {
    default: SITE_TITLE,
    template: "%s — Vantrix AI Companions",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: "Vantrix",
    type: "website",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Vantrix" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.jpg"],
    site: "@vantrixai",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vantrix",
  },
  // APPLE-TOUCH-ICON FIX: manifest.webmanifest's full icon set (including
  // the two maskable entries) only ever reaches Chrome/Edge/Android's
  // install prompt — iOS Safari's "Add to Home Screen" doesn't read the
  // web manifest for icons at all, it specifically needs a
  // <link rel="apple-touch-icon"> in the document head. Without one, an
  // iOS home-screen install silently falls back to an auto-generated
  // screenshot of the page as its icon instead of the Vantrix mark.
  // Next's Metadata API emits that link from `icons.apple` below; reuses
  // the existing 192px icon (already square, already the right mark)
  // rather than shipping a dedicated apple-touch-icon asset.
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  // Only rendered when GOOGLE_SITE_VERIFICATION is set (see env.ts) — set
  // that env var to the token from Google Search Console's HTML-tag
  // verification method to verify domain ownership without touching code.
  ...(env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  // Gold default. A returning "nova" visitor gets this corrected to
  // #0A0710 before paint by public/theme-init.js (and live, on toggle, by
  // theme-store.ts) — this static value can't itself read the theme
  // cookie/localStorage without forcing every route in the app into
  // dynamic rendering (see theme-init.js's own comment for why that
  // tradeoff isn't worth it just for browser-chrome tint).
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
  // MOBILE-SEND-FIX: without this, opening the on-screen keyboard doesn't
  // shrink the layout viewport, so every 100dvh-based height in the app
  // (chat-window.tsx's composer reservation in particular) doesn't
  // shrink either — the keyboard just overlays on top of the page
  // instead, covering the chat composer/Send button so taps on it never
  // land. "resizes-content" makes the browser actually resize (and
  // 100dvh recompute) when the keyboard opens, matching what
  // chat-window.tsx's calc() already assumed was happening.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      {/* THEME-FLASH-FIX: this script must run before <body> exists, not
          just before hydration. It used to sit as a child of <body>
          (further down, before {children}) — technically still
          "beforeInteractive," but by the time the browser reaches a
          script *inside* <body>, it has already parsed
          `<body className="bg-base ...">` and can paint that
          background using :root's default (gold) --color-base before
          the script ever runs, since a blocking script only halts
          further parsing, not the paint of an element the parser has
          already produced. An explicit <head> here (App Router's
          documented escape hatch for tags the Metadata API doesn't
          cover) guarantees this runs while <head> is still being
          parsed — before <body> is created at all, so there's no
          gold-styled element for the browser to paint yet. */}
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body className="bg-base text-text-primary min-h-screen">
        {/* Site-wide Organization + SoftwareApplication JSON-LD. These were
            previously defined in lib/seo/structured.ts but never rendered
            anywhere — meaning search engines and LLM answer engines had no
            structured entity to resolve "Vantrix" to beyond the per-landing-
            page FAQ schema. Rendered once here (root layout) rather than
            per-page so every route — not just the SEO landing pages —
            carries the canonical brand identity/description. See that
            file's AI-DISCOVERABILITY comment on why both schema types are
            kept in sync with the same positioning language. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(generateOrganizationSchema()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(generateSoftwareApplicationSchema()) }}
        />
        {/* WebSite schema (with the sitelinks SearchAction pointing at
            /discover?q=) — generateWebSiteSchema() already existed in
            structured.ts with nothing ever calling it, same
            "helper built, no consumer" gap the companions/[id] page's own
            header comment flagged for generateCharacterSchema(). This is
            what lets Google render a search box directly under the
            Vantrix result on the SERP instead of just a link. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(generateWebSiteSchema()) }}
        />
        <ThemeHydration />
        <ServiceWorkerRegister />
        <ViewportHeightSync />
        <Suspense fallback={null}>
          <AnalyticsPageview />
        </Suspense>
        <CookieConsentBanner />
        {children}
      </body>
    </html>
  );
}
