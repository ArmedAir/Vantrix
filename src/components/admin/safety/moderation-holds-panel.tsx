"use client";

import { ReviewQueue } from "./review-queue";
import { Badge } from "@/components/ui/badge";
import {
  fetchModerationHolds,
  reviewModerationHold,
  type ModerationHold,
} from "@/lib/frontend/admin-safety";

/**
 * ADMIN-UX HARDENING (optimize/harden pass): comment holds previously
 * showed only a generic surface + keyword_text string, with no way to
 * jump to the live post/thread and no visual distinction between "the AI
 * actually rejected this" (needs real judgment) and "the AI layer wasn't
 * reachable" (probably fine, just needs a look) or a lost-after()-task
 * reconciliation. All three land here with the same shape, so triage
 * priority was previously invisible without opening submitted_payload's
 * JSON by hand.
 */
function describeCommentHold(h: ModerationHold): { label: string; tone: "solid" | "outline" } {
  if (h.keyword_text === "ai_unavailable") {
    return { label: "AI unavailable — needs human look", tone: "outline" };
  }
  if (h.keyword_text?.startsWith("ai_rejected:")) {
    return { label: `AI rejected · ${h.keyword_text.slice("ai_rejected:".length)}`, tone: "solid" };
  }
  return { label: h.keyword_text ?? "held", tone: "outline" };
}

/**
 * Queue for content held for manual review, from two different flows —
 * see the moderation-holds route's header comment for the full scope
 * note on each:
 *   - content-creation submissions (character bios, posts) rejected at
 *     submit time by an admin-configured 'hold_for_review' keyword (see
 *     KeywordWatchlistManager's per-keyword toggle) — approving/rejecting
 *     here only records the audit trail, it does not resubmit the
 *     request.
 *   - feed comments already live, held for async AI review, an
 *     unavailable AI layer, or the stale-pending sweep's reconciliation
 *     of a lost review task — approving/rejecting here takes effect
 *     immediately on the live comment.
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
      renderMeta={(h) => {
        if (h.comment_id) {
          const { label, tone } = describeCommentHold(h);
          return (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gold-400">feed_comment</span>
              <Badge variant={tone}>{label}</Badge>
              {h.post_id && (
                <a
                  href={`/feed/${h.post_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gold-400 underline underline-offset-2 hover:text-gold-300"
                >
                  View post →
                </a>
              )}
            </div>
          );
        }
        return (
          <span className="text-xs font-semibold text-gold-400">
            {h.surface}
            {h.keyword_text ? ` · "${h.keyword_text}"` : ""}
          </span>
        );
      }}
      renderBody={(h) => (
        <p className="whitespace-pre-wrap border-l-2 border-gold-500/30 pl-3">
          {h.excerpt}
        </p>
      )}
    />
  );
}
