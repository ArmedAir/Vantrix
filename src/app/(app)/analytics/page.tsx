import { CreatorEarningsDashboard } from "@/components/studio/creator-dashboard/creator-earnings-dashboard";

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
 * only benefit. <CreatorEarningsDashboard> is untouched; it fetches
 * /api/creator/dashboard itself, same as before.
 */
export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 md:px-8 py-8">
      <h1 className="font-display text-xl text-text-primary mb-1">Analytics</h1>
      <p className="text-sm text-text-secondary mb-6">
        Your marketplace sales and Creator Fund share, combined. The fund pays out weekly based on
        returning-user engagement, not raw message volume.
      </p>
      <CreatorEarningsDashboard />
    </div>
  );
}
