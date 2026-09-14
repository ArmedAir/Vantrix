/**
 * Shared request/response contract for /api/universe/daily-choice.
 *
 * ROOT-CAUSE CONTEXT ("voting keeps repeating after already voted"): the
 * route and its one frontend consumer (daily-choice-card.tsx) each had
 * their own untyped idea of this shape. The route returns `userVote` as
 * the bare option itself (`"a" | "b" | null` — see getUserVote() in
 * lib/universe/daily-choice.ts), but the client read `body.userVote?.option`,
 * as if `userVote` were an object wrapping the option — a shape that never
 * existed on either side. Since `fetch().json()` types as `any`, nothing
 * caught the mismatch: `body.userVote?.option` always evaluated to
 * `undefined`, so the client could never learn "the server says you already
 * voted" from a fresh GET — only a same-device localStorage fallback (added
 * in a prior pass) papered over it, which meant a new device, a cleared
 * cache, or a private/ephemeral browser tab would show the vote buttons
 * forever, no matter how many times the server had already recorded a vote.
 *
 * Importing these types on both ends turns that class of bug into a
 * compile-time type error instead of a silent runtime no-op — reaching for
 * `.option` on a `DailyChoiceVoteOption` (a plain `"a" | "b" | null` union)
 * fails to typecheck rather than quietly returning `undefined`.
 */

/** A single vote option. Intentionally a bare union, not an object — this
 *  IS the value, not a wrapper around it. */
export type DailyChoiceVoteOption = "a" | "b";

export interface DailyWorldChoiceDTO {
  id: string;
  locationName: string | null;
  prompt: string;
  context: string | null;
  optionALabel: string;
  optionBLabel: string;
  resolved: boolean;
  resolvedOption: DailyChoiceVoteOption | null;
}

export interface DailyChoiceTallyDTO {
  votesA: number;
  votesB: number;
  votesTotal: number;
}

/** GET /api/universe/daily-choice */
export interface GetDailyChoiceResponse {
  choice: DailyWorldChoiceDTO | null;
  /** The bare option the user already voted, or null if they haven't (or
   *  aren't signed in). NOT an object — see the file header above. */
  userVote: DailyChoiceVoteOption | null;
  /** Only ever non-null when `userVote` is set or `choice.resolved` is
   *  true — see the route's own bandwagon-effect comment. */
  tally: DailyChoiceTallyDTO | null;
}

/** POST /api/universe/daily-choice body */
export interface PostDailyChoiceRequest {
  choiceId: string;
  option: DailyChoiceVoteOption;
}

/** POST /api/universe/daily-choice response (2xx) */
export interface PostDailyChoiceResponse {
  /** "recorded" on a fresh vote, "already_voted" on an idempotent repeat —
   *  either way `option` below is the user's real, final vote. */
  status: "recorded" | "already_voted";
  option: DailyChoiceVoteOption;
  tally: DailyChoiceTallyDTO;
}

/** POST /api/universe/daily-choice error response (4xx/5xx) */
export interface DailyChoiceErrorResponse {
  error: string;
}
