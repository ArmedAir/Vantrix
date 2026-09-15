"use client";

import { useEffect, useState } from "react";
import { fetchRaasPricing } from "@/lib/frontend/raas-studio";

const DEFAULT_BOND = 500;
const DEFAULT_SOULBOUND = 1500;

/**
 * DISCOVERABILITY FIX: the "Relationship" tab (renamed "Pricing & Tiers"
 * below) had no visual cue that anything lived there — Memory/Gallery show
 * counts right on their own tab triggers, this one showed nothing, so a
 * creator had no reason to ever open it. A character silently earning
 * nothing beyond the untouched 500/1500 token defaults looks identical to
 * one a creator deliberately priced that way, so this can only ever nudge
 * ("Set pricing" when still at defaults) — it can't claim to know intent.
 */
export function PricingTabBadge({ characterId }: { characterId: string }) {
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRaasPricing(characterId)
      .then((p) => {
        if (!cancelled) {
          setNeedsSetup(p.bond === DEFAULT_BOND && p.soulbound === DEFAULT_SOULBOUND);
        }
      })
      .catch(() => {
        /* fails soft — no badge is better than a broken one */
      });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  if (!needsSetup) return null;

  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-gold-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-gold-400 align-middle">
      Set pricing
    </span>
  );
}
