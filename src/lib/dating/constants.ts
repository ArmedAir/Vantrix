/**
 * Dating constants — client-safe.
 *
 * CHAT-CRASH-FIX: these were previously only exported from engine.ts, which
 * also imports @/lib/supabase/server (uses next/headers — server-only) and
 * @/lib/logger (imports Node's async_hooks at module scope). Two client
 * components — character-insights-panel.tsx (rendered inside the chat
 * route's ChatWindow) and gift-shop.tsx — imported these pure constants
 * directly from engine.ts, pulling that whole server-only chain into the
 * browser bundle. In the browser, `new AsyncLocalStorage()` isn't a real
 * constructor (just a webpack polyfill stub), which threw and crashed the
 * chunk — the "Page error" on /chat/[id].
 *
 * These values have zero server dependencies, so they live here now.
 * engine.ts re-exports them so every existing server-side import keeps
 * working unchanged.
 */

export const MILESTONE_FLAGS = {
  first_chat:   1,
  deep_talk:    2,
  first_gift:   4,
  week_streak:  8,
  soulmate:     16,
  first_date:   32,
} as const;

// ── First Dates catalogue ───────────────────────────────────────────────
// Each date type is a structured experience (Feature 12): the user picks
// one, the AI generates an opening scene in the character's voice grounded
// in relationship context, and the date produces a real memory. Tier-gated
// the same way gifts are — deeper dates unlock as the bond grows, so
// "adventure"/"custom" aren't available to a match still at 'spark'.
export const DATE_CATALOGUE = [
  { type: 'cafe',        name: 'Quiet Café',       emoji: '\u2615', tokens: 20,  tier: 'spark',    mood: 'cozy and unhurried' },
  { type: 'walk',        name: 'Night Walk',       emoji: '\u{1F303}', tokens: 20,  tier: 'spark',    mood: 'easy, low-key, conversational' },
  { type: 'gallery',     name: 'Art Gallery',      emoji: '\u{1F5BC}\uFE0F', tokens: 30,  tier: 'spark',    mood: 'curious and a little playful' },
  { type: 'dinner',      name: 'Dinner',           emoji: '\u{1F37D}\uFE0F', tokens: 40,  tier: 'flame',    mood: 'warm, a bit more intentional' },
  { type: 'live_music',  name: 'Live Music',       emoji: '\u{1F3B6}', tokens: 40,  tier: 'flame',    mood: 'energetic, close, a little loud' },
  { type: 'beach',       name: 'Beach at Sunset',  emoji: '\u{1F3D6}\uFE0F', tokens: 45,  tier: 'flame',    mood: 'slow, sensory, reflective' },
  { type: 'adventure',   name: 'Spontaneous Adventure', emoji: '\u{1F5FA}\uFE0F', tokens: 55, tier: 'deep', mood: 'bold, unplanned, alive' },
  { type: 'custom',      name: 'Something Else',   emoji: '\u2728', tokens: 35,  tier: 'flame',    mood: 'open-ended — follow the user\'s lead' },
] as const;

export type DateType = typeof DATE_CATALOGUE[number]['type'];

/** Same unlock rule as gifts: a date type is available once the match tier
 *  has reached (or passed) the tier it's assigned to. */
export function isDateUnlocked(dateTier: string, matchTier: string): boolean {
  const dateIdx  = DATING_TIER_ORDER.indexOf(dateTier as DatingMatchTier);
  const matchIdx = DATING_TIER_ORDER.indexOf(matchTier as DatingMatchTier);
  if (dateIdx === -1 || matchIdx === -1) return false;
  return matchIdx >= dateIdx;
}

// Gift tier labels map to dating match tiers (spark  flame  deep  soulmate)
// Locked gifts are visible in the shop but cannot be purchased until tier is reached.
export const GIFT_CATALOGUE = [
  // ── Everyday gifts (10–50t) ─────────────────────────────────────────────
  { type: 'rose',          name: 'Red Rose',              emoji: '\u{1F339}', bond: 5,  tokens: 10,   tier: 'spark',    rarity: 'common'    },
  { type: 'letter',        name: 'Love Letter',           emoji: '\u{1F48C}', bond: 8,  tokens: 15,   tier: 'spark',    rarity: 'common'    },
  { type: 'chocolate',     name: 'Box of Chocolates',     emoji: '\u{1F36B}', bond: 6,  tokens: 12,   tier: 'spark',    rarity: 'common'    },
  { type: 'coffee',        name: 'Morning Coffee',        emoji: '\u2615', bond: 4,  tokens: 8,    tier: 'spark',    rarity: 'common'    },
  { type: 'playlist',      name: 'Curated Playlist',      emoji: '\u{1F3B5}', bond: 7,  tokens: 14,   tier: 'spark',    rarity: 'common'    },
  { type: 'book',          name: 'Favourite Book',        emoji: '\u{1F4D6}', bond: 9,  tokens: 18,   tier: 'spark',    rarity: 'common'    },
  { type: 'flower_crown',  name: 'Flower Crown',          emoji: '\u{1F33C}', bond: 8,  tokens: 16,   tier: 'spark',    rarity: 'common'    },
  { type: 'movie_ticket',  name: 'Movie Date Tickets',    emoji: '\u{1F3AC}', bond: 10, tokens: 20,   tier: 'spark',    rarity: 'common'    },
  { type: 'handwritten',   name: 'Handwritten Note',      emoji: '\u{1F4DD}', bond: 11, tokens: 22,   tier: 'spark',    rarity: 'common'    },
  { type: 'sunflower',     name: 'Sunflower Bunch',       emoji: '\u{1F33B}', bond: 6,  tokens: 11,   tier: 'spark',    rarity: 'common'    },
  { type: 'sticker_pack',  name: 'Cute Sticker Pack',     emoji: '\u{1F31F}', bond: 5,  tokens: 9,    tier: 'spark',    rarity: 'common'    },
  { type: 'bubble_tea',    name: 'Bubble Tea',            emoji: '\u{1F9CB}', bond: 5,  tokens: 9,    tier: 'spark',    rarity: 'common'    },
  { type: 'compliment',    name: 'Genuine Compliment',    emoji: '\u{1F60A}', bond: 4,  tokens: 6,    tier: 'spark',    rarity: 'common'    },
  { type: 'good_morning',  name: 'Good Morning Text',     emoji: '\u2600\uFE0F', bond: 4,  tokens: 6,    tier: 'spark',    rarity: 'common'    },
  { type: 'inside_joke',   name: 'Inside Joke Callback',  emoji: '\u{1F602}', bond: 7,  tokens: 13,   tier: 'spark',    rarity: 'common'    },
  // ── Special gifts (75–200t) ─────────────────────────────────────────────
  { type: 'teddy',         name: 'Teddy Bear',            emoji: '\u{1F9F8}', bond: 12, tokens: 25,   tier: 'flame',    rarity: 'special'   },
  { type: 'perfume',       name: 'Luxury Perfume',        emoji: '\u{1F9F4}', bond: 15, tokens: 35,   tier: 'flame',    rarity: 'special'   },
  { type: 'poem',          name: 'Original Poem',         emoji: '\u{1FAB6}', bond: 20, tokens: 50,   tier: 'flame',    rarity: 'special'   },
  { type: 'jewellery',     name: 'Gold Necklace',         emoji: '\u{1F4FF}', bond: 22, tokens: 75,   tier: 'flame',    rarity: 'special'   },
  { type: 'photo_album',   name: 'Custom Photo Album',    emoji: '\u{1F4F8}', bond: 25, tokens: 90,   tier: 'flame',    rarity: 'special'   },
  { type: 'custom_song',   name: 'Custom Song',           emoji: '\u{1F3A4}', bond: 28, tokens: 120,  tier: 'flame',    rarity: 'special'   },
  { type: 'stargazing',    name: 'Stargazing Date',       emoji: '\u{1F52D}', bond: 28, tokens: 110,  tier: 'flame',    rarity: 'special'   },
  { type: 'love_letter',   name: 'Love Letter by Hand',   emoji: '\u2709\uFE0F', bond: 30, tokens: 130,  tier: 'flame',    rarity: 'special'   },
  { type: 'outfit_change', name: 'Outfit Change Request', emoji: '\u{1F457}', bond: 18, tokens: 45,   tier: 'flame',    rarity: 'special'   },
  { type: 'dance_request', name: 'Dance For Me',          emoji: '\u{1F483}', bond: 20, tokens: 55,   tier: 'flame',    rarity: 'special'   },
  { type: 'voice_note',    name: 'Personal Voice Note',   emoji: '\u{1F3A7}', bond: 24, tokens: 85,   tier: 'flame',    rarity: 'special'   },
  { type: 'weekend_trip',  name: 'Weekend Getaway',       emoji: '\u{1F9F3}', bond: 26, tokens: 100,  tier: 'flame',    rarity: 'special'   },
  // ── Legendary gifts (500–2000t) ─────────────────────────────────────────
  { type: 'ring',          name: 'Diamond Ring',          emoji: '\u{1F48D}', bond: 35, tokens: 500,  tier: 'soulmate', rarity: 'legendary' },
  { type: 'private_island','name': 'Private Island Day',  emoji: '\u{1F3DD}\uFE0F', bond: 40, tokens: 1000, tier: 'soulmate', rarity: 'legendary' },
  { type: 'named_star',    name: 'Named Star',            emoji: '\u2B50', bond: 38, tokens: 750,  tier: 'soulmate', rarity: 'legendary' },
  { type: 'music_box',     name: 'Handcrafted Music Box', emoji: '\u{1F3B6}', bond: 36, tokens: 600,  tier: 'soulmate', rarity: 'legendary' },
  { type: 'eternal_letter','name': 'Letter She Keeps Forever', emoji: '\u{1F49E}', bond: 45, tokens: 2000, tier: 'soulmate', rarity: 'legendary' },
  { type: 'proposal_trip', name: 'Surprise Proposal Trip', emoji: '\u{1F48D}', bond: 42, tokens: 1200, tier: 'soulmate', rarity: 'legendary' },
  { type: 'anniversary',   name: 'Anniversary Celebration', emoji: '\u{1F942}', bond: 37, tokens: 650,  tier: 'soulmate', rarity: 'legendary' },
] as const;

export type GiftType = typeof GIFT_CATALOGUE[number]['type'];
export type GiftRarity = 'common' | 'special' | 'legendary';

// Tier ordering for lock enforcement
export const DATING_TIER_ORDER = ['spark', 'flame', 'deep', 'soulmate'] as const;
export type DatingMatchTier = typeof DATING_TIER_ORDER[number];

/**
 * Check if a gift is unlocked for the current match tier.
 * Locked gifts are visible in the shop but cannot be purchased.
 */
export function isGiftUnlocked(giftTier: string, matchTier: string): boolean {
  const giftIdx  = DATING_TIER_ORDER.indexOf(giftTier as DatingMatchTier);
  const matchIdx = DATING_TIER_ORDER.indexOf(matchTier as DatingMatchTier);
  if (giftIdx === -1 || matchIdx === -1) return false;
  return matchIdx >= giftIdx;
}

/**
 * Display labels for DATING_TIER_ORDER. Frontend-only concern (the API
 * never needs a human label), but lives here rather than duplicated per
 * component — match-card.tsx and gift-picker.tsx both need it and a
 * second hand-copied map is exactly the kind of drift the *-FIX comments
 * elsewhere in this file are already warning about.
 */
export const DATING_TIER_LABELS: Record<DatingMatchTier, string> = {
  spark: 'Spark',
  flame: 'Flame',
  deep: 'Deep',
  soulmate: 'Soulmate',
};
