"use client";

import { useCallback, useState } from "react";
import type { RelationshipTier } from "@/lib/commerce/raas-constants";

/**
 * Mirrors GET/POST /api/relationships/[characterId]/upgrade's response
 * shapes — same "domain hook wraps plain fetch calls" convention as
 * use-character-page.ts / use-send-gift.ts.
 *   GET  200 { tier, isOwnCharacter, pricing: { bond, soulbound } }
 *   POST 200 { tier }
 *   POST 402 { error, code: 'INSUFFICIENT_TOKENS' }
 *   POST 403 { error, code: 'CANNOT_PURCHASE_OWN_CHARACTER' }
 *   POST 404 { error, code: 'CHARACTER_NOT_FOUND' }
 *   POST 429 { error, code: 'RATE_LIMIT_EXCEEDED' }
 */
export interface RelationshipTierStatus {
  tier: RelationshipTier;
  isOwnCharacter: boolean;
  pricing: { bond: number; soulbound: number };
}

export interface UpgradeTierError {
  error: string;
  code?: string;
}

export type TierLoadState = "idle" | "loading" | "ok" | "unauthorized" | "error";

export function useRelationshipTier(characterId: string) {
  const [status, setStatus] = useState<RelationshipTierStatus | null>(null);
  const [loadState, setLoadState] = useState<TierLoadState>("idle");
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [error, setError] = useState<UpgradeTierError | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const res = await fetch(`/api/relationships/${characterId}/upgrade`);
      if (res.status === 401) {
        setLoadState("unauthorized");
        return;
      }
      if (!res.ok) {
        setLoadState("error");
        return;
      }
      const body = (await res.json()) as RelationshipTierStatus;
      setStatus(body);
      setLoadState("ok");
    } catch {
      setLoadState("error");
    }
  }, [characterId]);

  const upgrade = useCallback(
    async (tier: "bond" | "soulbound"): Promise<boolean> => {
      setIsUpgrading(true);
      setError(null);
      try {
        const res = await fetch(`/api/relationships/${characterId}/upgrade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body) {
          setError((body as UpgradeTierError | null) ?? { error: `Upgrade failed (${res.status})` });
          return false;
        }
        setStatus((prev) => (prev ? { ...prev, tier: body.tier as RelationshipTier } : prev));
        return true;
      } catch (err) {
        setError({ error: err instanceof Error ? err.message : "Upgrade failed" });
        return false;
      } finally {
        setIsUpgrading(false);
      }
    },
    [characterId]
  );

  return {
    status,
    loadState,
    load,
    upgrade,
    isUpgrading,
    error,
    clearError: () => setError(null),
  };
}
