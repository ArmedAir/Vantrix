"use client";

import { useEffect, useState } from "react";
import { Coins, Users, Repeat2, Clock, TrendingUp, ShieldAlert, Sparkles } from "lucide-react";
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

export function CreatorEarningsDashboard() {
  const [dashboard, setDashboard] = useState<CreatorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCreatorDashboard()
      .then(setDashboard)
      .catch(() => setError("Couldn't load your earnings right now."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-md border border-border-hairline animate-pulse bg-white/[0.02]" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
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
      </div>

      <div>
        <h3 className="font-display text-lg text-text-primary mb-3">Your characters</h3>
        <RevealGroup className="grid gap-3">
          {dashboard.characters.map((entry) => (
            <CharacterEarningsRow key={entry.characterId} entry={entry} />
          ))}
        </RevealGroup>
      </div>
    </div>
  );
}

function CharacterEarningsRow({ entry }: { entry: CharacterFundDashboardEntry }) {
  return (
    <RevealItem>
      <Card interactive={false} className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {entry.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={entry.imageUrl} alt="" className="h-10 w-10 rounded-sm object-cover border border-border-hairline shrink-0" />
            ) : (
              <div className="h-10 w-10 rounded-sm bg-white/[0.04] border border-border-hairline shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-text-primary font-medium truncate">{entry.characterName}</p>
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
