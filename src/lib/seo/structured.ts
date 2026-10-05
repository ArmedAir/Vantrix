import { absoluteUrl } from "@/lib/utils";
import { env } from "@/env";

/**
 * SEC-XX FIX: Safely serialize a JSON-LD object for embedding via
 * dangerouslySetInnerHTML inside a <script type="application/ld+json"> tag.
 *
 * JSON.stringify does NOT escape `<`, so any field that flows into a schema
 * (e.g. character.name / character.description, which are user/creator
 * supplied) could contain a literal "</script>" and prematurely close the
 * tag, letting an attacker inject arbitrary HTML/script into the page.
 *
 * Escaping <, >, and & to their \uXXXX form keeps the JSON semantically
 * identical (valid inside a JSON string, parsed back to the original
 * characters) while making it impossible to break out of the surrounding
 * <script> element. Always use this — never JSON.stringify directly — when
 * building a dangerouslySetInnerHTML payload from schema data.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function generateOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Vantrix Ai",
    // ENTITY-SYNONYM FIX: schema.org's `alternateName` is the field Google's
    // Knowledge Graph actually reads to learn that a name variant refers to
    // the SAME entity as `name` + `url` below — this is the direct,
    // machine-readable way to make "Vantrix AI" resolve to vantrix.ink,
    // rather than relying only on the prose pairing in `description`
    // further down (which helps on-page but isn't a structured signal).
    // Kept as an array so future variants (e.g. a common misspelling) can
    // be added here without another schema change.
    alternateName: ["Vantrix AI", "Vantrix.ink"],
    url: absoluteUrl("/"),
    // LOGO-FIELD FIX (2026-09-13): Organization had no `logo` at all —
    // this is the specific field Google's structured-data pipeline reads
    // to pick a brand mark for Search's knowledge panel and for Google
    // Images' logo classification, distinct from the OG/Twitter share
    // image (a wide 1200x630 marketing banner, not a square mark) and
    // distinct from the favicon (too small/low-res for this use —
    // Google's own guidance wants a square image, ideally 112x112 or
    // larger). Points at the same public/images/vantrix-logo.png the
    // shared <Logo> component renders everywhere in-app (see logo.tsx),
    // so the brand mark search engines index and the one visitors
    // actually see can't drift out of sync with each other.
    logo: absoluteUrl("/images/vantrix-logo.png"),
    foundingLocation: {
      "@type": "Place",
      name: "New York, NY, USA",
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: "New York",
      addressRegion: "NY",
      addressCountry: "US",
    },
    founder: {
      "@type": "Person",
      name: "Covenant Alphonsus",
      sameAs: ["https://x.com/dxcovenant9"],
    },
    areaServed: {
      "@type": "Place",
      name: "Worldwide",
    },
    // Only include profiles that are actually live — a sameAs entry
    // pointing at a dead or nonexistent profile can hurt disambiguation
    // more than it helps. Add each URL here as soon as the real profile
    // exists (LinkedIn company page, Instagram, TikTok, YouTube,
    // Product Hunt, GitHub org, Crunchbase, etc.).
    sameAs: [
      "https://twitter.com/vantrixai",
      "https://discord.gg/py7JQNqqz",
      "https://t.me/vantrixai",
      "https://www.tiktok.com/@tryvantrix",
      // BRAND-DISAMBIGUATION FIX: was "https://www.reddit.com/user/thadleai"
      // here — a username with no visible connection to the Vantrix name
      // at all. This list exists specifically to tell Google "these are
      // all the same entity" (see the comment above) — an unbranded
      // profile doesn't help that and can actively confuse it, which is a
      // worse outcome than the dead-link case the comment above already
      // warns about. Removed rather than left in; re-add it (ideally with
      // an actual Vantrix-branded Reddit account instead) once confirmed.
      // "https://www.linkedin.com/company/vantrix",
      // "https://www.instagram.com/vantrixai",
      // "https://www.youtube.com/@vantrixai",
      // "https://www.producthunt.com/products/vantrix",
      // "https://github.com/vantrix",
    ],
    // BRAND-DISAMBIGUATION FIX: added one natural "Vantrix AI" pairing
    // (previously just "Vantrix" throughout) — several unrelated companies
    // also use the bare "Vantrix" name, and this exact phrase pairing is
    // one of the signals that helps Google's entity graph tell them apart.
    description:
      "Vantrix (Vantrix AI) is a living universe of AI companions who remember you, always. They change with you, and their world keeps going — persistent cross-session memory and evolving personalities, not a chatbot that resets every conversation. Beyond 1:1 chat, Vantrix includes dating and compatibility tracking, a living world of factions and locations, community discussion spaces, a character marketplace, and a private Digital Twin.",
  };
}

export function generateWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Vantrix Ai",
    // Same ENTITY-SYNONYM reasoning as generateOrganizationSchema() above —
    // ties the "Vantrix AI" name variant to this exact WebSite/url too.
    alternateName: ["Vantrix AI", "Vantrix.ink"],
    url: absoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: absoluteUrl("/discover?q={search_term_string}"),
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function generateCharacterSchema(character: {
  id?:         string;
  name:        string;
  description: string;
  image_url:   string | null;
  age?:        number | null;
  occupation?: string | null;
  category?:   string | null;
  tags?:       string[] | null;
}) {
  const APP_URL = env.NEXT_PUBLIC_APP_URL;
  // AI-DISCOVERY FIX: this schema is embedded on the public, unauthenticated
  // /companions/[id] page specifically so answer engines (Google AI
  // Overviews, ChatGPT, Perplexity, etc.) can cite and link a named
  // character. `url` previously pointed at /chat/{id}, which redirects an
  // anonymous crawler/clicker to /login — the exact opposite of a citable
  // entity URL. mainEntityOfPage must match the page the schema actually
  // sits on for the same reason (it's a self-reference, not a separate
  // destination), so it now points at the public companion page too.
  const charUrl = `${APP_URL}/companions/${character.id ?? "unknown"}`;
  // The CommunicateAction below targets the actual chat surface, which is
  // intentionally auth-walled (you can't message a character without an
  // account) — that's a legitimate "this is where the action happens"
  // target, distinct from charUrl above, which is the citable entity page
  // itself and must stay fetchable with no session.
  const chatUrl = `${APP_URL}/chat/${character.id ?? "unknown"}`;
  return {
    "@context":   "https://schema.org",
    "@type":      "Person",
    "@id":        `${charUrl}#character`,
    name:         character.name,
    description:  character.description,
    image:        character.image_url ?? `${APP_URL}/og-image.jpg`,
    url:          charUrl,
    jobTitle:     character.occupation ?? character.category ?? "AI Companion",
    ...(character.age && { age: character.age }),
    ...(character.tags?.length && { keywords: character.tags.filter(Boolean).join(", ") }),
    mainEntityOfPage: { "@type": "WebPage", "@id": charUrl },
    // CHAT-ACTION-FIX: nothing here previously told a crawler this Person
    // is an interactive agent rather than a static bio/profile — the
    // same gap llms.txt's ROSTER-FIX closed at the summary-file level,
    // closed here at the per-page structured-data level so it's present
    // even for a crawler that only ever fetches this one page and never
    // reads llms.txt. CommunicateAction is schema.org's actual vocabulary
    // for "you can talk to this entity" (vs. a generic Action), target
    // points at the real chat URL used elsewhere in this file.
    potentialAction: {
      "@type": "CommunicateAction",
      name:    `Chat with ${character.name}`,
      target:  chatUrl,
    },
  };
}

export function generateFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

/**
 * BLOG-SEO: Article schema for /blog/[slug] posts. Ties each post to the
 * Vantrix org/founder identity (author + publisher) so posts strengthen
 * the same entity graph as generateOrganizationSchema() rather than
 * reading as anonymous content — helps both classic search snippets and
 * LLM answer-engine attribution.
 */
export function generateArticleSchema(post: {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
}) {
  const url = absoluteUrl(`/blog/${post.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": url,
    headline: post.title,
    description: post.description,
    url,
    datePublished: post.datePublished,
    dateModified: post.dateModified ?? post.datePublished,
    author: {
      "@type": "Person",
      name: "Covenant Alphonsus",
    },
    publisher: {
      "@type": "Organization",
      name: "Vantrix Ai",
      url: absoluteUrl("/"),
      // Same field/reasoning as generateOrganizationSchema()'s own
      // LOGO-FIELD FIX comment above — Article's publisher.logo is a
      // separate field Google reads for its own purposes and was
      // missing here too.
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/images/vantrix-logo.png"),
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
}

/**
 * AI-DISCOVERABILITY: SoftwareApplication schema, the entity type LLM-backed
 * answer engines (Perplexity, AI Overviews, Copilot) and structured-data
 * parsers most reliably map to "product a user could be recommended" —
 * stronger for that purpose than Organization alone. Kept in sync with the
 * canonical description in generateOrganizationSchema(); do not let the two
 * drift into different category/positioning language (see module docstring
 * intent: AI systems need one stable semantic identity, not several).
 */
export function generateSoftwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": absoluteUrl("/#software"),
    name: "Vantrix Ai",
    // Same ENTITY-SYNONYM reasoning as generateOrganizationSchema() above.
    alternateName: ["Vantrix AI", "Vantrix.ink"],
    creator: {
      "@type": "Person",
      name: "Covenant Alphonsus",
    },
    applicationCategory: "LifestyleApplication",
    applicationSubCategory: "AI Companion Platform",
    operatingSystem: "Web, iOS, Android",
    url: absoluteUrl("/"),
    description:
      "Vantrix is a living universe of AI companions who remember you, always. They change with you, and their world keeps going — persistent cross-session memory and evolving personalities, not a chatbot that resets every conversation. Includes dating and compatibility tracking, a living world of factions and locations, community spaces, a character marketplace/Studio, and a private Digital Twin. Free tier available; paid plans unlock additional companions, memory depth, and generation.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free tier — limited daily messages, no card required.",
      category: "Freemium",
    },
    featureList: [
      "AI character conversations",
      "Persistent conversation memory",
      "Custom character creation",
      "Voice interaction",
      "AI image generation",
      "Community discussions",
    ],
    aggregateRating: undefined, // add once a real, verifiable rating exists — never fabricate this
  };
}

export function generateBreadcrumbSchema(items: { name: string; path?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.path && { item: absoluteUrl(item.path) }),
    })),
  };
}

/**
 * SEO-LOCATIONS FIX: Place schema for /locations/[slug] — the world
 * atlas's platform-authored cities/districts (see
 * lib/seo/public-location.ts's own comment on why these need no
 * approval gate the way character pages do). `containsPlace`/
 * `containedInPlace` are left out for now: a Place-to-Place hierarchy
 * would need parent_location_id resolved to its own Place node, which
 * isn't worth the extra query for what's currently a single flat list
 * of top-level cities plus a few sub-district Wings.
 */
export function generateLocationSchema(location: {
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  archetype?: string | null;
}) {
  const url = absoluteUrl(`/locations/${location.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    "@id": `${url}#place`,
    name: location.name,
    description: location.description ?? undefined,
    image: location.image_url ?? absoluteUrl("/og-image.jpg"),
    url,
    ...(location.archetype && { additionalType: location.archetype }),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
}
