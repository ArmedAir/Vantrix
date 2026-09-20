/**
 * Pure (no I/O, no env) twin → character affinity for the recommendation scorer.
 *
 * Takes the allowlisted match signals (humor / values / tone — see
 * digital-twin/twin-signals.ts) and asks one question per dimension: does this
 * character's tags/archetype express a concept the user's twin also expresses?
 *
 * Both sides are mapped through the SAME small concept lexicon, so a twin
 * humorStyle of "dry, sarcastic" and a character tagged "witty" meet on the
 * concept `witty` without needing identical wording. Unknown vocabulary maps
 * to no concept → zero affinity → ranking is exactly what it was before. A
 * wrong guess about vocabulary can therefore only make the feature quiet,
 * never break or skew the deck (and the blend weight is small — 8%).
 *
 * Data never leaves the server: this runs inside the deterministic scorer and
 * is deliberately NOT passed to the Groq curator (which by design only ever
 * sees tag names, archetypes and public openers).
 */
import type { TwinMatchSignals } from '../digital-twin/twin-signals';

export type Concept =
  | 'witty' | 'playful' | 'warm' | 'intellectual' | 'adventurous'
  | 'calm' | 'ambitious' | 'creative' | 'sincere' | 'mysterious';

/** Stems ≥5 chars match by prefix ("adventur" → adventurous/adventurer); shorter ones must match the whole word. */
const LEXICON: Record<Concept, string[]> = {
  witty:        ['witty', 'wit', 'wry', 'dry', 'funny', 'humorous', 'sarcasm', 'sarcastic', 'banter', 'deadpan', 'snark', 'clever', 'quip', 'teasing', 'tease'],
  playful:      ['playful', 'goofy', 'silly', 'fun', 'whimsical', 'lighthearted', 'cheeky', 'flirty', 'mischievous', 'chaos'],
  warm:         ['warm', 'caring', 'gentle', 'kind', 'supportive', 'nurturing', 'affectionate', 'tender', 'sweet', 'empathetic', 'compassion', 'wholesome', 'friendly'],
  intellectual: ['intellectual', 'thoughtful', 'philosophical', 'curious', 'curiosity', 'bookish', 'nerdy', 'analytical', 'scholar', 'learning', 'deep', 'profound'],
  adventurous:  ['adventur', 'explor', 'spontaneous', 'travel', 'bold', 'daring', 'thrill'],
  calm:         ['calm', 'steady', 'grounded', 'patient', 'serene', 'quiet', 'mellow', 'peaceful', 'chill', 'cozy', 'relaxed', 'laid'],
  ambitious:    ['ambitious', 'ambition', 'driven', 'determined', 'disciplined', 'hustle'],
  creative:     ['creative', 'creativity', 'artistic', 'artist', 'art', 'poet', 'poetic', 'music', 'musical', 'imaginative', 'dreamer'],
  sincere:      ['loyal', 'honest', 'honesty', 'sincere', 'authentic', 'genuine', 'faithful', 'integrity'],
  mysterious:   ['mysterious', 'brooding', 'enigmatic', 'aloof', 'secretive'],
};

const STEM_INDEX: { stem: string; concept: Concept; prefix: boolean }[] = (
  Object.entries(LEXICON) as [Concept, string[]][]
).flatMap(([concept, stems]) => stems.map(stem => ({ stem, concept, prefix: stem.length >= 5 })));

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

export function conceptsOf(texts: readonly (string | null | undefined)[]): Set<Concept> {
  const out = new Set<Concept>();
  for (const text of texts) {
    if (!text) continue;
    for (const token of tokenize(text)) {
      for (const { stem, concept, prefix } of STEM_INDEX) {
        if (token === stem || (prefix && token.startsWith(stem))) out.add(concept);
      }
    }
  }
  return out;
}

export type TwinDimension = 'humor' | 'values' | 'tone';

/** What each dimension is worth when it hits. Sum = 100. Humor + values are the signals users read as "we'd click". */
const DIMENSION_WEIGHT: Record<TwinDimension, number> = { humor: 45, values: 35, tone: 20 };

/** Blend weight inside the dating/"For You" scorer. Taken out of the flat 20% floor, so total weight stays 1.0. */
export const TWIN_AFFINITY_WEIGHT = 0.08;
const FLOOR_WEIGHT = 0.20;

export interface TwinAffinity {
  /** 0–100. */
  score: number;
  /** The strongest matching dimension, or null when nothing overlapped. */
  dominant: TwinDimension | null;
}

export function twinAffinity(
  signals: TwinMatchSignals,
  char: { tags: string[] | null; archetype: string | null },
): TwinAffinity {
  const charConcepts = conceptsOf([...(char.tags ?? []), char.archetype]);
  if (charConcepts.size === 0) return { score: 0, dominant: null };

  let score = 0;
  let dominant: TwinDimension | null = null;
  for (const dim of ['humor', 'values', 'tone'] as const) {
    const twinConcepts = conceptsOf(signals[dim]);
    const hit = [...twinConcepts].some(c => charConcepts.has(c));
    if (!hit) continue;
    score += DIMENSION_WEIGHT[dim];
    if (dominant === null) dominant = dim; // iteration order is weight order
  }
  return { score: Math.min(100, score), dominant };
}

/**
 * The floor + twin term of the final blend. With no twin (null) this is exactly
 * the historical `50 * 0.20`, so users without an opted-in twin are ranked
 * byte-for-byte as before.
 */
export function twinBlend(tw: TwinAffinity | null): number {
  if (!tw) return 50 * FLOOR_WEIGHT;
  return 50 * (FLOOR_WEIGHT - TWIN_AFFINITY_WEIGHT) + tw.score * TWIN_AFFINITY_WEIGHT;
}

/** User-facing "why" — only for humor/values hits; a tone-only overlap is too thin to claim. */
export function twinReason(tw: TwinAffinity | null): string | null {
  if (!tw) return null;
  if (tw.dominant === 'humor')  return 'Matches your sense of humor';
  if (tw.dominant === 'values') return 'Shares what you value';
  return null;
}
