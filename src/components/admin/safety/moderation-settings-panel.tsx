"use client";

import { useState, useEffect } from "react";
import { Loader2, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchModerationPromptConfig,
  updateModerationPromptConfig,
} from "@/lib/frontend/admin-safety";

/**
 * Admin-tunable "taste" layer for AI content moderation — additive text
 * appended to the immutable base moderation prompt (see
 * src/lib/moderation/index.ts). This can clarify what counts as
 * acceptable mature content for the platform, but it can never carve out
 * an exception for minors, sexual violence, hate, real-world violence, or
 * exploitation: the server rejects any allow-notes text that references
 * those categories (see the route's containsHardBlockedLanguage() guard),
 * and the sync blocklist in moderateCharacter() always runs before this
 * config is even consulted. Reply-guard's live chat blocklist and the
 * crisis-detection/response pipeline are entirely untouched by this panel.
 */
export function ModerationSettingsPanel() {
  const [extraAllowNotes, setExtraAllowNotes] = useState("");
  const [extraBlockNotes, setExtraBlockNotes] = useState("");
  const [initial, setInitial] = useState({ allow: "", block: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedJustNow, setSavedJustNow] = useState(false);

  useEffect(() => {
    fetchModerationPromptConfig()
      .then((c) => {
        setExtraAllowNotes(c.extra_allow_notes);
        setExtraBlockNotes(c.extra_block_notes);
        setInitial({ allow: c.extra_allow_notes, block: c.extra_block_notes });
      })
      .finally(() => setIsLoading(false));
  }, []);

  const dirty = extraAllowNotes !== initial.allow || extraBlockNotes !== initial.block;

  async function save() {
    setSaving(true);
    setError(null);
    setSavedJustNow(false);
    try {
      await updateModerationPromptConfig({ extraAllowNotes, extraBlockNotes });
      setInitial({ allow: extraAllowNotes, block: extraBlockNotes });
      setSavedJustNow(true);
      setTimeout(() => setSavedJustNow(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <p className="text-text-secondary text-sm">Loading…</p>;
  }

  return (
    <Card interactive={false} className="p-4 sm:p-5 space-y-4">
      <p className="text-text-secondary text-xs leading-relaxed">
        This only tunes the taste-level guidance appended to the AI
        moderation prompt. It cannot weaken the hard-coded blocklist
        (minors, sexual violence, hate, real-world violence, exploitation),
        reply-guard&apos;s live chat blocklist, or crisis detection — those
        stay code-only and unconditional.
      </p>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          Additional allow guidance
        </label>
        <textarea
          value={extraAllowNotes}
          onChange={(e) => setExtraAllowNotes(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="e.g. clarify what counts as acceptable mature/romantic content for this platform…"
          className="w-full px-3 py-2 rounded-sm bg-base border border-border-hairline text-sm text-text-primary placeholder:text-text-tertiary focus:border-gold-500/60 outline-none resize-y"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          Additional block guidance
        </label>
        <textarea
          value={extraBlockNotes}
          onChange={(e) => setExtraBlockNotes(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="e.g. flag additional platform-specific content to reject…"
          className="w-full px-3 py-2 rounded-sm bg-base border border-border-hairline text-sm text-text-primary placeholder:text-text-tertiary focus:border-gold-500/60 outline-none resize-y"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" disabled={!dirty || saving} onClick={save}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </Button>
        {savedJustNow && <span className="text-xs text-gold-400">Saved</span>}
      </div>
    </Card>
  );
}
