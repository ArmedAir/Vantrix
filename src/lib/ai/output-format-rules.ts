/**
 * output-format-rules.ts
 *
 * Two small, always-on writing rules that apply to every character
 * regardless of speech_style, archetype, or roleplay system:
 *
 *   1. No dashes. Character replies should never use an em dash (—),
 *      en dash (–), or a hyphen used as a sentence-break/pause (" - ").
 *      Use a period, comma, or just a new sentence instead. Hyphens
 *      inside an actual compound word (well-known, one-on-one) are fine;
 *      it's dash-as-punctuation that's banned.
 *   2. When recalling or referencing something from earlier in the same
 *      conversation (memory tests, callbacks, "you remember when..."),
 *      never reuse the exact same sentence or phrasing already used
 *      earlier in this conversation to describe that same thing. Say it
 *      a new way each time.
 *
 * Imported into prompt.ts and pushed as its own section, same pattern as
 * CONVERSATIONAL_TECHNIQUE_BLOCK / DEEP_LISTENING_BLOCK etc.
 */

/**
 * Safety-net cleanup for the "no dashes" rule above. The prompt rule
 * handles this the vast majority of the time; this is a cheap regex pass
 * over the finished reply (same pattern as stripLeakedMeta() in
 * chat/stream/route.ts) for the rare case the model uses one anyway.
 *
 * Only touches em dash / en dash, and a hyphen that's clearly standing in
 * for a sentence break (surrounded by spaces: "word - word"). Leaves
 * ordinary compound-word hyphens (well-known, one-on-one) untouched.
 */
export function stripDashPunctuation(text: string): string {
  if (!text) return text;
  return text
    // Em dash / en dash used as a pause or clause break -> period + space,
    // then re-capitalize what follows so it reads as a new sentence.
    .replace(/\s*[—–]\s*/g, (match, offset, str) => {
      const after = str.slice(offset + match.length);
      return after.trim().length ? '. ' : ' ';
    })
    // " - " (space-hyphen-space) used the same way, not a compound word.
    .replace(/\s+-\s+/g, ', ')
    // Fix any resulting double punctuation/capitalization artifacts from
    // the replacement above (". ." -> ".", stray ", ." -> ".").
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*\./g, '.');
}

export const OUTPUT_FORMAT_RULES_BLOCK = `
── Writing Rules (always on) ──
- Never use an em dash (—), en dash (–), or a hyphen used as punctuation to break up a sentence (word - word). Write it as two sentences, or use a comma, instead. Hyphens inside a genuine compound word (well-known, one-on-one, check-in) are fine, that's not what this rule means.
- When you bring up or recall something from earlier in this conversation, whether it's a memory test, a callback, or just "remember when...", never repeat the exact sentence or phrasing you already used earlier to describe that same thing. Find a new way to say it each time, the way a real person naturally varies how they retell something.`.trim();
