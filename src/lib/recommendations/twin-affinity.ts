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
  intellectual: ['intellectual', 'thoughtful', 'philosophical', 'curious', 'curiosity', 'bookish', 'nerdy', 'analytical', 'scholar', 'learning', 'deep', 'profound', 'book', 'books', 'reading', 'scienc', 'scientist', 'physics', 'mathematic', 'astronom', 'history', 'philosoph', 'psycholog'],
  adventurous:  ['adventur', 'explor', 'spontaneous', 'travel', 'bold', 'daring', 'thrill', 'hiking', 'hike', 'outdoor', 'camping', 'climbing'],
  calm:         ['calm', 'steady', 'grounded', 'patient', 'serene', 'quiet', 'mellow', 'peaceful', 'chill', 'cozy', 'relaxed', 'laid'],
  ambitious:    ['ambitious', 'ambition', 'driven', 'determined', 'disciplined', 'hustle'],
  creative:     ['creative', 'creativity', 'artistic', 'artist', 'art', 'poet', 'poetic', 'poetry', 'music', 'musical', 'imaginative', 'dreamer', 'writing', 'painting', 'drawing', 'design', 'photograph', 'film'],
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

export type TwinDimension = 'humor' | 'values' | 'tone' | 'interests';

/** What each dimension is worth when it hits. Sum = 100. Humor + values are the signals users read as "we'd click". */
const DIMENSION_WEIGHT: Record<TwinDimension, number> = { humor: 35, values: 25, tone: 15, interests: 25 };
const DIMENSION_ORDER: readonly TwinDimension[] = ['humor', 'values', 'interests', 'tone'];

/**
 * Evidence needed for a full-range score. humorStyle + values only exist on
 * deep/master-trained twins, so a standard twin has fewer dimensions to score
 * on: the score is normalised over the dimensions the twin actually HAS (so a
 * standard twin can still reach 100), but damped when the evidence is thin —
 * a twin with only one weak dimension must not look like a perfect match.
 */
const FULL_CONFIDENCE_WEIGHT = 50;

const HUMOR_CONCEPTS: ReadonlySet<Concept> = new Set<Concept>(['witty', 'playful']);

/** Blend weight inside the dating/"For You" scorer. Taken out of the flat 20% floor, so total weight stays 1.0. */
export const TWIN_AFFINITY_WEIGHT = 0.08;
const FLOOR_WEIGHT = 0.20;

export interface TwinAffinity {
  /** 0–100. */
  score: number;
  /** The strongest matching dimension, or null when nothing overlapped. */
  dominant: TwinDimension | null;
}

/** Twin-side concepts per dimension, with the standard-twin humor fallback applied. */
export function twinConcepts(signals: TwinMatchSignals): Record<TwinDimension, Set<Concept>> {
  const humor = conceptsOf(signals.humor);
  const values = conceptsOf(signals.values);
  const tone = conceptsOf(signals.tone);
  const interests = conceptsOf(signals.interests);

  // Standard-trained twins have no humorStyle, but their tone phrase usually
  // says it ("dry and sarcastic", "casual and playful"). Read humor off the
  // tone — and take those concepts OUT of tone so one signal is not counted twice.
  if (humor.size === 0) {
    for (const c of tone) {
      if (HUMOR_CONCEPTS.has(c)) { humor.add(c); tone.delete(c); }
    }
  }
  return { humor, values, tone, interests };
}

export function twinAffinity(
  signals: TwinMatchSignals,
  char: { tags: string[] | null; archetype: string | null },
): TwinAffinity {
  const charConcepts = conceptsOf([...(char.tags ?? []), char.archetype]);
  if (charConcepts.size === 0) return { score: 0, dominant: null };

  const twin = twinConcepts(signals);
  let available = 0;
  let hitWeight = 0;
  let dominant: TwinDimension | null = null;
  for (const dim of DIMENSION_ORDER) {
    if (twin[dim].size === 0) continue;                 // twin has no evidence for this dimension
    available += DIMENSION_WEIGHT[dim];
    if (![...twin[dim]].some(c => charConcepts.has(c))) continue;
    hitWeight += DIMENSION_WEIGHT[dim];
    if (dominant === null) dominant = dim;              // DIMENSION_ORDER is weight order
  }
  if (available === 0 || hitWeight === 0) return { score: 0, dominant: null };

  const confidence = Math.min(1, available / FULL_CONFIDENCE_WEIGHT);
  return { score: Math.round((hitWeight / available) * 100 * confidence), dominant };
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

/** User-facing "why" — only for humor/values/interests hits; a tone-only overlap is too thin to claim. */
export function twinReason(tw: TwinAffinity | null): string | null {
  if (!tw) return null;
  if (tw.dominant === 'humor')  return 'Matches your sense of humor';
  if (tw.dominant === 'values') return 'Shares what you value';
  if (tw.dominant === 'interests') return 'Into the same things as you';
  return null;
}
