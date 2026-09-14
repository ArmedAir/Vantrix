"use client";

import { ReviewQueue } from "./review-queue";
import {
  fetchCreatorFundFlags,
  reviewCreatorFundFlag,
  type CreatorFundFlag,
} from "@/lib/frontend/admin-safety";

const FLAG_LABELS: Record<string, string> = {
  creator_self_usage_dominant: "Self-usage dominant",
  low_diversity_returning_users: "Low-diversity retention",
  coordinated_new_accounts: "Coordinated new accounts",
  moderation_reports_spike: "Reports spike",
};

export function CreatorFundFlagsPanel() {
  return (
    <ReviewQueue<CreatorFundFlag>
      fetcher={fetchCreatorFundFlags}
      onReview={reviewCreatorFundFlag}
      withNotes
      emptyLabel="No pending Creator Fund flags."
      actions={[
        { label: "Confirm Farming", status: "confirmed_farming", variant: "destructive" },
        { label: "Confirm Legitimate", status: "confirmed_legitimate", variant: "primary" },
        { label: "Dismiss", status: "dismissed", variant: "ghost" },
      ]}
      renderMeta={(f) => (
        <span className="text-xs font-semibold text-gold-400">
          Score {f.score}/100 · {FLAG_LABELS[f.flag_type] ?? f.flag_type}
        </span>
      )}
      renderBody={(f) => (
        <div>
          <p className="text-text-secondary text-xs mb-1">
            Character {f.character_id.slice(0, 8)} · Creator {f.creator_id.slice(0, 8)} · period
            starting {new Date(f.period_start).toLocaleDateString()}
          </p>
          <p className="text-xs text-text-tertiary">{f.reasons.join(" · ")}</p>
        </div>
      )}
    />
  );
}
