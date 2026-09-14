import { getProfileSettings } from "@/lib/frontend/profile";
import { getVerifiedTotpFactorCount } from "@/lib/auth/mfa";
import { SettingsForm } from "@/components/profile/settings-form";
import { DateOfBirthField } from "@/components/profile/date-of-birth-field";
import { SettingsNavRow } from "@/components/profile/settings-nav-row";
import { StreakShieldPanel } from "@/components/profile/streak-shield-panel";
import { DataPrivacyPanel } from "@/components/profile/data-privacy-panel";
import { ThemePicker } from "@/components/theme/theme-picker";
import { Bell, ShieldCheck, BarChart3, UserRound } from "lucide-react";

export default async function SettingsPage() {
  const profile = await getProfileSettings();

  if (!profile) {
    return (
      <div className="mx-auto max-w-lg px-4 md:px-8 py-16 text-center text-text-secondary">
        Couldn&rsquo;t load your settings. Try refreshing.
      </div>
    );
  }

  const verifiedFactorCount = await getVerifiedTotpFactorCount();

  return (
    <div className="mx-auto max-w-lg px-4 md:px-8 py-8 space-y-8">
      <div>
        <h1 className="font-display text-xl text-text-primary mb-6">Settings</h1>

        {/*
          PROFILE / SETTINGS SPLIT: avatar, display name, username, bio,
          and gender used to render inline here. Settings is app-based
          now (how the app behaves for you), not identity — those fields
          moved to their own surface at /profile/edit (ProfileEditForm,
          PATCH /api/profile/edit), reached via the nav row below rather
          than being editable on this page directly.
        */}
        <SettingsForm initial={profile} />
      </div>

      <div className="border-t border-border-hairline pt-6">
        <h2 className="text-sm font-semibold text-text-primary mb-1">Theme</h2>
        <p className="text-xs text-text-secondary mb-3">
          Changes apply instantly, everywhere in the app.
        </p>
        <ThemePicker />
      </div>

      {/*
        SETTINGS-NOTIFICATIONS-SPLIT / SETTINGS-SECURITY-SPLIT: both used
        to render their full sub-UI inline here (PushOptIn +
        NotificationPreferences's 14 categories x 2 channels; Security is
        a new feature build, see components/profile/two-factor-settings.tsx).
        Neither is a single toggle, so both get their own screen behind a
        nav row instead of growing this page into one long undifferentiated
        list — see settings/notifications/page.tsx and settings/security/page.tsx.
      */}
      <div className="border-t border-border-hairline pt-6 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary mb-1">Account</h2>
        <SettingsNavRow
          href="/profile/edit"
          icon={UserRound}
          label="Edit Profile"
          description="Photo, display name, username, bio, gender"
        />
        <SettingsNavRow
          href="/profile/settings/security"
          icon={ShieldCheck}
          label="Security"
          description="Two-factor authentication"
          badge={{
            text: verifiedFactorCount > 0 ? "On" : "Off",
            tone: verifiedFactorCount > 0 ? "on" : "off",
          }}
        />
        <SettingsNavRow
          href="/profile/settings/notifications"
          icon={Bell}
          label="Notifications"
          description="Push alerts and per-category preferences"
        />
        <SettingsNavRow
          href="/profile/settings/subscription"
          icon={BarChart3}
          label="Subscription"
          description="Billing, renewal, and plan management"
        />
      </div>

      <div id="verification" className="border-t border-border-hairline pt-6 scroll-mt-20">
        <h2 className="text-sm font-semibold text-text-primary mb-1">Age verification</h2>
        <p className="text-xs text-text-secondary mb-3">
          Required, along with the mature content setting above, to view
          companions marked as mature.
        </p>
        <DateOfBirthField />
      </div>

      <div className="border-t border-border-hairline pt-6">
        <h2 className="text-sm font-semibold text-text-primary mb-1">Streak shield</h2>
        <StreakShieldPanel />
      </div>

      <div className="border-t border-border-hairline pt-6">
        <h2 className="text-sm font-semibold text-text-primary mb-1">Privacy &amp; data</h2>
        <DataPrivacyPanel />
      </div>
    </div>
  );
}
