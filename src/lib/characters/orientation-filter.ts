/**
 * Resolves the Discover `orientation` query param into the set of
 * `characters.orientation` values to filter by, or null when no filter
 * should apply. Pulled out as its own pure function — rather than left
 * inline in /api/characters's route handler — specifically so this one
 * small piece of branching (the 'lgbtq' meta-value expanding to three
 * real column values) has a unit test instead of only ever being
 * exercised end-to-end.
 *
 * See migration 20270128_character_orientation.sql for why `orientation`
 * is a separate axis from `gender`/`category` rather than folded into
 * either.
 */
const SPECIFIC_ORIENTATIONS = new Set(['straight', 'gay', 'lesbian', 'bi']);

export function resolveOrientationFilter(param: string | null | undefined): string[] | null {
  if (!param) return null;
  if (param === 'lgbtq') return ['gay', 'lesbian', 'bi'];
  if (SPECIFIC_ORIENTATIONS.has(param)) return [param];
  return null;
}
