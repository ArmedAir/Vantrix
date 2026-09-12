"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProfileSettings } from "@/lib/frontend/profile";
import { LANGUAGE_OPTIONS } from "@/lib/ai/language-names";
import { COUNTRIES, countryCodeToFlag } from "@/lib/geo/countries";

const inputClass =
  "w-full rounded-sm bg-base border border-interactive px-4 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold-500/60";

/**
 * PROFILE / SETTINGS SPLIT: this form used to also carry identity
 * fields (display_name, username, bio, gender, avatar). Those moved to
 * /profile/edit + ProfileEditForm (POST /api/profile/edit) — see that
 * component's docstring. What's left here is strictly app-behavior:
 * how the app talks to you (response language) and what it shows you
 * (mature content). Field set matches settingsSchema in
 * profile/settings/route.ts exactly.
 *
 * theme_skin/theme_accent are deliberately NOT exposed here — this
 * rebuild's black/gold theme is the only theme (§9.5 resolved: no
 * selectable second theme, see tailwind.config.ts's own comment), so a
 * skin picker would contradict the directive rather than serve it, even
 * though the backend column still accepts a value.
 *
 * COUNTRY-FIELD FIX: `country` has been a whitelisted, PATCH-able column
 * on this exact route (and on ProfileSettings/getProfileSettings) all
 * along, with a full curated picker + flag helper already built at
 * lib/geo/countries.ts (see that file's own FLAGS-FIX comment) — but no
 * component ever rendered it, so it was only ever set by geo-detection
 * at signup and had no user-facing way to correct or change it. Added
 * here as a plain select alongside the other app-behavior fields.
 */
export function SettingsForm({ initial }: { initial: ProfileSettings }) {
  const router = useRouter();
  const [preferredLanguage, setPreferredLanguage] = useState(initial.preferred_language ?? "auto");
  const [nsfwEnabled, setNsfwEnabled] = useState(initial.nsfw_enabled);
  const [country, setCountry] = useState(initial.country ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferred_language: preferredLanguage,
          nsfw_enabled: nsfwEnabled,
          ...(country ? { country } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't save changes.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Couldn't save changes. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Field label="Response language">
        <select
          value={preferredLanguage}
          onChange={(e) => setPreferredLanguage(e.target.value)}
          className={cn(inputClass, "h-11")}
        >
          {LANGUAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-text-secondary mt-1.5">
          Auto-detect follows whatever language you type in. Pick a language
          to have your companions always reply in it instead.
        </p>
      </Field>

      <Field label="Country">
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className={cn(inputClass, "h-11")}
        >
          <option value="">Not set</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {countryCodeToFlag(c.code)} {c.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-text-secondary mt-1.5">
          Used for currency and regional recommendations.
        </p>
      </Field>

      <label
        className={cn(
          "flex items-center justify-between rounded-sm border px-4 py-3 cursor-pointer transition-colors duration-150",
          nsfwEnabled ? "border-gold-500/50" : "border-border-hairline"
        )}
      >
        <div>
          <div className="text-sm text-text-primary font-medium">
            Mature content
          </div>
          <div className="text-xs text-text-secondary mt-0.5">
            Allow mature companions and content in Discovery — the other
            half of what unlocks them is{" "}
            <Link href="#verification" className="text-gold-400 hover:text-gold-300 underline underline-offset-2">
              age verification
            </Link>
          </div>
        </div>
        <input
          type="checkbox"
          checked={nsfwEnabled}
          onChange={(e) => setNsfwEnabled(e.target.checked)}
          className="h-5 w-5 accent-gold-500"
        />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
        </Button>
        {saved && !saving && (
          <span className="flex items-center gap-1 text-sm text-gold-400">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-secondary mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
