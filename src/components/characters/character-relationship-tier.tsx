"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Heart, Infinity as InfinityIcon, Loader2, Check, X, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRelationshipTier } from "@/hooks/use-relationship-tier";
import {
  RELATIONSHIP_TIER_COPY,
  tiersAbove,
  type RelationshipTier,
} from "@/lib/commerce/raas-constants";

const TIER_ICONS: Record<RelationshipTier, LucideIcon> = {
  spark: Sparkles,
  bond: Heart,
  soulbound: InfinityIcon,
};

const ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_TOKENS: "Not enough Vantrix Coin for this tier.",
  CANNOT_PURCHASE_OWN_CHARACTER: "You can't purchase a tier on your own character.",
  RATE_LIMIT_EXCEEDED: "Too many attempts right now — try again in a minute.",
  CHARACTER_NOT_FOUND: "Character not found.",
};

/**
 * RaaS surfacing (2026-09-13): purchaseRelationshipTier()/getCharacterPricing()
 * in lib/commerce/raas.ts and the upgrade API route were fully built and
 * wired to the token ledger + creator earnings, but nothing in the app ever
 * called them — no page linked here, same "buried feature" shape as prior
 * sweeps found elsewhere in this codebase. This is that surface: a status
 * widget (current tier) plus a drawer to buy the next one, following the
 * character-relationship-progress.tsx / gift-drawer.tsx conventions already
 * established on this page (fails soft, signed-out-only no-op).
 *
 * Hidden entirely for the character's own creator (pricing.creatorId ===
 * userId server-side) — a creator can't buy a paid tier on their own
 * character, so there's nothing to show here for them; they manage this
 * character's fine-tune packs from Studio instead.
 */
export function CharacterRelationshipTier({ characterId }: { characterId: string }) {
  const { status, loadState, load, upgrade, isUpgrading, error, clearError } =
    useRelationshipTier(characterId);
  const [open, setOpen] = useState(false);
  const [justUpgraded, setJustUpgraded] = useState<RelationshipTier | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  if (loadState === "unauthorized" || loadState === "error" || !status || status.isOwnCharacter) {
    return null;
  }

  const { tier, pricing } = status;
  const current = RELATIONSHIP_TIER_COPY[tier];
  const CurrentIcon = TIER_ICONS[tier];
  const upgradeOptions = tiersAbove(tier);

  async function handleUpgrade(target: "bond" | "soulbound") {
    clearError();
    const ok = await upgrade(target);
    if (ok) {
      setOpen(false);
      setJustUpgraded(target);
      setTimeout(() => setJustUpgraded(null), 3000);
    }
  }

  return (
    <>
      <Card interactive={false} className="mx-auto mt-4 max-w-xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CurrentIcon className="h-4 w-4 shrink-0 text-gold-400" />
            <div>
              <p className="text-sm font-semibold text-text-primary">{current.label} tier</p>
              <p className="text-xs text-text-tertiary">{current.blurb}</p>
            </div>
          </div>
          {upgradeOptions.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
              Upgrade
            </Button>
          )}
        </div>
        {justUpgraded && (
          <p className="mt-3 flex items-center gap-2 rounded-sm border border-gold-500/30 bg-gradient-to-r from-gold-500/10 to-transparent px-3 py-2 text-sm text-gold-400">
            <Check className="h-4 w-4 shrink-0" /> Upgraded to {RELATIONSHIP_TIER_COPY[justUpgraded].label}
          </p>
        )}
      </Card>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
            onClick={() => setOpen(false)}
          >
            <div
              className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-lg border border-border-hairline bg-base p-4 sm:rounded-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-base text-text-primary">Upgrade the relationship</h2>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="text-text-secondary hover:text-text-primary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {error && (
                <p className="mb-3 rounded-sm border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {(error.code && ERROR_MESSAGES[error.code]) || error.error}
                </p>
              )}

              <div className="flex flex-col gap-3">
                {upgradeOptions.map((t) => {
                  const copy = RELATIONSHIP_TIER_COPY[t];
                  const Icon = TIER_ICONS[t];
                  return (
                    <div key={t} className="rounded-md border border-border-hairline p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-gold-400" />
                          <span className="text-sm font-semibold text-text-primary">{copy.label}</span>
                        </div>
                        <span className="text-sm text-gold-400">{pricing[t].toLocaleString()} coins</span>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {copy.perks.map((perk) => (
                          <li key={perk} className="flex items-start gap-2 text-xs text-text-secondary">
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-gold-500" />
                            {perk}
                          </li>
                        ))}
                      </ul>
                      <Button
                        size="sm"
                        className="mt-3 w-full"
                        disabled={isUpgrading}
                        onClick={() => handleUpgrade(t)}
                      >
                        {isUpgrading && <Loader2 className="h-4 w-4 animate-spin" />}
                        Unlock {copy.label}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
