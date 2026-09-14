import { getProfileSettings } from "@/lib/frontend/profile";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";
import { SettingsSubpageHeader } from "@/components/profile/settings-subpage-header";

/**
 * PROFILE / SETTINGS SPLIT: this is the dedicated identity-editing
 * surface (avatar, display name, username, bio, gender), pulled out of
 * /profile/settings so that page can stay strictly app-based (theme,
 * security, notifications, language, mature content, age verification,
 * streak shield, privacy — none of which describe who the user is).
 *
 * Linked from the read-only /profile overview's "Edit Profile" button.
 * Saves go through PATCH /api/profile/edit, not /api/profile/settings.
 */
export default async function ProfileEditPage() {
  const profile = await getProfileSettings();

  if (!profile) {
    return (
      <div className="mx-auto max-w-lg px-4 md:px-8 py-16 text-center text-text-secondary">
        Couldn&rsquo;t load your profile. Try refreshing.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 md:px-8 py-8">
      <SettingsSubpageHeader title="Edit Profile" backHref="/profile" backLabel="Back to Profile" />

      <AvatarUpload
        currentUrl={profile.avatar_url}
        displayName={profile.display_name ?? profile.username ?? "Your account"}
      />

      <div className="mt-6">
        <ProfileEditForm initial={profile} />
      </div>
    </div>
  );
}
