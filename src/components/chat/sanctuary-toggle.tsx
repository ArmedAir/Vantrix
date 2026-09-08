"use client";

import { useState } from "react";
import { Sparkles, Globe, Loader2 } from "lucide-react";

/**
 * Chat-header entry point for the Sanctuary/World toggle (see
 * 20270111_sanctuary_mode_toggle.sql + PATCH /api/conversations/[id]).
 * Sanctuary (on) = isolated intimacy, no living-world context in the
 * prompt. World (off, default) = the existing always-on universeContext
 * behavior. Optimistic update with rollback on failure, same shape as
 * GiftDrawer's fetch handling elsewhere in this header.
 */
export function SanctuaryToggle({
  conversationId,
  initialSanctuaryMode,
}: {
  conversationId: string;
  initialSanctuaryMode: boolean;
}) {
  const [sanctuaryMode, setSanctuaryMode] = useState(initialSanctuaryMode);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    if (saving) return;
    const next = !sanctuaryMode;
    setSanctuaryMode(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sanctuaryMode: next }),
      });
      if (!res.ok) throw new Error("Could not update conversation");
    } catch {
      // Roll back on failure — don't leave the UI claiming a state the
      // server never persisted.
      setSanctuaryMode(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      aria-label={
        sanctuaryMode
          ? "Sanctuary mode on — switch to World mode"
          : "World mode on — switch to Sanctuary mode"
      }
      aria-pressed={sanctuaryMode}
      title={sanctuaryMode ? "Sanctuary mode" : "World mode"}
      className={
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ease-premium hover:bg-white/[0.04] disabled:opacity-60 " +
        (sanctuaryMode ? "text-gold-400" : "text-text-secondary hover:text-gold-400")
      }
    >
      {saving ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : sanctuaryMode ? (
        <Sparkles className="h-5 w-5" />
      ) : (
        <Globe className="h-5 w-5" />
      )}
    </button>
  );
}
