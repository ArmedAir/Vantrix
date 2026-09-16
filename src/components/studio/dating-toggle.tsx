"use client";

import { useState } from "react";
import { Loader2, Heart, HeartOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { setCharacterDatingEnabled } from "@/hooks/use-studio";

/**
 * DATING-OPT-IN: mirrors VisibilityToggle exactly. Creator-submitted
 * characters start with dating_enabled=false (see characters/route.ts's
 * ACTIVATION-FIX comment) so a still-pending character can't be silently
 * dating-eligible the moment it exists — this is the toggle that lets the
 * owner actually turn it on once their character has cleared moderation.
 */
export function DatingToggle({
  characterId,
  datingEnabled,
  canEnable,
}: {
  characterId: string;
  datingEnabled: boolean;
  canEnable: boolean;
}) {
  const [enabled, setEnabled] = useState(datingEnabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (loading) return;
    const next = !enabled;
    // Approval-gated in the other direction only: enabling requires
    // moderation_status === 'approved' (canSetDatingEnabled, see
    // dating/route.ts) — disabling is always allowed, so only block the
    // enable-bound flip client-side.
    if (next && !canEnable) {
      setError("Waiting on moderation approval before dating can be enabled.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await setCharacterDatingEnabled(characterId, next);
      setEnabled(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update dating setting.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={loading}
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ease-premium",
          enabled
            ? "border-gold-500/50 text-gold-400 hover:border-gold-400"
            : "border-border-hairline text-text-secondary hover:text-text-primary"
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : enabled ? (
          <Heart className="h-3.5 w-3.5" />
        ) : (
          <HeartOff className="h-3.5 w-3.5" />
        )}
        {enabled ? "Dating on" : "Dating off"}
      </button>
      {error && <p className="text-[11px] text-danger max-w-[160px] text-right">{error}</p>}
    </div>
  );
}
