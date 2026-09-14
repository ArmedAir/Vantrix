import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn, timeAgo } from "@/lib/utils";
import { describeTokenLedgerReason, type TokenLedgerEntry } from "@/lib/economy/token-ledger";

/**
 * COIN-HISTORY: token_ledger (20261212_token_ledger.sql) was built as a
 * full append-only audit trail — RLS already lets a user read their own
 * rows — specifically so this could exist ("no audit trail for support,
 * fraud review, or a 'coin history' UI", per that migration's own GAP
 * note), but nothing ever rendered it. This is that reader: last N
 * entries, newest first, signed amount as the visual cue (green credit /
 * gold-muted debit) rather than a separate icon-per-reason scheme, since
 * the sign is the one thing every entry has in common.
 */
export function TokenLedgerList({ entries }: { entries: TokenLedgerEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-center text-sm text-text-tertiary py-8">
        No Vantrix Coin activity yet.
      </p>
    );
  }

  return (
    <Card interactive={false} className="divide-y divide-border-hairline">
      {entries.map((entry) => {
        const credit = entry.amount > 0;
        return (
          <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                credit ? "bg-emerald-500/10 text-emerald-400" : "bg-white/[0.06] text-text-tertiary"
              )}
            >
              {credit ? (
                <ArrowDownLeft className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text-primary">
                {describeTokenLedgerReason(entry.reason)}
              </p>
              <p className="text-xs text-text-tertiary">{timeAgo(entry.createdAt)}</p>
            </div>

            <div className="text-right">
              <p
                className={cn(
                  "font-display text-sm tabular-nums",
                  credit ? "text-emerald-400" : "text-text-primary"
                )}
              >
                {credit ? "+" : ""}
                {entry.amount.toLocaleString()}
              </p>
              <p className="text-xs text-text-tertiary tabular-nums">
                {entry.balanceAfter.toLocaleString()} left
              </p>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
