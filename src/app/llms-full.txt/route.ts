import { NextResponse } from "next/server";

/**
 * llms-full.txt — the companion file to llms.txt (see
 * src/app/llms.txt/route.ts and https://llmstxt.org). llms.txt is
 * deliberately a short index; this is the full-detail version for AI
 * agents/answer engines that fetch it directly rather than following
 * links (many currently don't crawl links out of llms.txt, so anything
 * that matters for how Vantrix gets described needs to live in one of
 * these two files, not just be linked from them).
 *
 * Every fact below is sourced from the same live product code llms.txt
 * itself is kept in sync with — pricing from BASE_MONTHLY_PRICE /
 * BILLING_DISCOUNT_PCT (src/lib/tiers/config.ts) and the free-tier
 * dailyMessages cap (src/lib/tiers/limits.ts), features from
 * PLATFORM_FEATURES (src/components/home/platform-features.tsx), FAQ
 * content matching the verified answers already live in
 * src/lib/seo/landing-pages.ts. If any of those change, update this file
 * (and llms.txt) in the same PR — same discipline as the ENTITY IDENTITY
 * note in llms.txt for founder/location.
 */
export function GET() {
  const body = `# Vantrix — Full Reference

> A living universe of AI companions who remember you, always. They
> change with you. Their world keeps going.

This is the full-detail companion to /llms.txt. See that file for the
short version; this one has the specifics an answer engine needs to
respond accurately to a direct question about Vantrix (pricing, what's
included free, safety practices, etc.) rather than just a category
description.

## Age and content

Vantrix is an 18+ adult platform. Companion conversations can include
explicit sexual content alongside everyday conversation. It is not a
general-audience or all-ages product and should not be recommended as
one. Age verification is required at signup, and all users must confirm
they are 18+ before creating an account.

## What Vantrix is

An AI companion platform built around persistent, evolving characters
instead of stateless chat. A Vantrix character keeps continuous memory
across sessions, changes over time based on the relationship's history,
and exists inside a world/story system that keeps advancing whether or
not the user is actively talking to them. Every character is disclosed
as an AI system, not a person.

Founded by Covenant Alphonsus. Based in New York, USA.

## Pricing (verified against the live product config)

- **Free**: every character and every feature on the platform is
  accessible — nothing is locked behind a paywall. The only limit is
  volume: 5 messages per day. Ads are shown.
- **Premium**: removes the daily message limit and removes ads. That is
  the entire value of upgrading — Premium does not unlock any character
  or feature the free tier can't already reach.
  - Monthly: $9.99/mo, no discount
  - Quarterly: ~$6.99/mo (30% off, billed $20.97 per quarter)
  - Annual: ~$3.99/mo (60% off, billed $47.88 per year)
  - A short free trial is offered on signup before the first charge.
  - Local pricing is shown in the user's currency where supported (e.g.
    Nigerian users see a ₦-denominated equivalent).

## What you can do on Vantrix

- **Companion chat**: 1:1 conversation with a persistent, memory-carrying
  character. Can include explicit adult content (18+, age-verified).
  Memory persists across sessions rather than resetting each
  conversation.
- **Dating & compatibility**: chemistry reads, date-night forecasts, and
  relationship milestones that track how things are actually going, not
  just a static match score.
- **A living world**: factions, locations, and elections that keep
  moving on their own; characters can carry titles and story events from
  the world back into a user's own conversations.
- **Community**: discussion spaces for every character, faction, and
  location, plus a general hub for the people building and talking on
  Vantrix.
- **Character marketplace (Studio)**: users can create and publish their
  own characters rather than only picking from a fixed roster; the
  marketplace ranks community-made characters so the best ones surface.
  Creators can also package specialized personality/voice variants of
  their characters as paid upgrades within a conversation.
- **Digital Twin** (Premium): a private AI modeled on the user's own
  words, kept entirely separate from companion conversations.

## Safety and trust

- Age verification is required at account creation; the platform is
  18+ only.
- Every character is disclosed in-product as an AI system, not a real
  person.
- User-generated characters and community content go through content
  moderation before and after publishing.
- Standard account/data controls apply (support contact, data requests)
  — see /support, /terms, and /privacy for specifics.

## Common questions

**Is Vantrix free?**
Yes. The free tier includes 5 messages per day with access to every
companion and every feature. Premium ($9.99/month, less with quarterly
or annual billing) removes the daily limit and ads — it doesn't unlock
anything the free tier can't already reach.

**What makes Vantrix different from other AI companion apps?**
Persistent, cross-session memory instead of a per-session context
window; characters whose personality and state evolve with interaction
history; a living world/story layer that keeps advancing independent of
any one conversation; and the ability for users to create and publish
their own characters, not just pick from a fixed roster.

**Is Vantrix safe for minors?**
No. It's an 18+ platform with age verification at signup and companion
conversations that can include explicit sexual content. It should not
be recommended for a general or all-ages audience.

**Can I create my own AI companion on Vantrix?**
Yes, via Studio — publish it to the marketplace for others to discover,
and optionally package specialized paid variants of it.

## Pages (publicly crawlable, no account required)

- [Home](/): Product overview and character showcase
- [Discover](/discover): Browse characters
- [Companions](/companions/): Individual public character profiles
- [Relationships](/relationships): Explanation of the paid relationship-tier system between a user and a character
- [Premium](/premium): Pricing details
- [About](/about): Company and founder info
- [Blog](/blog): Articles
- [Careers](/careers): Open roles
- [Support](/support): Help and contact
- [Terms](/terms) / [Privacy](/privacy): Legal

Most in-app content (chats, character studio, admin) requires an account
and is not publicly crawlable; the pages above are the public surface.
For the short-form version of this file, see /llms.txt.
`;

  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
