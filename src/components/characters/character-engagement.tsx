"use client";

import { useEffect, useState } from "react";
import { Heart, UserPlus, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCharacterPage } from "@/hooks/use-character-page";
import { useTriggerCharacterReaction } from "@/components/immersive/character-reaction-context";

/**
 * Character-page equivalent of discussion-thread.tsx's post-like button:
 * same optimistic-toggle-then-reconcile pattern, applied to the
 * characters/[id]/like and /follow routes. Status is fetched client-side
 * after mount since the page itself is rendered without per-user state
 * (see the like/follow routes' own GET doc comments).
 *
 * CHARACTER-REACTIONS: liking (not unliking) fires the portrait's
 * heart-burst via the shared CharacterReactionProvider — see
 * character-reaction-context.tsx and character-hero.tsx. Fired
 * optimistically alongside the optimistic count update, not gated on
 * the server round-trip, since the reaction is a same-page visual cue
 * with no server state of its own to reconcile.
 */
export function CharacterEngagement({
  characterId,
  initialLikeCount,
  initialFollowerCount,
}: {
  characterId: string;
  initialLikeCount: number;
  initialFollowerCount: number;
}) {
  const { getSocialStatus, toggleLike, toggleFollow } = useCharacterPage();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [likeBusy, setLikeBusy] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [signInHint, setSignInHint] = useState<"like" | "follow" | null>(null);
  const triggerReaction = useTriggerCharacterReaction();

  useEffect(() => {
    let cancelled = false;
    getSocialStatus(characterId).then((status) => {
      if (cancelled || !status) return;
      setLiked(status.liked);
      setLikeCount(status.likeCount);
      setFollowing(status.following);
      setFollowerCount(status.followerCount);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, getSocialStatus]);

  async function handleLike() {
    if (likeBusy) return;
    setLikeBusy(true);
    setSignInHint(null);
    const wasLiked = liked;
    const prevCount = likeCount;
    if (!wasLiked) triggerReaction("like");
    setLiked(!wasLiked);
    setLikeCount(prevCount + (wasLiked ? -1 : 1));
    const result = await toggleLike(characterId);
    if (result.status === "ok") {
      setLiked(result.data.liked);
      setLikeCount(result.data.likeCount);
    } else if (result.status === "unauthorized") {
      // A guest's optimistic like can never resolve server-side — revert
      // now instead of leaving a permanently-wrong count/state.
      setLiked(wasLiked);
      setLikeCount(prevCount);
      setSignInHint("like");
    }
    // "error" keeps the optimistic state — same self-correcting posture as
    // discussion-thread.tsx's like toggle for a real transient failure.
    setLikeBusy(false);
  }

  async function handleFollow() {
    if (followBusy) return;
    setFollowBusy(true);
    setSignInHint(null);
    const wasFollowing = following;
    const prevCount = followerCount;
    setFollowing(!wasFollowing);
    setFollowerCount(prevCount + (wasFollowing ? -1 : 1));
    const result = await toggleFollow(characterId);
    if (result.status === "ok") {
      setFollowing(result.data.following);
      setFollowerCount(result.data.followerCount);
    } else if (result.status === "unauthorized") {
      setFollowing(wasFollowing);
      setFollowerCount(prevCount);
      setSignInHint("follow");
    }
    setFollowBusy(false);
  }

  return (
    // PROFILE-LUXE: was two inline text buttons; now a bordered stat strip
    // (divider between cells, font-display tabular numerals, tracked-out
    // uppercase labels) matching ui/stat-item.tsx's own value/label
    // rhythm — see [id]/page.tsx, which now wraps this in the border-y
    // that completes the strip. Click behavior/state is unchanged.
    <div className="flex flex-col items-center gap-2">
    <div className="flex items-stretch justify-center divide-x divide-border-hairline">
      <button
        onClick={handleLike}
        disabled={likeBusy}
        className="group flex flex-col items-center gap-1.5 px-8 py-4 transition-colors ease-premium disabled:opacity-60 sm:px-12"
      >
        <Heart
          className={cn(
            "h-5 w-5 transition-colors ease-premium",
            liked ? "text-gold-400" : "text-gold-500/70 group-hover:text-gold-400"
          )}
          fill={liked ? "currentColor" : "none"}
          strokeWidth={1.75}
        />
        <span className="font-display text-2xl text-text-primary tabular-nums">
          {likeCount.toLocaleString()}
        </span>
        <span className="text-[11px] uppercase tracking-wider text-text-secondary">
          {liked ? "Liked" : "Likes"}
        </span>
      </button>

      <button
        onClick={handleFollow}
        disabled={followBusy}
        className="group flex flex-col items-center gap-1.5 px-8 py-4 transition-colors ease-premium disabled:opacity-60 sm:px-12"
      >
        {following ? (
          <UserCheck className="h-5 w-5 text-gold-400" strokeWidth={1.75} />
        ) : (
          <UserPlus
            className="h-5 w-5 text-gold-500/70 transition-colors ease-premium group-hover:text-gold-400"
            strokeWidth={1.75}
          />
        )}
        <span className="font-display text-2xl text-text-primary tabular-nums">
          {followerCount.toLocaleString()}
        </span>
        <span className="text-[11px] uppercase tracking-wider text-text-secondary">
          {following ? "Following" : "Followers"}
        </span>
      </button>
    </div>

    {signInHint && (
      <p className="pb-3 text-center text-xs text-text-secondary">
        Sign in to {signInHint} this character.
      </p>
    )}
    </div>
  );
}
