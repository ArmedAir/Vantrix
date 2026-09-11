"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  DailyChoiceTallyDTO,
  DailyChoiceVoteOption,
  DailyWorldChoiceDTO,
  GetDailyChoiceResponse,
  PostDailyChoiceResponse,
} from "@/types/daily-choice-api";

/**
 * Domain hook for /api/universe/daily-choice, split out of
 * daily-choice-card.tsx (which was previously doing its own untyped
 * fetch + state management) so the data layer follows the same
 * `{ ..., vote }` shape as this codebase's other governance/community
 * hooks, and so the response is read through the shared, precisely-typed
 * contract in `@/types/daily-choice-api` instead of ad hoc property
 * access on a `.json()` result typed as `any`.
 *
 * ROOT-CAUSE FIX ("voting keeps repeating after already voted"): the
 * component this replaces read the `.option` property off the GET
 * response's `userVote` field, but the route has always returned
 * `userVote` as the bare option itself (`"a" | "b" | null`), never an
 * object — see lib/universe/daily-choice.ts's getUserVote() and the
 * route's own GetDailyChoiceResponse type. Reaching for a nested
 * `.option` field on a value that already IS the option therefore always
 * evaluated to `undefined`, so a fresh GET could never tell the client
 * "the server already has your vote" — only the localStorage fallback
 * below (kept as defense-in-depth, not the primary mechanism now) covered
 * for it, and only on the exact same browser/device that cast the vote.
 * Any other context — a new device, a cleared cache, a private/ephemeral
 * browser tab (session storage that doesn't survive the tab closing) —
 * saw the vote buttons again indefinitely, regardless of how many times
 * the server had already recorded the vote. Reading `body.userVote`
 * directly, through a type that's a bare union rather than an object,
 * fixes the actual defect; typing the fetch result against
 * GetDailyChoiceResponse means the equivalent mistake fails to compile
 * next time instead of silently returning `undefined`.
 */
const VOTE_STORAGE_PREFIX = "vantrix:worldChoiceVote:";

function readStoredVote(choiceId: string): DailyChoiceVoteOption | null {
  try {
    const raw = window.localStorage.getItem(VOTE_STORAGE_PREFIX + choiceId);
    return raw === "a" || raw === "b" ? raw : null;
  } catch {
    // Storage unavailable (private browsing, disabled) — fall back to
    // server state only.
    return null;
  }
}

function writeStoredVote(choiceId: string, option: DailyChoiceVoteOption) {
  try {
    window.localStorage.setItem(VOTE_STORAGE_PREFIX + choiceId, option);
  } catch {
    // Best-effort only — server-side vote already succeeded regardless.
  }
}

interface UseDailyChoiceResult {
  /** undefined while loading, null once loaded if there's no active choice. */
  choice: DailyWorldChoiceDTO | null | undefined;
  userVote: DailyChoiceVoteOption | null;
  tally: DailyChoiceTallyDTO | null;
  /** True once a vote is cast/known — buttons should give way to results. */
  hasVoted: boolean;
  voting: DailyChoiceVoteOption | null;
  error: string | null;
  vote: (option: DailyChoiceVoteOption) => Promise<void>;
}

export function useDailyChoice(): UseDailyChoiceResult {
  const [choice, setChoice] = useState<DailyWorldChoiceDTO | null | undefined>(undefined);
  const [userVote, setUserVote] = useState<DailyChoiceVoteOption | null>(null);
  const [tally, setTally] = useState<DailyChoiceTallyDTO | null>(null);
  const [voting, setVoting] = useState<DailyChoiceVoteOption | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/universe/daily-choice")
      .then((r) => r.json() as Promise<GetDailyChoiceResponse>)
      .then((body) => {
        if (cancelled) return;
        const fetchedChoice = body.choice ?? null;
        setChoice(fetchedChoice);

        const stored = fetchedChoice ? readStoredVote(fetchedChoice.id) : null;
        // `body.userVote` is already the bare option — no `.option` access.
        const resolvedVote = body.userVote ?? stored ?? null;
        setUserVote(resolvedVote);
        setTally(body.tally ?? null);

        // Belt-and-suspenders: if the server confirms a vote the local
        // device didn't have recorded yet (e.g. the same account voting
        // from a different device), sync it locally too.
        if (fetchedChoice && body.userVote) {
          writeStoredVote(fetchedChoice.id, body.userVote);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load today's world choice.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const vote = useCallback(
    async (option: DailyChoiceVoteOption) => {
      if (!choice || userVote || voting) return;
      setVoting(option);
      setError(null);
      try {
        const res = await fetch("/api/universe/daily-choice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choiceId: choice.id, option }),
        });
        const body = await res.json();
        if (!res.ok) {
          setError((body as { error?: string }).error ?? "Vote failed — please try again.");
          return;
        }
        const { option: castOption, tally: newTally } = body as PostDailyChoiceResponse;
        setUserVote(castOption);
        setTally(newTally);
        // Written on both "recorded" and "already_voted" — either way the
        // vote is final from this device's perspective from now on.
        writeStoredVote(choice.id, castOption);
      } catch {
        setError("Vote failed — please try again.");
      } finally {
        setVoting(null);
      }
    },
    [choice, userVote, voting],
  );

  const hasVoted = Boolean(userVote) || Boolean(choice?.resolved);

  return { choice, userVote, tally, hasVoted, voting, error, vote };
}
