import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * Shared header for every Settings sub-page (Notifications, Security,
 * ...) and for the standalone Edit Profile page. backHref/backLabel
 * default to "back to Settings" since that's every existing caller;
 * Edit Profile (under /profile, not /profile/settings) passes its own
 * since it isn't a Settings sub-page — see profile/edit/page.tsx.
 */
export function SettingsSubpageHeader({
  title,
  backHref = "/profile/settings",
  backLabel = "Back to Settings",
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-6">
      <Link
        href={backHref}
        aria-label={backLabel}
        className="text-text-tertiary hover:text-text-primary -ml-1 p-1"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <h1 className="font-display text-xl text-text-primary">{title}</h1>
    </div>
  );
}
