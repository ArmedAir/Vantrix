"use client";

import { Users, Activity, DollarSign, UserMinus, ShieldAlert, LifeBuoy } from "lucide-react";
import { RevealGroup } from "@/components/admin/motion/reveal";
import { KpiCard } from "@/components/admin/analytics/kpi-card";
import { SectionCard } from "@/components/admin/analytics/section-card";
import { TrendChart } from "@/components/admin/analytics/trend-chart";
import { RankedBarList } from "@/components/admin/analytics/ranked-bar-list";
import { TopPostsList } from "@/components/admin/analytics/top-posts-list";
import { RangeSelector } from "@/components/admin/analytics/range-selector";
import { trendFromSeries } from "@/lib/admin/trend";
import { formatUsd } from "@/lib/admin/format";
import type { InvestorSnapshot } from "@/lib/admin/investor";

/**
 * Board/investor-facing view. Aggregate-only by construction (see
 * investor.ts's header) — no per-user identifiers anywhere on this page,
 * only counts and trends already surfaced elsewhere in /admin/analytics
 * and /admin/safety. Crisis/report figures use the same deliberately
 * discreet framing as SafetyTab ("counts only") rather than raw category
 * lists, since this view leaves the room with people who don't have
 * safety-queue access.
 */
export function InvestorDashboard({
  snapshot,
  days,
}: {
  snapshot: InvestorSnapshot;
  days: number;
}) {
  const churnTrend = trendFromSeries(snapshot.churn.map((c) => c.cancellations));
  const totalReports = snapshot.reportCategories.reduce((s, r) => s + r.count, 0);
  const totalCrisisEvents = snapshot.crisisSummary.reduce((s, c) => s + c.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-tertiary">{snapshot.headline.growthNote}</p>
        <RangeSelector current={days} />
      </div>

      <RevealGroup className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Total users" value={snapshot.headline.totalUsers} accent />
        <KpiCard icon={Activity} label="Monthly active users" value={snapshot.headline.mau} />
        <KpiCard icon={DollarSign} label="MRR" value={formatUsd(snapshot.headline.mrrUsd)} accent />
        <KpiCard
          icon={UserMinus}
          label="Cancelled (30d)"
          value={snapshot.headline.cancelled30d}
          trendPct={churnTrend}
          trendGoodDirection="down"
        />
      </RevealGroup>

      <SectionCard title="Churn" subtitle="Cancellations by day">
        <TrendChart
          data={snapshot.churn}
          series={[{ key: "cancellations", label: "Cancellations", variant: "danger" }]}
        />
      </SectionCard>

      <SectionCard
        title="Top community posts"
        subtitle="Highest-engagement character posts this window"
      >
        <TopPostsList posts={snapshot.topPosts} />
      </SectionCard>

      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Trust & safety" subtitle="Aggregate counts only — no user-identifying detail">
          <RevealGroup className="grid grid-cols-2 gap-4 mb-4">
            <KpiCard icon={ShieldAlert} label="User reports" value={totalReports} trendGoodDirection="down" />
            <KpiCard
              icon={LifeBuoy}
              label="Crisis events"
              value={totalCrisisEvents}
              sublabel="Sensitive-conversation volume"
            />
          </RevealGroup>
        </SectionCard>
        <SectionCard title="Report categories" subtitle="This window">
          <RankedBarList
            items={snapshot.reportCategories.map((r) => ({ key: r.category, label: r.category, value: r.count }))}
            emptyLabel="No reports in this window."
          />
        </SectionCard>
      </div>
    </div>
  );
}
