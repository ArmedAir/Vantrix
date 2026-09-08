import { getSocialQueueSnapshot } from "@/lib/frontend/admin-social";
import { SocialReviewConsole } from "@/components/admin/social/social-review-console";

export default async function AdminSocialPage() {
  const { items, counts, settings } = await getSocialQueueSnapshot();

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <div>
        <h2 className="font-display text-2xl mb-1">Social</h2>
        <p className="text-text-secondary text-sm">
          X cross-posting queue — nothing reaches @Vantrix until it&apos;s published, either by an admin here or
          by the auto-publish cron once turned on below.
        </p>
      </div>
      <SocialReviewConsole initialItems={items} initialCounts={counts} initialSettings={settings} />
    </div>
  );
}
