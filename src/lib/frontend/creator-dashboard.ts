import type { CreatorDashboard } from "@/lib/commerce/character-fund";

export type { CreatorDashboard, CharacterFundDashboardEntry } from "@/lib/commerce/character-fund";

export async function fetchCreatorDashboard(): Promise<CreatorDashboard> {
  const res = await fetch("/api/creator/dashboard");
  if (!res.ok) throw new Error("Failed to load creator dashboard");
  return res.json();
}

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
