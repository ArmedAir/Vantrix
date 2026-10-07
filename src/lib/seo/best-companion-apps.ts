/**
 * src/lib/seo/best-companion-apps.ts
 *
 * Content for the standalone /best-ai-companion-apps roundup page (see
 * app/(seo)/best-ai-companion-apps/page.tsx). Deliberately NOT folded into
 * LANDING_PAGES (lib/seo/landing-pages.ts): that schema is built around one
 * product's own hero/features/steps, and a "best of" roundup is structurally
 * a ranked list of several products, so it gets its own small config here
 * and its own route rather than being forced into the wrong shape.
 *
 * Distinct from the narrative /guides/best-ai-companions guide (see
 * lib/guides/posts.ts): that's a criteria/explainer piece ("what actually
 * separates them"), this is a ranked, scannable top-6 comparison ?
 * different format and search intent, so both can coexist without
 * cannibalizing each other's ranking.
 *
 * CONTENT POLICY: every claim about a competitor below must be a stable,
 * widely-known, uncontroversial characteristic (e.g. "known for" framing),
 * never a specific negative or disputable claim about their current
 * features, pricing, or policies ? those change without notice and this
 * page doesn't get re-verified against them. Positive, specific claims
 * belong on Vantrix's own entry only, where they're ours to keep accurate.
 * `altPageSlug` links to this repo's own /[slug]-alternative page where one
 * exists (see LANDING_PAGES), for internal linking; entries without a
 * dedicated alternative page just omit it.
 */

export interface RankedApp {
  rank:        number;
  name:        string;
  tagline:     string;
  knownFor:    string;
  bestFor:     string;
  highlights:  string[];
  /** Omit for Vantrix itself (no internal /vantrix-alternative page). */
  altPageSlug?: string;
  /** True only for the one entry this page's own site is not a link out for. */
  isVantrix?:  boolean;
}

export const BEST_COMPANION_APPS: RankedApp[] = [
  {
    rank:     1,
    name:     "Vantrix",
    tagline:  "A living Universe of companions who actually remember you.",
    knownFor: "Persistent memory, an evolving shared world, and a full roster you can extend yourself.",
    bestFor:  "Anyone who wants a companion (or several) that develops over weeks and months, not a chat that resets.",
    highlights: [
      "Dozens of companions with distinct personalities, plus a Character Studio to build and publish your own",
      "Persistent cross-session memory ? conversations, preferences, and inside jokes carry forward by default",
      "A living Universe of factions and locations that keeps evolving between visits",
      "Dating, gifting, and compatibility tracking through Spark, Bond, and Soulbound relationship tiers",
      "Free tier (5 messages/day across the full roster); Premium is $9.99/month with no API key or setup required",
    ],
    isVantrix: true,
  },
  {
    rank:     2,
    name:     "Character.AI",
    tagline:  "The best-known name in AI character chat.",
    knownFor: "A huge, community-built character library and mainstream name recognition.",
    bestFor:  "Casual, one-off chats with a huge variety of community-made characters.",
    highlights: [
      "Enormous library of user-created characters across almost any fandom or archetype",
      "Free to use, with a paid tier for faster responses",
      "Chats are generally session-based rather than carrying deep persistent memory forward",
    ],
    altPageSlug: "character-ai-alternative",
  },
  {
    rank:     3,
    name:     "Replika",
    tagline:  "The original mainstream AI companion app.",
    knownFor: "A single, long-term companion you shape over time, plus wellness-oriented framing.",
    bestFor:  "Someone who wants one consistent companion rather than a roster of characters.",
    highlights: [
      "One primary companion per user, customized and developed over a long relationship",
      "Long track record and broad name recognition in the AI companion space",
      "Built around a single avatar rather than a roster of distinct characters",
    ],
    altPageSlug: "replika-alternative",
  },
  {
    rank:     4,
    name:     "Janitor AI",
    tagline:  "A large, community-driven character-card platform.",
    knownFor: "A big library of user-submitted character cards, popular for open-ended roleplay.",
    bestFor:  "Users who already have a preferred external model/API key and want raw roleplay flexibility.",
    highlights: [
      "Large community library of character cards covering almost any premise",
      "Popular for long-form, open-ended roleplay",
      "Best results often depend on bringing your own external API key or proxy",
    ],
    altPageSlug: "janitor-ai-alternative",
  },
  {
    rank:     5,
    name:     "Candy.AI",
    tagline:  "A companion app built around AI-generated companion imagery.",
    knownFor: "Photorealistic AI companion images alongside chat.",
    bestFor:  "Users who want a strong visual/image component alongside conversation.",
    highlights: [
      "Companion imagery is a core part of the experience, not just an add-on",
      "Straightforward, chat-plus-image companion format",
      "Roster and world-building depth are more limited than platforms built around an evolving world",
    ],
    altPageSlug: "candy-ai-alternative",
  },
  {
    rank:     6,
    name:     "Kindroid",
    tagline:  "A customization-heavy AI companion builder.",
    knownFor: "Deep, granular control over a single companion's personality and behavior.",
    bestFor:  "Users who want to fine-tune a single companion's traits in detail.",
    highlights: [
      "Extensive personality and behavior customization for a single companion",
      "Selfie/image generation features alongside chat",
      "Built around deep-diving a single companion rather than a wide roster or shared world",
    ],
    altPageSlug: "kindroid-alternative",
  },
];

export const BEST_COMPANION_APPS_FAQS: { question: string; answer: string }[] = [
  {
    question: "What's the best AI companion app in 2026?",
    answer:   "It depends on what you want. Vantrix leads this list for persistent memory, a full roster of companions, and an evolving shared world ? Character.AI has the largest community character library, Replika is built around a single long-term companion, and Janitor AI and Candy.AI each focus on specific strengths like open-ended roleplay or companion imagery.",
  },
  {
    question: "Which AI companion apps are free to start?",
    answer:   "Vantrix, Character.AI, Replika, and Janitor AI all offer a free tier or free-to-use mode, typically with limits that a paid plan removes. Vantrix's free tier includes 5 messages per day across its full companion roster.",
  },
  {
    question: "Which AI companion app has the best memory?",
    answer:   "Persistent, cross-session memory that carries forward by default is one of Vantrix's core differentiators ? companions remember past conversations, preferences, and context without extra setup, and keep developing inside an evolving Universe between visits.",
  },
  {
    question: "Do any of these apps require an API key?",
    answer:   "Some community-driven platforms, like Janitor AI, often work best when you bring your own external API key or proxy. Vantrix companions run entirely on models built into the platform, so there's nothing to configure.",
  },
];
