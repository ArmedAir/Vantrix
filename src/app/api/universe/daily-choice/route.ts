/**
 * GET  /api/universe/daily-choice — today's world choice, the user's vote
 *      (if cast), and the tally (only included once the user has voted, to
 *      avoid bandwagon effects).
 * POST /api/universe/daily-choice — cast a vote. Body: { choiceId, option }.
 *      Idempotent: voting twice returns the original vote, not an error.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { getActiveDailyChoice, getUserVote, getTally, castVote } from "@/lib/universe/daily-choice";
import type {
  GetDailyChoiceResponse,
  PostDailyChoiceResponse,
  DailyChoiceErrorResponse,
} from "@/types/daily-choice-api";
import { withErrorHandling } from "@/lib/api/with-error-handling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (_req: NextRequest): Promise<NextResponse<GetDailyChoiceResponse>> => {
  const { user } = await getAuthedUser();

  const choice = await getActiveDailyChoice();
  if (!choice) {
    return NextResponse.json({ choice: null, userVote: null, tally: null });
  }

  // NOTE: `userVote` is the bare option string ("a" | "b" | null), never
  // an object — see GetDailyChoiceResponse's doc comment. A prior frontend
  // bug (fixed alongside this route — see daily-choice-card.tsx /
  // use-daily-choice.ts) read this as `userVote?.option`, which silently
  // resolved to `undefined` on every real response and made the client
  // unable to ever recognize a vote it had already cast from the server
  // alone. The explicit return type on this function is what makes that
  // mismatch a compile error instead of a silent one going forward.
  const userVote = user ? await getUserVote(choice.id, user.id) : null;
  // Tally only revealed after voting (or if the choice has already resolved).
  const tally = (userVote || choice.resolved) ? await getTally(choice.id) : null;

  return NextResponse.json({ choice, userVote, tally });
}, 'universe/daily-choice');

const voteSchema = z.object({
  choiceId: z.string().uuid(),
  option: z.enum(["a", "b"]),
});

export const POST = withErrorHandling(async (req: NextRequest,): Promise<NextResponse<PostDailyChoiceResponse | DailyChoiceErrorResponse>> => {
  const { user } = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = voteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const choice = await getActiveDailyChoice();
  if (!choice || choice.id !== parsed.data.choiceId || choice.resolved) {
    return NextResponse.json({ error: "This choice is no longer active" }, { status: 409 });
  }

  const result = await castVote(choice.id, user.id, parsed.data.option);
  if (result.status === "not_found") {
    return NextResponse.json({ error: "Vote could not be recorded" }, { status: 500 });
  }

  const tally = await getTally(choice.id);
  return NextResponse.json({
    status: result.status, // "recorded" | "already_voted"
    option: result.option,
    tally,
  });
}, 'universe/daily-choice');
