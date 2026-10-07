import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/utils";
import { getLandingPageSlugs } from "@/lib/seo/landing-pages";

/**
 * ROUTING-FIX: §13 previously flagged this as intentionally minimal
 * because "every route under src/app/(app) redirects to /login... and
 * there is no /pricing, /about, or similar public surface anywhere in the
 * app tree today." That's no longer true — /discover, /about, /careers,
 * /blog, /support, /terms, and /privacy are now real public pages (see
 * their own route files) built specifically to close that gap, so they're
 * allowed here alongside the existing auth pages.
 *
 * 0.3.1/14.1/14.2 FIX: "/" was disallowed outright, back when it
 * unconditionally redirected every crawler (no session, same as any
 * anonymous visitor) to /login — nothing there was ever indexable. Now
 * that (app)/layout.tsx serves a real public homepage at "/" for
 * signed-out requests (see that file's own 0.3.1 FIX comment), the
 * blanket disallow would hide the single most important page on the
 * site from search engines, so it's removed. The programmatic SEO
 * landing pages (LANDING_PAGES in lib/seo/landing-pages.ts, rendered by
 * app/(seo)/[landing]/page.tsx) are added the same data-driven way the
 * sitemap already does, so a new entry there is automatically crawlable
 * here too without a second file to remember to update.
 *
 * The authenticated shell (everything else under (app) — /chats,
 * /characters, /studio, etc.) is still disallowed — nothing there is
 * indexable for a crawler with no session, and allowing it would just
 * invite crawlers at authenticated API routes. The blanket disallow of
 * "/" stays for exactly that reason (it's still what blocks every
 * unlisted (app) route); "/" is additionally added to `allow` alongside
 * it rather than removed from `disallow`, because Google's robots.txt
 * tie-break rule is "same-length match, least restrictive wins" — an
 * exact "/" in both lists resolves to allowed, while a sub-path like
 * "/chats" still matches only the (longer, unopposed) "/" disallow and
 * stays blocked. Removing "/" from disallow instead would have unblocked
 * every (app) route by default, not just the root.
 *
 * §2.5 FIX: "/companions/" (the new public character pages, see
 * (seo)/companions/[id]/page.tsx) is allowed the same way — a longer,
 * more specific allow prefix beats the blanket "/" disallow for every
 * path under it, same tie-break rule as above.
 *
 * SEO-LOCATIONS FIX: "/locations/" (the new public world-location
 * pages, see (seo)/locations/[slug]/page.tsx) is allowed the same way.
 *
 * TAGS FIX: "/tags/" (the new public tag-browse pages, see
 * (seo)/tags/[tag]/page.tsx) is allowed the same way.
 *
 * PRICING-PUBLIC FIX: "/premium" (the pricing page, see
 * (app)/premium/page.tsx + (app)/layout.tsx's own PRICING-PUBLIC FIX) is
 * allowed the same way — it's a real public pricing page now, not just
 * an authenticated upsell.
 *
 * RAAS-PUBLIC FIX: "/relationships" (the tier explainer page, see
 * (app)/relationships/page.tsx) is allowed the same way.
 *
 * AI-CHATBOT-ACCESS FIX: llms.txt/route.ts's own doc comment says this
 * file "is kept in sync with that [robots.ts] list so nothing crawlable
 * here is undocumented for agents" — but /llms.txt and /llms-full.txt
 * themselves were never added to that list. The file written specifically
 * for AI answer engines to read wasn't guaranteed-crawlable by all of
 * them: under the wildcard "*" rule's own "/" vs "/" tie (see the
 * ROUTING-FIX comment above), Google's specifically-documented
 * least-restrictive-wins tie-break likely resolves this in favor of
 * allow anyway — but that's a Google-specific algorithm, and there's no
 * guarantee every AI crawler's robots.txt parser implements the same
 * tie-break rather than just seeing an unopposed-looking "/" disallow.
 * Same reasoning that already justifies explicitly listing "/discover",
 * "/about", etc. instead of relying on the tie-break for those. Fixed by
 * adding both paths to PUBLIC_ALLOW below.
 *
 * While in here: PUBLIC_ALLOW/PUBLIC_DISALLOW were pulled out so the same
 * lists back explicit rules for the specific major AI-chatbot user
 * agents (GPTBot/ChatGPT-User/OAI-SearchBot, ClaudeBot/Claude-User/
 * Claude-SearchBot, PerplexityBot/Perplexity-User, Google-Extended,
 * Applebot-Extended, Meta's meta-externalagent) in addition to the
 * catch-all "*" rule. Each one is identical to the "*" rule; this is
 * belt-and-suspenders for the same reason, not a behavior change from
 * what "*" already grants every one of these bots today, and the "*"
 * rule stays as the real fallback for any agent not named here.
 */
const PUBLIC_ALLOW = [
  "/",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/discover",
  "/about",
  "/careers",
  "/blog",
  "/support",
  "/press",
  "/terms",
  "/privacy",
  "/premium",
  "/relationships",
  "/best-ai-companion-apps",
  "/companions/",
  "/locations/",
  "/tags/",
  "/llms.txt",
  "/llms-full.txt",
  ...getLandingPageSlugs().map((slug) => `/${slug}`),
];
const PUBLIC_DISALLOW = ["/", "/api/"];

// Major AI-chatbot/answer-engine crawlers and live-fetch agents, current
// as of this writing. Not exhaustive of every AI-related bot (e.g.
// Bytespider, CCBot) — scoped to the mainstream chatbot products this
// task is actually about.
const AI_CHATBOT_USER_AGENTS = [
  "GPTBot",          // OpenAI — training crawler
  "ChatGPT-User",    // OpenAI — live fetch during a ChatGPT browsing session
  "OAI-SearchBot",   // OpenAI — ChatGPT search indexing
  "ClaudeBot",       // Anthropic — training/crawling
  "Claude-User",     // Anthropic — live fetch during a Claude conversation
  "Claude-SearchBot",// Anthropic — Claude web search indexing
  "PerplexityBot",   // Perplexity — indexing crawler
  "Perplexity-User", // Perplexity — live fetch on behalf of a user query
  "Google-Extended", // Google — Gemini/AI Overviews training + grounding (separate from Googlebot itself, already unconditionally allowed)
  "Applebot-Extended",// Apple — Apple Intelligence training use (separate from Applebot itself)
  "meta-externalagent", // Meta — Meta AI training/crawling
];
// WWW-CANONICAL-STALENESS-FIX: same reasoning as sitemap.ts's own comment —
// this route also builds every URL via absoluteUrl()/NEXT_PUBLIC_APP_URL
// with no dynamic/revalidate export, so it's equally exposed to serving a
// statically-cached build's URLs after the env value has since been
// corrected. Forced dynamic for the same reason: always reflect the live
// env value, never a stale build's.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: PUBLIC_ALLOW,
        disallow: PUBLIC_DISALLOW,
      },
      ...AI_CHATBOT_USER_AGENTS.map((userAgent) => ({
        userAgent,
        allow: PUBLIC_ALLOW,
        disallow: PUBLIC_DISALLOW,
      })),
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
