"use client";

import { ReviewQueue } from "./review-queue";
import {
  fetchModerationHolds,
  reviewModerationHold,
  type ModerationHold,
} from "@/lib/frontend/admin-safety";

/**
 * Queue for content blocked by an admin-configured 'hold_for_review'
 * keyword (see KeywordWatchlistManager's per-keyword toggle). These are
 * content-creation submissions (character bios, posts, comments) that
 * were rejected back to the user at submit time and are held here for a
 * manual decision — approving/rejecting only records the audit trail,
 * it does not resubmit the original request. See the moderation-holds
 * route's header comment for the full scope note.
 */
export function ModerationHoldsPanel() {
  return (
    <ReviewQueue<ModerationHold>
      fetcher={fetchModerationHolds}
      onReview={reviewModerationHold}
      emptyLabel="No submissions on hold."
      withNotes
      actions={[
        { label: "Approve", status: "approved", variant: "primary" },
        { label: "Reject", status: "rejected", variant: "destructive" },
      ]}
      renderMeta={(h) => (
        <span className="text-xs font-semibold text-gold-400">
          {h.surface}
          {h.keyword_text ? ` · "${h.keyword_text}"` : ""}
        </span>
      )}
      renderBody={(h) => (
        <p className="whitespace-pre-wrap border-l-2 border-gold-500/30 pl-3">
          {h.excerpt}
        </p>
      )}
    />
  );
}
