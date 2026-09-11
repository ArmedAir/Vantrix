"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, X, Star, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDatingDeck, type DeckCandidate } from "@/hooks/use-dating-deck";
import { SwipeCard } from "./swipe-card";
import { MatchCelebration } from "./match-celebration";
import { usePaywall } from "@/components/paywall/paywall-provider";
import { useNotificationStore } from "@/lib/notifications/store";

export function SwipeDeck() {
  const {
    candidates,
    swipes,
    isLoading,
    isSwiping,
    error,
    swipe,
    lastMatch,
    dismissMatch,
    reload,
  } = useDatingDeck();
  const { openPaywall } = usePaywall();

  // swipe() removes the swiped card from `candidates` before its response
  // resolves, so by the time `lastMatch` is set the card is already gone
  // from the list — snapshot the candidate at swipe time instead of
  // looking it up afterward.
  const [matchedCandidate, setMatchedCandidate] = useState<DeckCandidate | null>(null);

  const top = candidates[0];
  const outOfSwipes = swipes !== null && swipes.remaining <= 0;

  // Fire the shared paywall the moment the daily swipe cap is hit —
  // whether that's discovered on initial load or via a 429 mid-session —
  // rather than only showing the small inline "out of swipes" text below.
  const paywallShownRef = useRef(false);
  useEffect(() => {
    if (outOfSwipes && !paywallShownRef.current) {
      paywallShownRef.current = true;
      openPaywall("swipes");
    }
    if (!outOfSwipes) paywallShownRef.current = false;
  }, [outOfSwipes, openPaywall]);

  async function handleSwipe(
    candidate: DeckCandidate,
    direction: "like" | "pass" | "super_like"
  ) {
    const result = await swipe(candidate.id, direction);
    if (result?.matched) {
      setMatchedCandidate(candidate);

      // CLIENT-FANOUT-FIX: the swipe response already carries the real
      // notifications-table id for this match (see notificationId on
      // /api/dating/swipe's response) — push it into the shared
      // notification store now instead of waiting for the bell/toast to
      // learn about it via the realtime INSERT, which can lag a swipe by
      // a second or more. Using the server's own id (not a client-made
      // one) means receive()'s id-based dedup collapses cleanly with that
      // later realtime event instead of double-counting it. Mirrors the
      // exact title/body/ctaUrl the server used in /api/dating/swipe, so
      // there's one string authored in one place (that route) and this is
      // just an early, identical echo of it.
      if (result.notificationId) {
        useNotificationStore.getState().receive({
          id: result.notificationId,
          type: "dating_match",
          title: "New match!",
          body: `You and ${candidate.name} matched.`,
          cta_url: result.match ? `/dating/match/${result.match.id}` : null,
          icon: null,
          urgency: "high",
          metadata: result.match
            ? { matchId: result.match.id, characterId: candidate.id, characterName: candidate.name }
            : null,
          read_at: null,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  function closeCelebration() {
    dismissMatch();
    setMatchedCandidate(null);
  }

  if (isLoading) {
    return (
      <div className="flex h-[70dvh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 md:px-8 py-6">
      <div className="mb-4 flex w-full items-center justify-between">
        <h1 className="font-display text-xl text-text-primary">Dating</h1>
        {swipes && (
          <span className="text-sm text-text-secondary">
            <span className={cn(outOfSwipes ? "text-danger" : "text-gold-400")}>
              {swipes.remaining}
            </span>{" "}
            swipe{swipes.remaining === 1 ? "" : "s"} left today
          </span>
        )}
      </div>

      {error && (
        <p className="mb-3 w-full rounded-sm border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="relative aspect-[3/4.3] w-full">
        {candidates.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-border-hairline text-center px-6">
            <Heart className="h-8 w-8 text-text-tertiary" />
            <p className="text-text-secondary">
              {outOfSwipes
                ? "You're out of swipes for today — come back tomorrow."
                : "No new companions to show right now."}
            </p>
            {!outOfSwipes && (
              <Button variant="secondary" size="sm" onClick={reload}>
                <RotateCcw className="h-4 w-4" />
                Refresh
              </Button>
            )}
          </div>
        ) : (
          candidates
            .slice(0, 4)
            .map((c, i) => (
              <SwipeCard
                key={c.id}
                candidate={c}
                index={i}
                isTop={i === 0}
                onSwipe={(direction) => handleSwipe(c, direction)}
              />
            ))
        )}
      </div>

      {candidates.length > 0 && (
        <div className="mt-6 flex items-center gap-4">
          <Button
            variant="secondary"
            size="icon"
            disabled={isSwiping || outOfSwipes}
            onClick={() => top && handleSwipe(top, "pass")}
            aria-label="Pass"
            className="h-14 w-14 rounded-full"
          >
            <X className="h-6 w-6" />
          </Button>
          <Button
            variant="primary"
            size="icon"
            disabled={isSwiping || outOfSwipes}
            onClick={() => top && handleSwipe(top, "like")}
            aria-label="Like"
            className="h-16 w-16 rounded-full"
          >
            <Heart className="h-7 w-7 fill-current" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            disabled={isSwiping || outOfSwipes}
            onClick={() => top && handleSwipe(top, "super_like")}
            aria-label="Super like"
            className="h-14 w-14 rounded-full"
          >
            <Star className="h-6 w-6" />
          </Button>
        </div>
      )}

      {lastMatch?.matched && matchedCandidate && (
        <MatchCelebration
          match={lastMatch}
          candidate={matchedCandidate}
          onDismiss={closeCelebration}
        />
      )}
    </div>
  );
}
