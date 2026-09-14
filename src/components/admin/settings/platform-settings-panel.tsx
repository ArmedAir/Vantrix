"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PlatformSettingsData {
  maintenance_mode: boolean;
  maintenance_message: string;
  new_signups_enabled: boolean;
  mature_content_enabled: boolean;
}

const inputClass =
  "w-full rounded-sm bg-base border border-interactive px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold-500/60";

export function PlatformSettingsPanel() {
  const [data, setData] = useState<PlatformSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/platform-settings");
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load");
        if (!cancelled) setData(body.settings);
      } catch {
        if (!cancelled) setLoadError("Couldn't load platform settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!data) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maintenanceMode: data.maintenance_mode,
          maintenanceMessage: data.maintenance_message,
          newSignupsEnabled: data.new_signups_enabled,
          matureContentEnabled: data.mature_content_enabled,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSaveError(body.error ?? "Couldn't save changes.");
        return;
      }
      setSaved(true);
    } catch {
      setSaveError("Couldn't save changes. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading platform settings&hellip;
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <p className="text-sm text-danger py-6">{loadError ?? "Couldn't load platform settings."}</p>
    );
  }

  return (
    <div className="space-y-5">
      <ToggleRow
        label="Maintenance mode"
        description="Blocks non-admin traffic and shows the maintenance message below."
        warn={data.maintenance_mode}
        checked={data.maintenance_mode}
        onChange={(v) => setData({ ...data, maintenance_mode: v })}
      />
      {data.maintenance_mode && (
        <div className="pl-1">
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Maintenance message
          </label>
          <textarea
            value={data.maintenance_message}
            onChange={(e) => setData({ ...data, maintenance_message: e.target.value })}
            rows={2}
            maxLength={500}
            className={cn(inputClass, "resize-none")}
          />
        </div>
      )}

      <ToggleRow
        label="New signups"
        description="When off, new account creation is disabled. Existing users are unaffected."
        warn={!data.new_signups_enabled}
        checked={data.new_signups_enabled}
        onChange={(v) => setData({ ...data, new_signups_enabled: v })}
      />

      <ToggleRow
        label="Mature content (platform-wide)"
        description="Master override. When off, mature content is unavailable for everyone regardless of individual account settings."
        warn={!data.mature_content_enabled}
        checked={data.mature_content_enabled}
        onChange={(v) => setData({ ...data, mature_content_enabled: v })}
      />

      {saveError && <p className="text-sm text-danger">{saveError}</p>}

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
        </Button>
        {saved && !saving && (
          <span className="flex items-center gap-1 text-sm text-gold-400">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  warn,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  warn?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-4 rounded-sm border px-4 py-3 cursor-pointer transition-colors duration-150",
        warn ? "border-amber-500/40" : "border-border-hairline"
      )}
    >
      <div>
        <div className="flex items-center gap-1.5 text-sm text-text-primary font-medium">
          {warn && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
          {label}
        </div>
        <div className="text-xs text-text-secondary mt-0.5">{description}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-gold-500"
      />
    </label>
  );
}
