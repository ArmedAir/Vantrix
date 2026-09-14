// src/lib/social/composer.ts
// ─────────────────────────────────────────────────────────────────────────────
// Builds final tweet text from a character_posts caption (or standalone
// copy): appends a UTM-tagged link back to the character's page, then trims
// the caption — never the link — to fit X's 280-character limit.
//
// Length accounting note: X wraps every link in a tweet through its t.co
// shortener and counts it as a FIXED 23 characters toward the 280-char
// limit, regardless of the link's real length (this has been true since
// t.co launched and hasn't changed). That's why this module reserves a
// constant TCO_LINK_WEIGHT for the link rather than the UTM URL's actual
// (much longer) character count — reserving the real length would
// needlessly truncate captions far more than X actually requires.
//
// Caption text here is always plain, character-authored English (see
// character-feed.ts's template pools / AI captions) — this module counts
// JS string length (UTF-16 code units) as a close-enough proxy for X's own
// grapheme-based counter, which is accurate for the plain-ASCII/Latin
// captions this pipeline produces but would under/over-count emoji or CJK
// text. Not a concern today; worth revisiting if captions ever include
// heavy emoji use.
// ─────────────────────────────────────────────────────────────────────────────

import { env } from '@/env';

export const TWEET_MAX_LENGTH = 280;
const TCO_LINK_WEIGHT = 23;
const ELLIPSIS = '…';

export interface ComposeTweetInput {
  characterId: string;
  caption: string;
  /** Defaults to 'x' — lets a future second auto-post channel reuse this composer with its own utm_source. */
  utmSource?: string;
}

export interface ComposedTweet {
  text: string;
  link: string;
  /** Character count of `text` with the link normalized to its t.co weight — what X actually measures against the 280 limit. */
  weightedLength: number;
  truncated: boolean;
}

/**
 * Builds the character's public page URL with cross-post UTM params.
 *
 * OUTSIDE-THE-APP FIX: this pointed at `/characters/${characterId}` — the
 * (app)-group, auth-gated detail page — for every tweet this pipeline has
 * ever auto-posted (see auto-select.ts's cron caller). Every click from an
 * anonymous X timeline hit (app)/layout.tsx's session redirect and landed
 * on a bare /login with no idea which character the tweet was even about:
 * exactly the class of bug fixed on the in-app Share button
 * (share-profile-button.tsx) and the viral share-card pages
 * (app/share/[id]/page.tsx) — this is the same bug in the one channel
 * that's aimed at a 100% logged-out audience by design, so it's the
 * highest-stakes instance of it. /companions/${characterId}
 * ((seo)/companions/[id]/page.tsx) is the public, unauthenticated,
 * OG-tagged equivalent and is what every other outward-facing surface in
 * this app now links to for the same character.
 */
export function buildCharacterLink(characterId: string, utmSource = 'x'): string {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return `${base}/companions/${characterId}?utm_source=${utmSource}&utm_medium=social&utm_campaign=crosspost`;
}

/**
 * Composes final tweet text: `<trimmed caption>\n\n<link>`. The caption is
 * trimmed (word-boundary, ellipsis appended) only if the combined weighted
 * length would exceed TWEET_MAX_LENGTH — the link itself is never dropped
 * or shortened, since a cross-post with no link back defeats its purpose.
 */
export function composeTweet({ characterId, caption, utmSource }: ComposeTweetInput): ComposedTweet {
  const link = buildCharacterLink(characterId, utmSource);
  const trimmedCaption = caption.trim();

  // "\n\n" separator between caption and link costs 2 real chars; X counts
  // those normally (only the link itself gets the flat t.co weight).
  const separatorLength = 2;
  const budgetForCaption = TWEET_MAX_LENGTH - TCO_LINK_WEIGHT - separatorLength;

  if (trimmedCaption.length <= budgetForCaption) {
    const text = `${trimmedCaption}\n\n${link}`;
    return {
      text,
      link,
      weightedLength: trimmedCaption.length + separatorLength + TCO_LINK_WEIGHT,
      truncated: false,
    };
  }

  // Trim to the budget, then back off to the last whole word so we don't
  // cut mid-word, then append an ellipsis (counted against the same budget).
  const hardCut = trimmedCaption.slice(0, Math.max(0, budgetForCaption - ELLIPSIS.length));
  const lastSpace = hardCut.lastIndexOf(' ');
  const wordSafeCut = lastSpace > 0 ? hardCut.slice(0, lastSpace) : hardCut;
  const finalCaption = `${wordSafeCut.trimEnd()}${ELLIPSIS}`;

  const text = `${finalCaption}\n\n${link}`;
  return {
    text,
    link,
    weightedLength: finalCaption.length + separatorLength + TCO_LINK_WEIGHT,
    truncated: true,
  };
}
