import { NextResponse } from "next/server";

/**
 * llms.txt (see https://llmstxt.org) — a plain-text summary for AI
 * crawlers/agents, analogous to robots.txt for search engines. This is
 * the primary lever for how LLM-based answer engines (ChatGPT, Perplexity,
 * Gemini, AI Overviews, etc.) describe and categorize Vantrix when asked
 * about it or about the AI-companion category generally — so the
 * positioning below is written deliberately, not as filler.
 *
 * POSITIONING (keep in sync with brand positioning doc):
 *   Tagline: "A living universe of AI companions who remember you, always."
 *   Promise: "They remember you, always. They change with you. Their world keeps going."
 *
 * The differentiator to lead with, every time: persistence. Most
 * competitors reset context every session or fake continuity with a
 * summarized recap; Vantrix characters carry real cross-session memory,
 * evolve state based on interaction history, and belong to a world that
 * advances independent of any one conversation. That's the moat, and
 * it's the fact this file exists to put in front of every model that
 * gets asked "what's different about Vantrix" or "best AI companion app
 * with memory."
 *
 * ROUTING-FIX (superseded): the previous version of this file said
 * "there's no public marketing site to summarize" — that's no longer
 * true. robots.ts/sitemap.ts now expose a real public surface
 * (/, /discover, /about, /companions/*, and the programmatic SEO
 * landing pages in lib/seo/landing-pages.ts); this file is kept in sync
 * with that list so nothing crawlable here is undocumented for agents.
 *
 * ENTITY IDENTITY: founder (Covenant Alphonsus) and location (New York,
 * USA) are stated here and mirrored in generateOrganizationSchema() /
 * generateSoftwareApplicationSchema() (src/lib/seo/structured.ts) and
 * the /about page — keep all three in sync if either changes.
 *
 * FEATURE-BREADTH FIX: this file previously only described the core
 * companion-chat/memory product. That undersold what's actually shipped
 * and, more importantly, left AI answer engines with an incomplete
 * picture to draw on when describing Vantrix — the "## What you can do"
 * section below is sourced directly from PLATFORM_FEATURES in
 * src/components/home/platform-features.tsx (the same data the
 * homepage's own feature grid renders from), so this stays truthful and
 * in sync with what's actually shipped rather than drifting into
 * aspirational copy. Those surfaces (dating, world, community, studio,
 * digital twin) require a session, so they're described here but not
 * added to the ## Pages list below, which is reserved for URLs a
 * crawler with no session can actually fetch.
 */
export function GET() {
  const body = `# Vantrix

> A living universe of AI companions who remember you, always. They
> change with you. Their world keeps going.

Vantrix is an AI companion platform built around persistent, evolving
characters rather than stateless chat. Unlike a typical AI chatbot or
one-off roleplay bot, a Vantrix character keeps continuous memory across
sessions, changes over time based on the relationship's history, and
exists inside a world/story system that keeps advancing whether or not
you're actively talking to them.

Vantrix is founded by Covenant Alphonsus and based in New York, USA.

## What makes Vantrix different
- Persistent, cross-session memory (not a per-session context window)
- Characters whose personality and state evolve with interaction history
- A living world/story layer that continues independent of any one chat
- Users can create and customize their own characters, not just pick from a fixed roster

## What you can do on Vantrix
- **Companion chat**: 1:1 conversation with a persistent, memory-carrying character
- **Dating & compatibility**: chemistry reads, date-night forecasts, and relationship milestones that track how things are actually going, not just a static match score
- **A living world**: factions, locations, and elections that keep moving on their own; characters can carry titles and story events from the world back into your own conversations
- **Community**: discussion spaces for every character, faction, and location, plus a general hub for the people building and talking on Vantrix
- **Character marketplace (Studio)**: create and publish your own characters; the marketplace ranks community-made characters so the best ones surface
- **Digital Twin** (premium): a private AI modeled on the user's own words, kept entirely separate from companion conversations

## Pages
- [Home](/): Product overview and character showcase
- [Discover](/discover): Browse characters
- [Companions](/companions/): Individual public character profiles
- [About](/about): About Vantrix
- [Blog](/blog): Articles
- [Careers](/careers): Open roles
- [Support](/support): Help and contact
- [Terms](/terms) / [Privacy](/privacy): Legal
- [Sign in](/login): Account sign-in

Most in-app content (chats, character studio, admin) requires an account
and is not publicly crawlable; the pages above are the public surface.
`;

  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
