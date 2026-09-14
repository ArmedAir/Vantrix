"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { FeedPostCard } from "@/components/feed/feed-post-card";
import type { FeedPost } from "@/types/feed";

/**
 * Same portal + fixed-inset-0 + Escape-to-close contract as
 * chat/media-lightbox.tsx (see that file's MOBILE-EXPAND-FIX comment for
 * why createPortal matters here specifically: CharacterPostsGrid renders
 * under CharacterHero, which can sit under a backdrop-filter ancestor on
 * some layouts, and a non-portaled `fixed` element would get boxed into
 * that ancestor instead of the viewport on iOS/Android Safari).
 *
 * Renders the real FeedPostCard rather than a simplified read-only view —
 * the post object handed in already carries this viewer's user_liked/
 * comments_count from the same getFeedPostsPage() call the grid used to
 * render its thumbnail, so opening a tile costs zero extra requests, and
 * every interaction (like, comment, share, message) works exactly as it
 * does on the main feed.
 *
 * DOUBLE-TAP-CLOSE FIX: this grid renders the same posts the main feed
 * does, and CHANGES_FEED_INSTAGRAM.md trains users to double-tap post
 * images there (see feed-post-card.tsx's own DOUBLE_TAP_MS handling) —
 * the habit carries over to this grid's tiles (character-posts-grid.tsx's
 * PostTile) even though they're a plain single-tap button. On a real
 * double-tap, the *first* tap's click opens this overlay; because the
 * backdrop is a fixed inset-0 div, it lands directly under the same
 * finger position, so the *second* tap's click resolves to the backdrop
 * and fires onClose before the post is ever seen — reads as "nothing
 * happened" on one (perceived) tap. Same fix as media-lightbox.tsx:
 * `openedAtRef` is stamped during render (not in an effect, which could
 * still lose the race to a fast second tap) with the timestamp of the
 * render that first shows this post, and the backdrop ignores any close
 * within CLOSE_GUARD_MS of that stamp.
 */
const CLOSE_GUARD_MS = 350;

export function CharacterPostViewerModal({
  post,
  onClose,
}: {
  post: FeedPost | null;
  onClose: () => void;
}) {
  const openedAtRef = useRef(0);
  const lastPostRef = useRef<FeedPost | null>(null);
  if (post && post !== lastPostRef.current) {
    openedAtRef.current = Date.now();
  }
  lastPostRef.current = post;

  useEffect(() => {
    if (!post) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [post, onClose]);

  if (!post) return null;

  // See DOUBLE-TAP-CLOSE FIX above — swallow backdrop closes that land
  // within the guard window of opening; the explicit X button and Escape
  // are unaffected since neither shares the thumbnail's tap coordinates.
  function handleBackdropClose() {
    if (Date.now() - openedAtRef.current < CLOSE_GUARD_MS) return;
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex h-[100dvh] items-start justify-center overflow-y-auto bg-black/90 p-4 sm:items-center"
      onClick={handleBackdropClose}
      role="dialog"
      aria-modal="true"
      aria-label="Post"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors duration-150 ease-premium hover:bg-black/70"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="w-full max-w-[420px] py-12 sm:py-0" onClick={(e) => e.stopPropagation()}>
        <FeedPostCard post={post} />
      </div>
    </div>,
    document.body
  );
}
