"use client";

import { useEffect, useState } from "react";
import { Loader2, Coins } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchRaasPricing, updateRaasPricing } from "@/lib/frontend/raas-studio";

const inputClass =
  "w-28 rounded-sm bg-base border border-interactive px-3 h-10 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold-500/60 tabular-nums";

/**
 * RaaS surfacing (Studio half): characters.raas_pricing was set at
 * character-creation defaults (500/1500) and never editable anywhere —
 * see character-relationship-tier.tsx's own comment for the buyer-facing
 * half of this same gap. Revenue share is shown for context but isn't a
 * form field — it's platform-set (creator_revenue_share_pct), not
 * creator-editable.
 */
export function RaasPricingCard({ characterId }: { characterId: string }) {
  const [bond, setBond] = useState<number | "">("");
  const [soulbound, setSoulbound] = useState<number | "">("");
  const [revenueSharePct, setRevenueSharePct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchRaasPricing(characterId)
      .then((p) => {
        setBond(p.bond);
        setSoulbound(p.soulbound);
        setRevenueSharePct(p.creatorRevenueSharePct);
      })
      .catch(() => setError("Couldn't load pricing."))
      .finally(() => setLoading(false));
  }, [characterId]);

  async function handleSave() {
    if (bond === "" || soulbound === "") return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await updateRaasPricing(characterId, { bond, soulbound });
    if (result.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError(result.error ?? "Couldn't save pricing.");
    }
    setSaving(false);
  }

  if (loading) {
    return <Card interactive={false} className="p-4 h-24 animate-pulse bg-white/[0.02]" />;
  }

  return (
    <Card interactive={false} className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Coins className="h-4 w-4 text-gold-500 shrink-0" strokeWidth={1.75} />
        <div>
          <p className="text-sm text-text-primary font-semibold">Relationship tier pricing</p>
          <p className="text-xs text-text-tertiary">
            What fans pay in Vantrix Coin to unlock a deeper relationship with this character.
            {revenueSharePct !== null && ` You keep ${revenueSharePct}% of every purchase.`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">Bond tier</span>
          <input
            type="number"
            min={50}
            max={50000}
            value={bond}
            onChange={(e) => setBond(e.target.value === "" ? "" : Number(e.target.value))}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">Soulbound tier</span>
          <input
            type="number"
            min={50}
            max={50000}
            value={soulbound}
            onChange={(e) => setSoulbound(e.target.value === "" ? "" : Number(e.target.value))}
            className={inputClass}
          />
        </label>
        <Button
          size="sm"
          variant="secondary"
          disabled={saving || bond === "" || soulbound === ""}
          onClick={handleSave}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save pricing
        </Button>
        {saved && <span className="text-xs text-gold-400">Saved</span>}
      </div>
      {error && <p className="text-[11px] text-danger mt-2">{error}</p>}
    </Card>
  );
}
