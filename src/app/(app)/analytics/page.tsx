import { getProfileSettings, getSubscriptionInfo } from "@/lib/frontend/profile";
import { SubscriptionManagement } from "@/components/profile/subscription-management";

/**
 * SUBSCRIPTION-PREMIUM-SPLIT (2026-09-11): the primary nav item that read
 * "Subscription" actually pointed at `/premium` — the plan-selection/
 * upsell page — not at any real subscription-management surface. The
 * *actual* "manage what you already have" UI (cancel, billing portal,
 * renewal date — see subscription-management.tsx's own header) lived
 * buried inside Profile → Settings instead, unreachable from that nav
 * item at all. Per direct request: pulled out into its own top-level
 * page, same split pattern Settings already uses for Notifications/
 * Security (see settings-nav-row.tsx), and promoted to primary nav in
 * place of the old mislabeled entry — renamed "Analytics" there. `/premium`
 * is untouched and stays reachable from every paywall/upsell surface in
 * the app (home banner, gated notices, chat/feed CTAs, etc.) — this page
 * only replaces the nav item that previously, incorrectly, doubled as
 * both "browse plans" and "manage my plan."
 */
export default async function AnalyticsPage() {
  const profile = await getProfileSettings();

  if (!profile) {
    return (
      <div className="mx-auto max-w-lg px-4 md:px-8 py-16 text-center text-text-secondary">
        Couldn&rsquo;t load your account. Try refreshing.
      </div>
    );
  }

  const subscription = await getSubscriptionInfo(profile.id);

  return (
    <div className="mx-auto max-w-lg px-4 md:px-8 py-8">
      <h1 className="font-display text-xl text-text-primary mb-6">Analytics</h1>
      <SubscriptionManagement subscription={subscription} />
    </div>
  );
}
