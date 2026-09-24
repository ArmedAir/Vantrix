/**
 * Pure selection logic for the homepage hero rotation — no I/O, no env, so the
 * rules that decide what the site may show are unit-testable and are the SAME
 * rules whether Groq or the deterministic fallback proposed the list.
 *
 * The LLM never gets the last word: whatever it proposes goes through
 * sanitizePicks(), which enforces (in order) membership in the vetted pool,
 * uniqueness, a carry-over cap (rotation must actually rotate), gender
 * coverage (gender-locked pages like /discover/female must still find a hero),
 * and top-up to the slot count.
 */

export interface RotationCandidate {
  id:             string;
  name:           string;
  gender:         string | null;
  archetype:      string | null;
  tags:           string[] | null;
  like_count:     number | null;
  follower_count: number | null;
  created_at:     string;
}

/** Max share of slots that may repeat from the previous rotation. */
export const MAX_CARRY_OVER_SHARE = 0.4;

const DAY_MS = 86_400_000;

/**
 * Engagement + freshness. log-scaled so one viral character can't lock out
 * everyone else; freshness decays over ~2 weeks so new arrivals get a real
 * shot at the hero without a hand-set "new" flag.
 */
export function baseScore(c: RotationCandidate, now: number): number {
  const likes     = Math.log1p(Math.max(0, c.like_count ?? 0));
  const followers = Math.log1p(Math.max(0, c.follower_count ?? 0));
  const ageDays   = Math.max(0, (now - new Date(c.created_at).getTime()) / DAY_MS);
  const fresh     = 3 * Math.exp(-ageDays / 14);
  return likes + 0.8 * followers + fresh;
}

function ranked(pool: RotationCandidate[], previous: Set<string>, now: number): RotationCandidate[] {
  return [...pool]
    .map(c => ({ c, s: baseScore(c, now) - (previous.has(c.id) ? 2 : 0) }))
    .sort((a, b) => b.s - a.s || a.c.id.localeCompare(b.c.id))
    .map(x => x.c);
}

/** Fallback used when Groq is unavailable — and to top up a short LLM answer. */
export function deterministicPicks(
  pool: RotationCandidate[], slots: number, previous: Set<string>, now: number,
): string[] {
  const order = ranked(pool, previous, now);
  const picks: RotationCandidate[] = [];
  const seenGender = new Set<string>();

  // Pass 1: best candidate of each gender, so every gender-locked page has a hero.
  for (const c of order) {
    if (picks.length >= slots) break;
    const g = c.gender ?? '';
    if (!seenGender.has(g)) { seenGender.add(g); picks.push(c); }
  }
  // Pass 2: fill by score.
  for (const c of order) {
    if (picks.length >= slots) break;
    if (!picks.includes(c)) picks.push(c);
  }
  return picks.slice(0, slots).map(c => c.id);
}

export function sanitizePicks(
  proposed: string[], pool: RotationCandidate[], slots: number,
  previous: Set<string>, now: number,
): string[] {
  const byId = new Map(pool.map(c => [c.id, c]));

  // 1. membership + uniqueness + cap
  let picks: string[] = [];
  for (const id of proposed) {
    if (byId.has(id) && !picks.includes(id)) picks.push(id);
    if (picks.length >= slots) break;
  }

  // 2. carry-over cap — drop the LOWEST-ranked repeats beyond the allowance.
  const maxCarry = Math.floor(slots * MAX_CARRY_OVER_SHARE);
  let carried = 0;
  picks = picks.filter(id => {
    if (!previous.has(id)) return true;
    carried++;
    return carried <= maxCarry;
  });

  // 3. gender coverage — only enforceable when there are at least as many slots as genders.
  const gendersInPool = [...new Set(pool.map(c => c.gender).filter((g): g is string => Boolean(g)))];
  if (slots >= gendersInPool.length) {
    const order = ranked(pool, previous, now);
    for (const g of gendersInPool) {
      if (picks.some(id => byId.get(id)?.gender === g)) continue;
      const best = order.find(c => c.gender === g && !picks.includes(c.id));
      if (!best) continue;
      if (picks.length < slots) { picks.push(best.id); continue; }
      // Full: replace the lowest-ranked pick from a gender that has more than one.
      const counts = new Map<string, number>();
      for (const id of picks) { const pg = byId.get(id)?.gender ?? ''; counts.set(pg, (counts.get(pg) ?? 0) + 1); }
      for (let i = picks.length - 1; i >= 0; i--) {
        const pg = byId.get(picks[i])?.gender ?? '';
        if ((counts.get(pg) ?? 0) > 1) { picks[i] = best.id; break; }
      }
    }
  }

  // 4. top-up to the slot count. First pass respects the carry-over cap; a
  //    second pass relaxes it only if the pool is too small to fill otherwise
  //    (an under-filled hero is worse than a repeated character).
  if (picks.length < slots) {
    const fill = deterministicPicks(pool, pool.length, previous, now);
    const carriedNow = () => picks.filter(id => previous.has(id)).length;
    for (const id of fill) {
      if (picks.length >= slots) break;
      if (picks.includes(id)) continue;
      if (previous.has(id) && carriedNow() >= maxCarry) continue;
      picks.push(id);
    }
    for (const id of fill) {
      if (picks.length >= slots) break;
      if (!picks.includes(id)) picks.push(id);
    }
  }
  return picks.slice(0, slots);
}
