import type { PublicCharacter } from "@/lib/seo/public-character";
import type { OnboardingSignals } from "./signals";

/**
 * Maps the three pre-signup choices (identity / intent / scenario) to
 * character tags — a shallow, explainable weighting, not a parallel
 * recommendation engine. The real personalization system
 * (scoreCandidatesForDiscover, lib/recommendations/engine.ts) only runs
 * for authenticated users with real interaction history; this exists
 * purely to make the very first character reveal feel responsive to the
 * three choices a brand-new, anonymous visitor just made. See build doc
 * §1.4 and §2.
 */
const INTENT_TAG_WEIGHTS: Record<OnboardingSignals["intentChoice"] & string, string[]> = {
  connection: ["romance", "sweet", "caring", "girlfriend", "boyfriend"],
  chemistry: ["flirty", "tension", "confident", "seductive"],
  depth: ["intellectual", "mysterious", "deep", "thoughtful"],
  escape: ["fantasy", "adventure", "roleplay", "world"],
  surprise: [], // deliberately unweighted — "surprise me" should not bias tags
};

const IDENTITY_TAG_WEIGHTS: Record<OnboardingSignals["identityChoice"] & string, string[]> = {
  unforgettable: ["intense", "confident", "bold"],
  dangerous: ["dominant", "mysterious", "edgy"],
  safe: ["caring", "gentle", "sweet"],
  irreplaceable: ["devoted", "romance", "loyal"],
  unsure: [],
};

// Scenario response ids map to a couple of light directness/warmth tags —
// see components/onboarding/micro-scenario.tsx for the ids this expects.
const SCENARIO_TAG_WEIGHTS: Record<string, string[]> = {
  "1am_text_a": ["caring", "gentle"],
  "1am_text_b": ["flirty", "confident"],
  "1am_text_c": ["devoted", "intense"],
  "1am_text_d": ["mysterious", "edgy"],
};

export interface CharacterMatch {
  character: PublicCharacter;
  /** 0–1, only ever shown to the user as "based on what you've shown
   *  us" — never as a number or a certainty claim. See signals.ts. */
  confidence: number;
  matchedTags: string[];
}

function buildWeightedTags(signals: OnboardingSignals): Map<string, number> {
  const weights = new Map<string, number>();
  const add = (tags: string[], weight: number) => {
    for (const tag of tags) weights.set(tag, (weights.get(tag) ?? 0) + weight);
  };
  if (signals.identityChoice) add(IDENTITY_TAG_WEIGHTS[signals.identityChoice] ?? [], 1);
  if (signals.intentChoice) add(INTENT_TAG_WEIGHTS[signals.intentChoice] ?? [], 1.5);
  if (signals.scenarioResponse) add(SCENARIO_TAG_WEIGHTS[signals.scenarioResponse] ?? [], 1);
  return weights;
}

/**
 * Picks a character from the shortlist. `exclude` lets the reveal
 * screen's "Try another" actually surface a meaningfully different pick
 * (see build doc §1.4's requirement that "try another" not be a
 * near-identical reshuffle) — excluded characters are still eligible as
 * a last resort if the pool is too small to route around them.
 */
export function selectCharacter(
  pool: PublicCharacter[],
  signals: OnboardingSignals,
  exclude: string[] = []
): CharacterMatch | null {
  if (pool.length === 0) return null;

  const weights = buildWeightedTags(signals);
  const totalWeight = Array.from(weights.values()).reduce((a, b) => a + b, 0);

  const candidates = pool.filter((c) => !exclude.includes(c.id));
  const searchPool = candidates.length > 0 ? candidates : pool;

  let best: { character: PublicCharacter; score: number; matchedTags: string[] } | null = null;

  for (const character of searchPool) {
    const matchedTags = character.tags.filter((tag) => weights.has(tag));
    const score =
      matchedTags.reduce((sum, tag) => sum + (weights.get(tag) ?? 0), 0) +
      // Small popularity tiebreaker so a zero-signal ("I don't know
      // yet" / "Surprise me") visitor still gets a strong pick, not a
      // random one.
      Math.log10(character.like_count + 1) * 0.1;

    if (!best || score > best.score) {
      best = { character, score, matchedTags };
    }
  }

  if (!best) return null;

  const confidence = totalWeight > 0
    ? Math.min(1, best.matchedTags.length / Math.max(1, weights.size))
    : 0.2; // low, honest confidence for a zero-signal pick

  return { character: best.character, confidence, matchedTags: best.matchedTags };
}
