"use client";

import { Loader2, Vote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDailyChoice } from "@/hooks/use-daily-choice";

/**
 * §2.5-adjacent pass: GET/POST /api/universe/daily-choice — a complete,
 * idempotent voting mechanic (one vote/day, tally hidden until you vote,
 * to avoid bandwagon effects — see src/lib/universe/daily-choice.ts's own
 * docstring) — had zero frontend consumer anywhere in the app. Placed in
 * the World page's Overview tab, above Active Events, since it's a daily
 * "front door" mechanic rather than a per-location/faction drill-down.
 *
 * ROOT-CAUSE FIX ("voting keeps repeating after already voted"): all data
 * fetching, vote casting, and the localStorage fallback now live in
 * useDailyChoice() (src/hooks/use-daily-choice.ts), typed against the
 * shared @/types/daily-choice-api contract. The bug was here, in this
 * component, in the code useDailyChoice replaces: it read
 * `body.userVote?.option` from the GET response, but the API has always
 * returned `userVote` as the bare option itself ("a" | "b" | null), never
 * an object — so that access always evaluated to `undefined`, and this
 * component could never learn "the server already has your vote" from a
 * fresh page load. Only a same-device localStorage note (from an earlier,
 * incomplete pass at this same bug) covered for it — a new device, a
 * cleared cache, or a private/ephemeral browser tab kept seeing the vote
 * buttons no matter how many times the vote had actually been recorded.
 * Reading `body.userVote` directly (now enforced by the hook's typed
 * response) is the actual fix; see the hook and route/types files for the
 * full account.
 */
export function DailyChoiceCard() {
  const { choice, userVote, tally, hasVoted, voting, error, vote } = useDailyChoice();

  if (choice === undefined) {
    return (
      <div className="flex items-center justify-center py-8 text-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  // No active choice today — not an error, just nothing to render.
  if (choice === null) return null;

  const pctA = tally && tally.votesTotal > 0 ? Math.round((tally.votesA / tally.votesTotal) * 100) : 0;
  const pctB = tally ? 100 - pctA : 0;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-2">
        <Vote className="h-4 w-4 text-gold-500 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          Today&apos;s World Choice
          {choice.locationName ? ` · ${choice.locationName}` : ""}
        </span>
      </div>

      <p className="text-text-primary text-[15px] font-semibold">{choice.prompt}</p>
      {choice.context && (
        <p className="text-text-secondary text-sm mt-1.5">{choice.context}</p>
      )}

      {error && <p className="text-sm text-danger mt-2">{error}</p>}

      <div className="mt-4 grid sm:grid-cols-2 gap-3">
        {(["a", "b"] as const).map((opt) => {
          const label = opt === "a" ? choice.optionALabel : choice.optionBLabel;
          const pct = opt === "a" ? pctA : pctB;
          const isMine = userVote === opt;
          const isResolved = choice.resolved && choice.resolvedOption === opt;

          if (!hasVoted) {
            return (
              <Button
                key={opt}
                variant="secondary"
                size="lg"
                disabled={voting !== null}
                onClick={() => vote(opt)}
                className="justify-start h-auto py-3 px-4 text-left whitespace-normal"
              >
                {voting === opt ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
                {label}
              </Button>
            );
          }

          return (
            <div
              key={opt}
              className={cn(
                "relative rounded-sm border px-4 py-3 overflow-hidden",
                isMine ? "border-gold-500" : "border-border-hairline"
              )}
            >
              <div
                className="absolute inset-y-0 left-0 bg-gold-500/10"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <div className="relative flex items-center justify-between gap-2">
                <span className="text-sm text-text-primary">
                  {label}
                  {isMine && <span className="text-gold-400"> · your vote</span>}
                  {isResolved && <span className="text-gold-400"> · won</span>}
                </span>
                {tally && <span className="text-sm font-semibold text-text-secondary">{pct}%</span>}
              </div>
            </div>
          );
        })}
      </div>

      {tally && (
        <p className="text-xs text-text-tertiary mt-3">
          {tally.votesTotal.toLocaleString()} vote{tally.votesTotal === 1 ? "" : "s"} cast today.
        </p>
      )}
    </Card>
  );
}
