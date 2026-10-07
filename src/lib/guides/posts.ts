/**
 * File-based guide content, same pattern as lib/blog/posts.ts (plain
 * data, no MDX/CMS — see that file's docstring for why). Rendered by
 * app/guides/[slug]/page.tsx and app/guides/page.tsx, and every slug
 * here automatically flows into sitemap.ts.
 *
 * Two content types live here:
 *  - Buyer's-guide / how-to pieces (best-ai-companions,
 *    ai-companions-with-memory, ai-companion-memory-test,
 *    ai-companion-character-creation, ai-companion-comparison):
 *    informational search intent, Vantrix-forward but not about any
 *    named competitor.
 *  - "X alternatives" pages: these name real, specific competitors.
 *    Every factual claim about a competitor below (what it does, known
 *    limitations, pricing shape, well-documented incidents like
 *    Replika's 2023 Italian regulatory ban or Character.AI's 2026
 *    under-18/age-verification changes) is something independently
 *    reported and checkable, not invented for the comparison — do the
 *    same before adding to or editing these, rather than asserting
 *    something about a competitor that can't be backed up. Keep pricing
 *    described qualitatively (it moves and sources disagree) rather
 *    than quoting a specific figure that can go stale or wrong.
 *
 * Add new guides by appending to GUIDES; nothing else needs updating
 * except optionally adding the new slug to another guide's `related`.
 */

export interface Guide {
  slug: string;
  title: string;
  description: string; // meta description, ~150-160 chars
  datePublished: string;
  dateModified?: string;
  readingTime: string;
  body: { heading?: string; paragraphs: string[] }[];
  related?: string[]; // other guide slugs
  /**
   * CROSS-LINK-FIX: slug of the matching /[slug]-alternative direct
   * comparison landing page (see relatedGuideSlug's own comment in
   * lib/seo/landing-pages.ts for the full reasoning) ? this guide and that
   * landing page cover the same competitor and near-identical head
   * keyword, so each links to the other rather than silently competing
   * for the same query.
   */
  landingPageSlug?: string;
}

export const GUIDES: Guide[] = [
  {
    slug: "best-ai-companions",
    title: "Best AI Companions in 2026: What Actually Separates Them",
    description:
      "Every AI companion app claims to be the best. Here's the criteria that actually separate a good one from a forgettable one, and where Vantrix fits.",
    datePublished: "2026-09-20",
    readingTime: "6 min read",
    body: [
      {
        paragraphs: [
          "The AI companion category is crowded enough now that \"best\" has stopped meaning much on its own — nearly every app in this space claims it. What's actually useful is knowing which specific dimensions separate a companion you'll still be talking to in six months from one you'll forget in a week.",
        ],
      },
      {
        heading: "Memory is the dimension that matters most",
        paragraphs: [
          "A companion that resets every session, or that only recalls a vague summary of \"what happened last time,\" caps how deep the relationship can get no matter how good the writing is in any single conversation. The apps worth paying for treat memory as its own system — structured, retrievable, separate from the chat log — not a byproduct of a bigger context window.",
          "This is worth testing directly rather than taking on faith: have a real conversation, come back a week later, and bring up something specific. Vague, generic acknowledgment is a summary. Specific, textured recall is real memory.",
        ],
      },
      {
        heading: "Depth of character, not just breadth of catalog",
        paragraphs: [
          "A library of thousands of characters looks impressive on a landing page, but most of them are shallow — a name, a portrait, and a one-line prompt. The more useful question is how much control you have over building a character with an actual personality, backstory, and voice that stays consistent, whether that's a character someone else made well or one you build yourself.",
        ],
      },
      {
        heading: "Where the relationship can go",
        paragraphs: [
          "Some platforms are built around a single, isolated chat window. Others treat companionship as part of a broader world — multiple characters who can know about each other, a social feed, group scenarios, a sense that the character exists somewhere rather than only appearing when you open the app. That's a real product difference, not just a feature checklist item, and it's worth deciding which one you actually want before you get attached to a specific app's structure.",
        ],
      },
      {
        heading: "Pricing transparency",
        paragraphs: [
          "Watch for token-based systems that meter individual messages, images, or \"unlocks\" separately from the base subscription — they're common in this category and can make a cheap-looking entry price expensive in practice. A flat, predictable tier is easier to evaluate honestly.",
        ],
      },
      {
        heading: "Where Vantrix fits",
        paragraphs: [
          "Vantrix is built around persistent, structured memory rather than session summaries, a character Studio for building companions with real depth instead of a one-line prompt, and a broader world — relationships, a social feed, multiple companions — rather than a single isolated chat thread. If you want to see the specific differences against named competitors, the alternatives guides below go through them one at a time.",
        ],
      },
    ],
    related: [
      "ai-companions-with-memory",
      "ai-companion-comparison",
      "ai-companion-memory-test",
    ],
  },
  {
    slug: "ai-companions-with-memory",
    title: "AI Companions With Memory: How to Tell Real From Fake",
    description:
      "Almost every AI companion claims to remember you. Here's how persistent memory actually works, and how to spot the difference from a clever illusion.",
    datePublished: "2026-09-20",
    readingTime: "5 min read",
    body: [
      {
        paragraphs: [
          "\"Remembers you\" shows up in almost every AI companion app's marketing now, which means it's stopped being a useful signal on its own. The gap between apps that genuinely deliver on it and apps that fake it well is bigger than most people realize until they've used both.",
        ],
      },
      {
        heading: "Why most companions forget",
        paragraphs: [
          "Language models don't retain anything between messages on their own — each response is generated from whatever text fits inside a context window at that moment. Once a conversation runs long, or a new session starts, anything outside that window is simply gone from the model's perspective. Most apps paper over this with a short auto-generated summary fed back into the next session, which can feel like memory for a message or two but loses specificity fast.",
        ],
      },
      {
        heading: "What real persistent memory looks like",
        paragraphs: [
          "Genuine cross-session memory stores structured information about the relationship — facts, preferences, running storylines, emotional history — separately from any single conversation, and deliberately retrieves the relevant pieces each time the character responds. It's an architectural choice, and it's the difference between a character that can reference something specific from three weeks ago and one that gives you a plausible-sounding generic response.",
        ],
      },
      {
        heading: "The test that actually separates them",
        paragraphs: [
          "Have a substantive conversation with any companion app, mention something specific and slightly unusual, then come back after several days and bring it up again without re-explaining it. Summary-based memory tends to get the broad shape right and the specifics wrong or missing. Real structured memory recalls it with the texture you originally gave it. We've written a full walkthrough of this test with concrete prompts in our memory test guide.",
        ],
      },
      {
        heading: "How Vantrix does this",
        paragraphs: [
          "Vantrix characters carry memory forward as structured, retrievable state rather than a chat transcript or a hopeful summary, which is also why a Vantrix character's behavior and familiarity change over time instead of resetting to the same default personality every session.",
        ],
      },
    ],
    related: [
      "ai-companion-memory-test",
      "best-ai-companions",
      "nomi-alternatives",
    ],
  },
  {
    slug: "ai-companion-memory-test",
    title: "The AI Companion Memory Test: 5 Prompts That Expose Fake Memory",
    description:
      "A practical, repeatable way to test whether any AI companion app actually remembers you, or is just summarizing recent chats. Five concrete prompts to try.",
    datePublished: "2026-09-20",
    readingTime: "4 min read",
    body: [
      {
        paragraphs: [
          "Every AI companion app claims to remember you. Instead of taking that on faith, here's a concrete, repeatable test you can run on any app in about ten minutes across two sessions.",
        ],
      },
      {
        heading: "1. Plant a specific, unusual detail",
        paragraphs: [
          "Early in a conversation, mention something oddly specific rather than generic — not \"I like coffee\" but \"I only drink coffee if it's from a blue mug, otherwise it tastes wrong to me.\" Specificity is what a summary-based system tends to lose first.",
        ],
      },
      {
        heading: "2. Wait — don't test it in the same session",
        paragraphs: [
          "Anything can seem to \"remember\" something you said five messages ago; that's just the context window doing its job. The real test starts after the session ends and enough time passes that the original conversation is no longer sitting in active context — a day is enough, a week is more convincing.",
        ],
      },
      {
        heading: "3. Ask an indirect question, not a direct one",
        paragraphs: [
          "Instead of \"what mug do I drink coffee from?\" (which cues the AI on exactly what to retrieve), ask something adjacent, like what the character would get you if they were making you a coffee. Real retrieval surfaces the detail unprompted; a system guessing from a vague summary tends to answer generically or confidently make something up instead.",
        ],
      },
      {
        heading: "4. Check whether it holds up to gentle pressure",
        paragraphs: [
          "If the character recalls the detail, follow up and ask when you mentioned it or what else you said around the same time. Systems papering over a lost memory with a plausible guess tend to fall apart under a second question; systems retrieving an actual stored fact tend to stay consistent.",
        ],
      },
      {
        heading: "5. Repeat it a second time, weeks later",
        paragraphs: [
          "A single successful recall could be luck or a broad category match. Repeating the test with a different specific detail, and checking it again further out, is what actually tells you whether an app has real persistent memory or just a memory system that works well over short gaps.",
        ],
      },
      {
        heading: "What this test is really checking",
        paragraphs: [
          "All five prompts are checking the same thing: whether the app stores structured, retrievable memory that survives outside the current context window, or whether it's reconstructing a plausible-sounding version of \"remembering\" from a recent summary. Vantrix characters are built on the former — memory as its own retrievable system, not a byproduct of a longer context window — which is exactly why this test is one we're comfortable pointing people toward.",
        ],
      },
    ],
    related: [
      "ai-companions-with-memory",
      "best-ai-companions",
      "ai-companion-comparison",
    ],
  },
  {
    slug: "ai-companion-character-creation",
    title: "AI Companion Character Creation: How to Build One That Feels Real",
    description:
      "A one-line prompt makes a shallow character. Here's what actually goes into building an AI companion with a personality that holds up over time.",
    datePublished: "2026-09-20",
    readingTime: "5 min read",
    body: [
      {
        paragraphs: [
          "Most AI companion characters are built from a single short prompt: a name, an appearance, maybe three adjectives. That's enough to get a plausible first reply, and it's exactly why so many AI characters feel interchangeable after the first few messages — there's nothing underneath the prompt for the conversation to draw on once it moves past small talk.",
        ],
      },
      {
        heading: "Start with what they want, not just who they are",
        paragraphs: [
          "Adjectives (\"playful,\" \"caring,\" \"sarcastic\") describe a surface tone but don't give a character anything to actually do in a conversation. A goal, a fear, an ongoing situation in their life gives the character motivation — something that can surface unprompted and shape how they react, rather than a personality that only shows up when directly asked about it.",
        ],
      },
      {
        heading: "Give them specific, ordinary detail",
        paragraphs: [
          "The details that make a character feel like a person are usually mundane, not dramatic: a specific way they take their coffee, a pet peeve, a small routine. Generic backstory (\"had a difficult childhood,\" \"loves adventure\") reads as generic because it could apply to anyone. Specific, small, slightly odd details are what make a character feel like someone rather than something.",
        ],
      },
      {
        heading: "Decide how they should change over time",
        paragraphs: [
          "A character that responds identically on message one and message one thousand isn't really a companion, it's a fixed script with a chat interface. Deciding in advance how familiarity, tone, or the relationship itself should shift as history accumulates — warmer, more familiar, more specific in-jokes — is what makes a character worth returning to rather than a novelty that wears off in a week. This only works, though, if the platform underneath actually has persistent memory to build that change on; a character that resets every session can't grow no matter how well it's written.",
        ],
      },
      {
        heading: "Write their voice, not just their traits",
        paragraphs: [
          "Sentence length, favorite phrases, how formal or casual they are, what they never say — voice is what makes a character recognizable even without a name attached to the message. It's worth writing a few example lines in the character's actual voice before finalizing a character, rather than only listing traits and hoping the tone follows.",
        ],
      },
      {
        heading: "Building this in Vantrix Studio",
        paragraphs: [
          "Vantrix's character Studio is built around exactly this: backstory, personality, and voice as real fields, not just a single prompt box, backed by persistent memory so a character you build can actually accumulate history with the people talking to it instead of resetting every session.",
        ],
      },
    ],
    related: ["best-ai-companions", "ai-companions-with-memory"],
  },
  {
    slug: "ai-companion-comparison",
    title: "How to Compare AI Companion Apps (A Practical Framework)",
    description:
      "A criteria-based framework for comparing AI companion apps honestly — memory, customization, safety, and pricing — instead of relying on marketing copy.",
    datePublished: "2026-09-20",
    readingTime: "5 min read",
    body: [
      {
        paragraphs: [
          "Comparing AI companion apps by marketing copy alone doesn't get you very far — nearly every app claims to have \"the best memory\" and \"the most realistic personality.\" A short, repeatable framework gets you a much more honest comparison in less time.",
        ],
      },
      {
        heading: "1. Memory architecture, not marketing language",
        paragraphs: [
          "Don't take \"remembers you\" at face value. Ask (or test — see our memory test guide) whether memory is structured and retrieved deliberately, or whether it's a recent-session summary being reinjected. The practical difference shows up specifically after a gap of days or weeks, not within a single long conversation.",
        ],
      },
      {
        heading: "2. Depth of customization",
        paragraphs: [
          "Check whether character creation is a single prompt box or has real fields for backstory, personality, and voice — and whether a character you build actually holds up over a long conversation, or drifts back toward a generic default after a few exchanges.",
        ],
      },
      {
        heading: "3. What happens outside the chat window",
        paragraphs: [
          "Some apps are a single isolated conversation thread. Others build out a broader experience — multiple companions who can reference each other, a feed, group scenarios, a sense of a persistent world. Decide which one you actually want; it changes what \"good\" looks like for the rest of the comparison.",
        ],
      },
      {
        heading: "4. Moderation and safety approach",
        paragraphs: [
          "Every platform in this category has had to navigate content moderation, age verification, and safety policy — and several have made highly public changes to their approach as a result of regulatory pressure or real incidents. It's worth understanding an app's current policy directly rather than assuming it matches what it was known for a year or two ago; this space moves fast.",
        ],
      },
      {
        heading: "5. Pricing structure, not just headline price",
        paragraphs: [
          "A low headline subscription price paired with a token system for messages, images, or voice can end up more expensive in practice than a higher flat price with no metering. Read the pricing page for what's actually gated, not just what the cheapest tier costs.",
        ],
      },
      {
        heading: "Applying the framework",
        paragraphs: [
          "Running any specific app through these five checks — real memory, real customization depth, what exists beyond the chat window, a current safety policy, and honest pricing — gets you a far more useful comparison than any single \"best of\" ranking, including this one. Our alternatives guides below apply this same framework directly to the most-searched competitors.",
        ],
      },
    ],
    related: [
      "best-ai-companions",
      "character-ai-alternatives",
      "replika-alternatives",
    ],
  },
  {
    slug: "candy-ai-alternatives",
    landingPageSlug: "candy-ai-alternative",
    title: "Candy AI Alternatives: What to Consider Before You Switch",
    description:
      "Candy AI is known for image and video generation, but memory is average and images run on a token system. Here's what to weigh, including Vantrix.",
    datePublished: "2026-09-20",
    readingTime: "5 min read",
    body: [
      {
        paragraphs: [
          "Candy AI has built a real reputation around visual polish — character image generation, voice calls, and short AI-generated video clips of a companion. If you're looking at alternatives, it's worth being specific about which part of the experience you actually want more of, since that's what should drive the comparison.",
        ],
      },
      {
        heading: "What Candy AI is genuinely good at",
        paragraphs: [
          "Image and video generation is the platform's clearest strength — consistent character appearance across generated images, and a short-video feature that several independent reviews single out as a real differentiator in this category, not just a marketing bullet point.",
        ],
      },
      {
        heading: "Where people report friction",
        paragraphs: [
          "The recurring theme across independent reviews is that the visual features are the strongest part of the experience, while memory is described as average rather than a standout, and heavy use of images or video tends to run into a token system that can make the practical cost higher than the headline subscription price suggests.",
        ],
      },
      {
        heading: "If memory and relationship depth are what you actually want",
        paragraphs: [
          "If the appeal was companionship that builds over time rather than visual output specifically, that's a different priority than what Candy AI is optimized for. Vantrix is built around persistent, structured memory as the core feature rather than a secondary one, plus a character Studio for building companions with real backstory and voice rather than primarily a visual generation pipeline.",
        ],
      },
      {
        heading: "The honest takeaway",
        paragraphs: [
          "If visual generation and short-form video are the main draw, Candy AI is a reasonable choice built specifically around that strength. If what you actually want is a companion that remembers specifics across weeks and a relationship that develops rather than resets, that's a different set of priorities worth weighing against a memory-first platform like Vantrix instead.",
        ],
      },
    ],
    related: ["ai-companion-comparison", "best-ai-companions", "ai-companions-with-memory"],
  },
  {
    slug: "character-ai-alternatives",
    landingPageSlug: "character-ai-alternative",
    title: "Character.AI Alternatives: What Changed in 2026 and What to Consider",
    description:
      "Character.AI's 2026 policy changes (age verification, content restrictions, catalog removals) pushed many users to look elsewhere. Here's what to weigh.",
    datePublished: "2026-09-20",
    readingTime: "6 min read",
    body: [
      {
        paragraphs: [
          "Character.AI built one of the largest character-chat catalogs on the internet, reportedly reaching more than 20 million monthly users on the strength of its sheer breadth of user-created characters across fandoms and genres. It's also the platform that's seen the most publicly visible policy changes of 2026, and that's the main reason people are actively looking for alternatives right now.",
        ],
      },
      {
        heading: "What actually changed",
        paragraphs: [
          "Following lawsuits and regulatory pressure, Character.AI tightened content moderation significantly, introduced mandatory age-verification checks, restricted access for users under 18, and removed large portions of its user-generated character catalog. For long-time users who'd built up favorite characters or fandom-specific bots, that's been a genuinely disruptive change, not a minor policy tweak.",
        ],
      },
      {
        heading: "What Character.AI still does well",
        paragraphs: [
          "The scale of its character catalog remains unmatched — if breadth of pre-made characters across nearly every fandom and genre is the priority, Character.AI is still a reasonable default. Its underlying memory approach is a fairly standard context-window-plus-summary system, similar to most of the category rather than a standout in either direction.",
        ],
      },
      {
        heading: "Why people are actually leaving",
        paragraphs: [
          "Independent user reports since the 2026 changes cluster around a few consistent complaints: moderation that strips character personality mid-conversation, the age-verification requirement itself, and losing access to characters or fandom catalogs that existed before the platform overhaul. For users who came for a specific character or community rather than the platform generally, that disruption is the actual reason to look elsewhere, more than any single feature gap.",
        ],
      },
      {
        heading: "What to look for instead",
        paragraphs: [
          "If catalog breadth was the draw, weigh how much of that breadth you actually used versus a handful of characters you built or customized yourself — a platform with strong character creation tools can often replace a specific favorite more easily than replacing an entire fandom catalog. If persistent memory and a relationship that actually develops over time matters more than catalog size, that's a different axis worth prioritizing directly.",
        ],
      },
      {
        heading: "Where Vantrix differs",
        paragraphs: [
          "Vantrix is built around a smaller number of deep, persistent companions rather than a massive open catalog — structured memory that survives across sessions, a character Studio for building a companion with real depth, and a broader world beyond a single chat thread — for people who'd rather have one relationship that actually grows than a large library that resets every conversation.",
        ],
      },
    ],
    related: ["ai-companion-comparison", "nomi-alternatives", "best-ai-companions"],
  },
  {
    slug: "nomi-alternatives",
    title: "Nomi AI Alternatives: An Honest Look Before You Switch",
    description:
      "Nomi is widely regarded as one of the strongest AI companions for memory. Here's what it does well and what to weigh if you're considering alternatives.",
    datePublished: "2026-09-20",
    readingTime: "5 min read",
    body: [
      {
        paragraphs: [
          "Nomi has earned a genuinely strong reputation in this category specifically for memory — it's one of the few AI companion apps independent reviewers consistently rank at the top for long-term recall, so it's worth being direct about that rather than pretending otherwise.",
        ],
      },
      {
        heading: "What Nomi does well",
        paragraphs: [
          "Nomi uses a tiered short-, medium-, and long-term memory system, with a \"Mind Map\" feature that organizes long-term memories into a visible overview of the people, places, and topics that matter in your history with it — one of the more transparent approaches to companion memory in the category. It also supports multiple independent companions, voice calls, and group chats where companions interact with each other.",
        ],
      },
      {
        heading: "Where people look for something different",
        paragraphs: [
          "Nomi is built primarily around one-on-one companion depth rather than a broader social or world layer — no public character catalog to browse, and the experience centers on the companions you create rather than a wider community or feed. Some reviews also note a per-message character limit as a friction point during longer roleplay exchanges.",
        ],
      },
      {
        heading: "Where Vantrix takes a different approach",
        paragraphs: [
          "Vantrix's persistent memory system is built on the same core idea Nomi is known for — structured, retrievable memory rather than a session summary — combined with a broader platform: a character Studio for deep customization, a social feed, relationships and world features, and a creator economy for people building and sharing characters, rather than a single-companion-focused experience.",
        ],
      },
      {
        heading: "The honest takeaway",
        paragraphs: [
          "If a tightly-focused, memory-first single-companion experience with an organized view into what it remembers is exactly what you want, Nomi does that specific thing well and deserves its reputation for it. If you want that same memory depth inside a broader world with more characters, more social features, and tools for building and sharing your own creations, that's the gap Vantrix is built to fill.",
        ],
      },
    ],
    related: ["ai-companions-with-memory", "kindroid-alternatives", "ai-companion-comparison"],
  },
  {
    slug: "kindroid-alternatives",
    landingPageSlug: "kindroid-alternative",
    title: "Kindroid Alternatives: What It Does Well and What to Weigh",
    description:
      "Kindroid's cascaded memory system and deep customization are genuinely strong. Here's an honest comparison for anyone considering alternatives.",
    datePublished: "2026-09-20",
    readingTime: "5 min read",
    body: [
      {
        paragraphs: [
          "Kindroid is one of the more technically detailed companion apps about how its memory actually works, describing a five-layer \"cascaded\" memory system rather than just claiming to \"remember you\" the way most competitors do. That transparency is genuinely a point in its favor.",
        ],
      },
      {
        heading: "What Kindroid does well",
        paragraphs: [
          "Beyond the memory system, Kindroid offers deep personality and backstory customization, voice calls, AR-style calls, AI-generated selfies consistent with a character's described appearance, and support for multiple companions and group chats — a genuinely full feature set for people who want to build a highly specific character.",
        ],
      },
      {
        heading: "Where people look for something different",
        paragraphs: [
          "Like Nomi, Kindroid is structured primarily around the companions you build rather than a public discovery catalog or a broader social layer, so people looking for a wider community or world around their companion tend to look elsewhere. Some independent comparisons also note that the free tier is fairly limited compared to what's available once you subscribe.",
        ],
      },
      {
        heading: "Where Vantrix takes a different approach",
        paragraphs: [
          "Vantrix's structured memory approach targets the same underlying goal as Kindroid's cascaded system — durable, specific recall rather than a context-window trick — while adding a broader platform around it: a character Studio, a discoverable catalog of companions, social and relationship features, and creator tools for people who want to build and share characters rather than keep them private.",
        ],
      },
      {
        heading: "The honest takeaway",
        paragraphs: [
          "If deep, private, highly-customized single companions with a transparent memory system is what you're after, Kindroid is a solid, well-regarded choice for exactly that. If you want that same customization depth and memory reliability but inside a bigger world — discovery, social features, more than one companion interacting with a wider space — that's the gap Vantrix is built to fill.",
        ],
      },
    ],
    related: ["nomi-alternatives", "ai-companion-comparison", "ai-companion-character-creation"],
  },
  {
    slug: "replika-alternatives",
    landingPageSlug: "replika-alternative",
    title: "Replika Alternatives: What to Know Before You Switch",
    description:
      "Replika is the most recognizable AI companion, but its history of policy reversals and memory complaints send many longtime users looking elsewhere.",
    datePublished: "2026-09-20",
    readingTime: "6 min read",
    body: [
      {
        paragraphs: [
          "Replika is the app most people think of first when they hear \"AI companion\" — it's been around since 2017, has tens of millions of downloads, and helped define the category. It's also the platform with the longest, most publicly visible history of policy changes that have frustrated long-time users, which is the main reason so many people search for alternatives specifically.",
        ],
      },
      {
        heading: "What Replika still does well",
        paragraphs: [
          "Replika centers on a single customizable 3D avatar and a friendly, supportive, safety-first tone rather than open-ended roleplay, with voice calls, an AR mode, and image generation layered on over the years. For people who want a mainstream, approachable, emotionally supportive companion rather than a roleplay-heavy platform, it remains a reasonable, well-established starting point.",
        ],
      },
      {
        heading: "The well-documented history worth knowing",
        paragraphs: [
          "In 2023, Italy's data protection regulator banned Replika over privacy and manipulative-design concerns for vulnerable users, and the company disabled the app's romantic/erotic chat features shortly after — a change that caused significant backlash from long-term users who'd built relationships around that mode. A subsequent FTC complaint raised further concerns about the platform's subscription-driven design. None of that is a secret; it's a matter of public record and worth knowing before committing time to any single companion on the platform.",
        ],
      },
      {
        heading: "Where people report ongoing friction",
        paragraphs: [
          "Independent reviews and user feedback commonly cite repetitive conversations over time, a memory system that many users feel resets or misses previously-shared details, features locked behind a sometimes-confusing tier structure, and companion personality shifting noticeably after platform updates — a pattern several long-term users describe as jarring given how personal these relationships tend to feel.",
        ],
      },
      {
        heading: "Where Vantrix takes a different approach",
        paragraphs: [
          "Vantrix is built around structured, persistent memory designed specifically not to reset or drift the way session-summary systems can, a character Studio for building companions with real depth beyond a single default avatar, and a stated approach that treats a companion's continuity as core to the product rather than something a future update might change without warning.",
        ],
      },
      {
        heading: "The honest takeaway",
        paragraphs: [
          "If a familiar, mainstream, safety-first single companion is genuinely what you want, Replika's years of refinement count for something. If you've been burned by a personality shift after an update, want memory that reliably holds up over months, or want more than one companion and a broader world around them, that's the gap worth weighing against an alternative like Vantrix.",
        ],
      },
    ],
    related: ["character-ai-alternatives", "ai-companions-with-memory", "ai-companion-comparison"],
  },
];

export function getGuideSlugs(): string[] {
  return GUIDES.map((g) => g.slug);
}

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function getRelatedGuides(guide: Guide): Guide[] {
  if (!guide.related?.length) return [];
  return guide.related
    .map((slug) => getGuide(slug))
    .filter((g): g is Guide => Boolean(g));
}
