"use client";

import Link from "next/link";
import { ArrowUpRight, Send } from "lucide-react";
import { PlatformSettingsPanel } from "@/components/admin/settings/platform-settings-panel";
import { ModerationSettingsPanel } from "@/components/admin/safety/moderation-settings-panel";
import { ShieldAlert } from "lucide-react";

/**
 * ADMIN-SETTINGS-HUB: until now, admin-editable config was scattered with
 * no single home — moderation_prompt_config lived only inside a Trust &
 * Safety tab, social_settings only inside a Social tab, and there was no
 * home at all for general platform-level toggles (maintenance mode,
 * new-signup gate, global mature-content gate). This page is that home.
 *
 * General settings and Moderation settings are embedded directly (both
 * panels are self-contained, no props needed). Social settings takes
 * live settings state as props from its parent review console
 * (social-review-console.tsx) rather than fetching its own — duplicating
 * that fetch/save wiring here would fork two sources of truth for the
 * same table, so it's linked out to instead, same as the nav-row pattern
 * user Settings already uses for Notifications/Security/Subscription.
 */
export default function AdminSettingsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">
      <div>
        <h2 className="font-display text-2xl mb-1">Settings</h2>
        <p className="text-text-secondary text-sm">
          Platform-wide configuration in one place.
        </p>
      </div>

      <section>
        <h3 className="font-display text-lg mb-1">General</h3>
        <p className="text-xs text-text-secondary mb-4">
          Maintenance mode, new signups, and the global mature-content gate.
        </p>
        <PlatformSettingsPanel />
      </section>

      <section className="border-t border-border-hairline pt-6">
        <h3 className="font-display text-lg mb-1">AI Moderation</h3>
        <p className="text-xs text-text-secondary mb-4">
          Taste-level tuning for the AI moderation prompt. Cannot override
          the hard-coded minors/violence/hate/exploitation blocklist.
        </p>
        <ModerationSettingsPanel />
      </section>

      <section className="border-t border-border-hairline pt-6">
        <h3 className="font-display text-lg mb-1">Social</h3>
        <p className="text-xs text-text-secondary mb-4">
          X cross-posting cadence and publish behavior.
        </p>
        <Link
          href="/admin/social"
          className="flex items-center justify-between rounded-sm border border-border-hairline px-4 py-3 hover:border-gold-500/50 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm text-text-primary">
            <Send className="h-4 w-4 text-text-tertiary" />
            Manage on the Social page
          </span>
          <ArrowUpRight className="h-4 w-4 text-text-tertiary" />
        </Link>
      </section>

      <section className="border-t border-border-hairline pt-6">
        <h3 className="font-display text-lg mb-1">Permissions</h3>
        <p className="text-xs text-text-secondary mb-4">
          Grant or revoke moderator permissions, including the ones on this page.
        </p>
        <Link
          href="/admin/permissions"
          className="flex items-center justify-between rounded-sm border border-border-hairline px-4 py-3 hover:border-gold-500/50 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm text-text-primary">
            <ShieldAlert className="h-4 w-4 text-text-tertiary" />
            Manage on the Permissions page
          </span>
          <ArrowUpRight className="h-4 w-4 text-text-tertiary" />
        </Link>
      </section>
    </div>
  );
}
