"use client";

import { useEffect, useState } from "react";
import { Loader2, Coins, CheckCircle2, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchMonetizationStatus,
  upgradeCharacterMonetization,
  type MonetizationStatusResponse,
} from "@/lib/frontend/creator-dashboard";

/**
 * Public + approved doesn't automatically mean monetized — this card is
 * the one place a creator opts a character into the Creator Fund, paying
 * character_monetization_upgrade_fee once (see
 * upgrade_character_monetization() in
 * 20270115_creator_fund_character_value_score.sql). Placed on the
 * character's studio detail page, next to VisibilityToggle.
 */
export function MonetizeCharacterCard({ characterId }: { characterId: string }) {
  const [status, setStatus] = useState<MonetizationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMonetizationStatus(characterId)
      .then(setStatus)
      .catch(() => setError("Couldn't load monetization status."))
      .finally(() => setLoading(false));
  }, [characterId]);

  async function handleUpgrade() {
    if (upgrading) return;
    setUpgrading(true);
    setError(null);
    const result = await upgradeCharacterMonetization(characterId);
    if (result.ok) {
      setStatus((prev) => (prev ? { ...prev, monetizationStatus: "eligible" } : prev));
    } else {
      setError(result.error ?? "Couldn't upgrade this character.");
    }
    setUpgrading(false);
  }

  if (loading) {
    return <Card interactive={false} className="p-4 h-20 animate-pulse bg-white/[0.02]" />;
  }
  if (!status) return null;

  if (status.monetizationStatus === "eligible") {
    return (
      <Card interactive={false} className="p-4 flex items-center gap-3">
        <CheckCircle2 className="h-4 w-4 text-success shrink-0" strokeWidth={1.75} />
        <div>
          <p className="text-sm text-text-primary">Enrolled in the Creator Fund</p>
          <p className="text-xs text-text-tertiary">
            This character earns a weekly share of the fund pool based on returning-user engagement.
          </p>
        </div>
      </Card>
    );
  }

  if (status.monetizationStatus === "suspended") {
    return (
      <Card interactive={false} className="p-4 flex items-center gap-3 border-danger/30">
        <Lock className="h-4 w-4 text-danger shrink-0" strokeWidth={1.75} />
        <p className="text-sm text-text-secondary">
          Creator Fund monetization for this character was suspended by moderation.
        </p>
      </Card>
    );
  }

  return (
    <Card interactive={false} className="p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Coins className="h-4 w-4 text-gold-500 shrink-0" strokeWidth={1.75} />
          <div>
            <p className="text-sm text-text-primary">Join the Creator Fund</p>
            <p className="text-xs text-text-tertiary">
              {status.eligible
                ? `One-time ${status.upgradeFeeTokens.toLocaleString()} Vantrix Coin fee. Earns a weekly share of the fund pool from returning users.`
                : "Character must be public and approved before it can be monetized."}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" disabled={!status.eligible || upgrading} onClick={handleUpgrade}>
          {upgrading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Upgrade \u2014 ${status.upgradeFeeTokens} VC`}
        </Button>
      </div>
      {error && <p className="text-[11px] text-danger mt-2">{error}</p>}
    </Card>
  );
}
