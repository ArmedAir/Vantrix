import { getProfileSettings, getSubscriptionInfo } from "@/lib/frontend/profile";
import { SettingsSubpageHeader } from "@/components/profile/settings-subpage-header";
import { SubscriptionManagement } from "@/components/profile/subscription-management";

/**
 * SETTINGS-SUBSCRIPTION-SPLIT (2026-09-11): "manage what I already have"
 * (cancel, billing portal, renewal date — see subscription-management.tsx)
 * previously lived at the top-level /analytics route, which was a mislabel
 * left over from an earlier pass — /analytics is now the Creator Analytics
 * dashboard (see (app)/analytics/page.tsx) and isn't a home for billing
 * management. Moved here instead, matching the same split pattern the
 * other real sub-UIs on Settings already use (Notifications, Security):
 * a nav row on the main Settings page links to this dedicated screen
 * rather than inlining a whole billing widget into that list.
 */
export default async function SubscriptionSettingsPage() {
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
      <SettingsSubpageHeader title="Subscription" />
      <SubscriptionManagement subscription={subscription} />
    </div>
  );
}
