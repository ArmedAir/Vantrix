"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Coins,
  Users,
  Repeat2,
  Clock,
  TrendingUp,
  ShieldAlert,
  Sparkles,
  Crown,
  Store,
  RotateCcw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/admin/analytics/kpi-card";
import { AnimatedCounter } from "@/components/admin/motion/animated-counter";
import { RevealGroup, RevealItem } from "@/components/admin/motion/reveal";
import { cn } from "@/lib/utils";
import {
  fetchCreatorDashboard,
  type CreatorDashboard,
  type CharacterFundDashboardEntry,
} from "@/lib/frontend/creator-dashboard";

function formatTokens(n: number): string {
  return `${Math.round(n).toLocaleString()} VC`;
}

function periodLabel(periodStart: string | null): string {
  if (!periodStart) return "";
  const start = new Date(periodStart);
  return start.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

const MONETIZATION_BADGE: Record<string, { label: string; className: string }> = {
  eligible: { label: "Fund-eligible", className: "text-success border-success/30 bg-success/10" },
  suspended: { label: "Suspended", className: "text-danger border-danger/30 bg-danger/10" },
  none: { label: "Not enrolled", className: "text-text-tertiary border-border-hairline bg-white/[0.03]" },
};

export function CreatorEarningsDashboard() {
  const [dashboard, setDashboard] = useState<CreatorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchCreatorDashboard()
      .then(setDashboard)
      .catch(() => setError("Couldn't load your earnings right now."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-md border border-gold-500/10 bg-gradient-to-b from-gold-500/[0.04] to-transparent animate-pulse"
            />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-md border border-gold-500/10 bg-gradient-to-b from-gold-500/[0.04] to-transparent animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <ShieldAlert className="h-5 w-5 text-danger mx-auto mb-3" strokeWidth={1.75} />
        <p className="text-text-primary font-display text-lg mb-1">Something went wrong</p>
        <p className="text-sm text-text-secondary max-w-sm mx-auto mb-4">{error}</p>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-400 hover:text-gold-300 transition-colors ease-premium"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} /> Try again
        </button>
      </Card>
    );
  }

  if (!dashboard || dashboard.characters.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Sparkles className="h-5 w-5 text-gold-500 mx-auto mb-3" strokeWidth={1.75} />
        <p className="text-text-primary font-display text-lg mb-1">No fund earnings yet</p>
        <p className="text-sm text-text-secondary max-w-sm mx-auto">
          {dashboard?.note ??
            "Once you upgrade a character into the Creator Fund and it earns real returning users, its first period will show up here."}
        </p>
      </Card>
    );
  }

  const fundTotal = dashboard.characters.reduce((s, e) => s + e.fundEarnedTokens, 0);
  const marketplaceTotal = dashboard.characters.reduce((s, e) => s + e.marketplaceEarnedTokens, 0);
  const streamTotal = fundTotal + marketplaceTotal;
  const fundSharePct = streamTotal > 0 ? Math.round((fundTotal / streamTotal) * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs text-text-tertiary mb-3">Period starting {periodLabel(dashboard.periodStart)}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KpiCard
            icon={Coins}
            label="Total earnings"
            value={formatTokens(dashboard.totalEarnedTokens)}
            trendPct={dashboard.totalEarnedTrendPct}
            accent
          />
          <KpiCard icon={Clock} label="Pending payout" value={formatTokens(dashboard.pendingTokens)} />
          <KpiCard icon={Coins} label="Paid out" value={formatTokens(dashboard.paidTokens)} />
        </div>

        {/* FUND-VS-MARKETPLACE SPLIT: both streams roll up into
            totalEarnedTokens above but were previously invisible — a
            creator had no way to see whether their income comes from
            returning-user engagement (the Fund) or direct sales
            (Marketplace) without those two numbers side by side. */}
        {streamTotal > 0 && (
          <div className="mt-4 rounded-md border border-border-hairline p-4">
            <div className="flex items-center justify-between text-xs text-text-tertiary mb-2">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.75} /> Creator Fund
              </span>
              <span className="flex items-center gap-1.5">
                Marketplace <Store className="h-3.5 w-3.5" strokeWidth={1.75} />
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/[0.05] overflow-hidden flex">
              <div className="h-full bg-gold-500" style={{ width: `${fundSharePct}%` }} />
              <div className="h-full bg-white/20" style={{ width: `${100 - fundSharePct}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px] text-text-tertiary mt-2 tabular-nums">
              <span>{formatTokens(fundTotal)} &middot; {fundSharePct}%</span>
              <span>{formatTokens(marketplaceTotal)} &middot; {100 - fundSharePct}%</span>
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="font-display text-lg text-text-primary mb-3">Your characters</h3>
        <RevealGroup className="grid gap-3">
          {dashboard.characters.map((entry, i) => (
            <CharacterEarningsRow key={entry.characterId} entry={entry} rank={i + 1} />
          ))}
        </RevealGroup>
      </div>
    </div>
  );
}

function CharacterEarningsRow({ entry, rank }: { entry: CharacterFundDashboardEntry; rank: number }) {
  const streamTotal = entry.fundEarnedTokens + entry.marketplaceEarnedTokens;
  const fundSharePct = streamTotal > 0 ? Math.round((entry.fundEarnedTokens / streamTotal) * 100) : 0;
  const badge = MONETIZATION_BADGE[entry.monetizationStatus] ?? MONETIZATION_BADGE.none;

  return (
    <RevealItem>
      <Card
        interactive={false}
        className={cn("p-5", rank === 1 && "border-gold-500/30 bg-gold-500/[0.03]")}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              {entry.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.imageUrl} alt="" className="h-10 w-10 rounded-sm object-cover border border-border-hairline" />
              ) : (
                <div className="h-10 w-10 rounded-sm bg-white/[0.04] border border-border-hairline" />
              )}
              {rank === 1 && (
                <div className="absolute -top-2 -left-2 h-5 w-5 rounded-full bg-base border border-gold-500/40 flex items-center justify-center">
                  <Crown className="h-3 w-3 text-gold-500" strokeWidth={2} />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-text-primary font-medium truncate">{entry.characterName}</p>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border shrink-0", badge.className)}>
                  {badge.label}
                </span>
              </div>
              <p className="text-xs text-text-tertiary">
                <AnimatedCounter value={entry.interactionsThisPeriod} /> interactions this period
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-display text-lg text-gold-400 tabular-nums">{formatTokens(entry.totalEarnedTokens)}</p>
            {entry.trendPct !== null && (
              <p className={cn("text-[11px] tabular-nums", entry.trendPct >= 0 ? "text-success" : "text-danger")}>
                {entry.trendPct >= 0 ? "+" : ""}
                {entry.trendPct.toFixed(1)}%
              </p>
            )}
          </div>
        </div>

        {entry.heldForReview && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-sm bg-danger/10 border border-danger/20">
            <ShieldAlert className="h-3.5 w-3.5 text-danger shrink-0" strokeWidth={1.75} />
            <p className="text-xs text-danger">
              This period&rsquo;s fund payout is on hold pending a routine review — it isn&rsquo;t paid or voided yet.
            </p>
          </div>
        )}

        {streamTotal > 0 && (
          <div className="mb-4">
            <div className="h-1.5 w-full rounded-full bg-white/[0.05] overflow-hidden flex">
              <div className="h-full bg-gold-500" style={{ width: `${fundSharePct}%` }} />
              <div className="h-full bg-white/20" style={{ width: `${100 - fundSharePct}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-text-tertiary mt-1.5 tabular-nums">
              <span>Fund {formatTokens(entry.fundEarnedTokens)}</span>
              <span>Marketplace {formatTokens(entry.marketplaceEarnedTokens)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Stat icon={Users} label="Active users" value={entry.activeUsers.toLocaleString()} />
          <Stat icon={Repeat2} label="Returning" value={entry.returningUsers.toLocaleString()} />
          <Stat icon={TrendingUp} label="7-day retention" value={`${entry.retentionPct}%`} />
          <Stat
            icon={Clock}
            label="Avg. relationship"
            value={entry.avgRelationshipDurationDays !== null ? `${entry.avgRelationshipDurationDays}d` : "\u2014"}
          />
        </div>
      </Card>
    </RevealItem>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-text-tertiary mb-1">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="text-text-primary tabular-nums">{value}</p>
    </div>
  );
}
