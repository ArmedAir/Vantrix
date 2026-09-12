export type { CreatorDashboard, CharacterFundDashboardEntry } from "@/lib/commerce/character-fund";

/**
 * SERVER-SIDE FIX (2026-09-12): fetchCreatorDashboard() (the client-side
 * fetch("/api/creator/dashboard") wrapper) is removed — its one caller,
 * creator-earnings-dashboard.tsx, now receives its data as a server-
 * resolved prop instead (see getCreatorAnalyticsDashboard() in
 * creator-analytics.server.ts and that dashboard component's own
 * SERVER-SIDE FIX comment). The monetization helpers below are untouched:
 * they back an actual user-initiated write (POST .../monetization from
 * monetize-character-card.tsx's upgrade button), which is a client
 * interaction by nature, not a page-load read — nothing about "make
 * analytics server-side" applies to a click handler triggering a mutation.
 */

export interface MonetizationStatusResponse {
  monetizationStatus: "none" | "eligible" | "suspended";
  monetizationUpgradedAt: string | null;
  upgradeFeeTokens: number;
  eligible: boolean;
}

export async function fetchMonetizationStatus(characterId: string): Promise<MonetizationStatusResponse> {
  const res = await fetch(`/api/creator/characters/${characterId}/monetization`);
  if (!res.ok) throw new Error("Failed to load monetization status");
  return res.json();
}

export interface MonetizationUpgradeResponse {
  ok?: boolean;
  error?: string;
  code?: string;
}

export async function upgradeCharacterMonetization(characterId: string): Promise<MonetizationUpgradeResponse> {
  const res = await fetch(`/api/creator/characters/${characterId}/monetization`, { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as MonetizationUpgradeResponse;
  if (!res.ok) {
    return { ok: false, error: body.error ?? "Upgrade failed", code: body.code };
  }
  return body;
}
