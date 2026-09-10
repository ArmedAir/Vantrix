import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CreatorEarningsDashboard } from "@/components/studio/creator-dashboard/creator-earnings-dashboard";

export default function StudioEarningsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-6">
      <Link
        href="/studio"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Studio
      </Link>

      <h1 className="font-display text-2xl text-text-primary mb-1">Earnings</h1>
      <p className="text-sm text-text-secondary mb-6">
        Your marketplace sales and Creator Fund share, combined. The fund pays out weekly based on returning-user
        engagement, not raw message volume.
      </p>

      <CreatorEarningsDashboard />
    </div>
  );
}
