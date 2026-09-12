import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getCreatorAnalyticsDashboard } from "@/lib/frontend/creator-analytics.server";
import { CreatorEarningsDashboard } from "@/components/studio/creator-dashboard/creator-earnings-dashboard";
import { RetryAnalyticsButton } from "@/components/studio/creator-dashboard/retry-analytics-button";
import { logger } from "@/lib/logger";

/**
 * CREATORS-DASHBOARD-OUT-OF-SUBSCRIPTION (2026-09-11): the Creators
 * Dashboard (marketplace sales + Creator Fund share — see
 * creator-earnings-dashboard.tsx) previously rendered inline on the
 * Subscription/Premium page, gated to paying members, as
 * creators-dashboard-section.tsx. Per direct request: pulled out into its
 * own top-level page so a creator's earnings/analysis surface isn't
 * buried inside the checkout/upsell page. This also frees up the
 * `/analytics` route — previously mislabeled billing-management UI now
 * lives at /profile/settings/subscription (see that page's own note) —
 * so "Analytics" in primary nav now means what it says: a creator's view
 * into how their characters are performing and earning, not a Premium-
 * only benefit.
 *
 * SERVER-SIDE FIX (2026-09-12): this page now fetches the dashboard data
 * itself, server-side, via getCreatorAnalyticsDashboard() (see that
 * module's own doc comment) and passes the resolved result straight into
 * <CreatorEarningsDashboard> as a prop. Previously the page rendered that
 * component with no data at all and let it fetch client-side on mount —
 * see creator-earnings-dashboard.tsx's own SERVER-SIDE FIX comment for
 * what changed there. Every route under (app) already requires a session
 * (see (app)/layout.tsx's redirect-to-/login branch for a guest), so the
 * `dashboard === null` case here only means the auth check inside
 * getCreatorAnalyticsDashboard() itself failed — genuinely unreachable in
 * normal navigation, but redirected defensively rather than assumed away.
 */
export default async function AnalyticsPage() {
  // SERVER-SIDE FIX: a genuine failure here (DB unreachable, etc.) used
  // to surface as the client component's own `error` state after its
  // fetch rejected. Caught here instead so a data-layer failure renders
  // this page's own error card rather than throwing into Next's generic
  // route-level error boundary — same user-facing "Something went wrong /
  // Try again" shape as before, just decided server-side.
  let dashboard;
  try {
    dashboard = await getCreatorAnalyticsDashboard();
  } catch (err) {
    logger.error("analytics/page: getCreatorAnalyticsDashboard failed", { err });
    return (
      <div className="mx-auto max-w-4xl px-4 md:px-8 py-8">
        <h1 className="font-display text-xl text-text-primary mb-1">Analytics</h1>
        <Card className="p-8 text-center mt-6">
          <ShieldAlert className="h-5 w-5 text-danger mx-auto mb-3" strokeWidth={1.75} />
          <p className="text-text-primary font-display text-lg mb-1">Something went wrong</p>
          <p className="text-sm text-text-secondary max-w-sm mx-auto mb-4">
            Couldn&rsquo;t load your earnings right now.
          </p>
          <RetryAnalyticsButton />
        </Card>
      </div>
    );
  }

  if (!dashboard) redirect("/login");

  return (
    <div className="mx-auto max-w-4xl px-4 md:px-8 py-8">
      <h1 className="font-display text-xl text-text-primary mb-1">Analytics</h1>
      <p className="text-sm text-text-secondary mb-6">
        Your marketplace sales and Creator Fund share, combined. The fund pays out weekly based on
        returning-user engagement, not raw message volume.
      </p>
      <CreatorEarningsDashboard dashboard={dashboard} />
    </div>
  );
}
