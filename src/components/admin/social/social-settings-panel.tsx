"use client";

import { useState } from "react";
import { Loader2, Save, Plug, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  testXConnection,
  updateSocialSettings,
  type SocialSettings,
  type TestConnectionResult,
} from "@/lib/frontend/admin-social-client";

export function SocialSettingsPanel({
  settings,
  onSettingsChanged,
}: {
  settings: SocialSettings;
  onSettingsChanged: (settings: SocialSettings) => void;
}) {
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(settings.autoPublishEnabled);
  const [dailyPostCap, setDailyPostCap] = useState(settings.dailyPostCap);
  const [saving, setSaving] = useState(false);
  const [savedJustNow, setSavedJustNow] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  const dirty = autoPublishEnabled !== settings.autoPublishEnabled || dailyPostCap !== settings.dailyPostCap;

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSavedJustNow(false);
    try {
      const updated = await updateSocialSettings({ autoPublishEnabled, dailyPostCap });
      onSettingsChanged(updated);
      setSavedJustNow(true);
      setTimeout(() => setSavedJustNow(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testXConnection());
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card interactive={false} className="p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-medium text-text-primary">X connection &amp; publishing</p>
          <p className="text-xs text-text-tertiary mt-0.5">
            Posted today: <span className="tabular-nums text-text-secondary">{settings.postedToday}</span> /{" "}
            <span className="tabular-nums text-text-secondary">{dailyPostCap}</span>
          </p>
        </div>
        {settings.xConfigured ? (
          <Badge variant="outline">credentials configured</Badge>
        ) : (
          <Badge variant="outline" className="border-danger/50 text-danger">
            X_* credentials missing
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button size="sm" variant="secondary" disabled={testing} onClick={runTest}>
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
          Test connection
        </Button>
        {testResult?.ok && (
          <span className="flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> Connected as @{testResult.account?.username}
          </span>
        )}
        {testResult && !testResult.ok && (
          <span className="flex items-center gap-1.5 text-sm text-danger">
            <XCircle className="h-4 w-4" /> {testResult.error}
          </span>
        )}
      </div>

      <div className="border-t border-border-hairline pt-4 space-y-3">
        <label className="flex items-start gap-2.5 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={autoPublishEnabled}
            onChange={(e) => setAutoPublishEnabled(e.target.checked)}
            className="mt-0.5 accent-gold-500"
          />
          <span>
            <span className="text-text-primary font-medium block">Auto-publish (unattended cron posting)</span>
            Off by default. When on, the X publisher cron posts eligible queued rows on its own, up to the daily
            cap below. When off, every queued post sits here until an admin publishes or rejects it.
          </span>
        </label>

        <label className="flex items-center gap-2.5 text-sm text-text-secondary">
          <span className="w-28 shrink-0">Daily post cap</span>
          <input
            type="number"
            min={0}
            max={500}
            value={dailyPostCap}
            onChange={(e) => setDailyPostCap(Math.max(0, Number(e.target.value)))}
            className="h-9 w-24 px-3 rounded-sm bg-base border border-border-hairline text-text-primary outline-none focus:border-gold-500/60"
          />
          <span className="text-xs text-text-tertiary">posts/day, across all characters</span>
        </label>

        {saveError && <p className="text-sm text-danger">{saveError}</p>}

        <div className="flex items-center gap-3">
          <Button size="sm" variant="primary" disabled={!dirty || saving} onClick={save}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
          {savedJustNow && <p className="text-sm text-gold-400">Saved.</p>}
        </div>
      </div>
    </Card>
  );
}
