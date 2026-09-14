/**
 * Plain client-fetch wrappers for the RaaS Studio management routes —
 * same shape as creator-dashboard.ts's fetchMonetizationStatus()/
 * upgradeCharacterMonetization() (no "server-only", called directly from
 * client components like monetize-character-card.tsx).
 */

export interface RaasPricingResponse {
  bond: number;
  soulbound: number;
  creatorRevenueSharePct: number;
}

export async function fetchRaasPricing(characterId: string): Promise<RaasPricingResponse> {
  const res = await fetch(`/api/creator/characters/${characterId}/raas-pricing`);
  if (!res.ok) throw new Error("Failed to load pricing");
  return res.json();
}

export interface RaasMutationResponse {
  ok?: boolean;
  error?: string;
}

export async function updateRaasPricing(
  characterId: string,
  updates: { bond?: number; soulbound?: number }
): Promise<RaasMutationResponse> {
  const res = await fetch(`/api/creator/characters/${characterId}/raas-pricing`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const body = (await res.json().catch(() => ({}))) as RaasMutationResponse;
  if (!res.ok) return { ok: false, error: body.error ?? "Update failed" };
  return { ok: true };
}

export type FineTuneTier = "bond" | "soulbound";

export interface CharacterFineTune {
  id: string;
  character_id: string;
  name: string;
  description: string;
  tier_required: FineTuneTier;
  voice_profile_overrides: Record<string, string>;
  lora_model_id: string | null;
  is_active: boolean;
  created_at: string;
}

export async function fetchFineTunes(characterId: string): Promise<CharacterFineTune[]> {
  const res = await fetch(`/api/creator/characters/${characterId}/fine-tunes`);
  if (!res.ok) throw new Error("Failed to load fine-tunes");
  const body = await res.json();
  return body.fineTunes ?? [];
}

export interface FineTuneFormInput {
  name: string;
  description: string;
  tierRequired: FineTuneTier;
  voiceProfileOverrides: Record<string, string>;
  loraModelId: string | null;
}

export async function createFineTune(
  characterId: string,
  input: FineTuneFormInput
): Promise<{ ok: boolean; fineTune?: CharacterFineTune; error?: string }> {
  const res = await fetch(`/api/creator/characters/${characterId}/fine-tunes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error ?? "Could not create fine-tune" };
  return { ok: true, fineTune: body.fineTune };
}

export async function updateFineTune(
  characterId: string,
  fineTuneId: string,
  patch: Partial<FineTuneFormInput> & { isActive?: boolean }
): Promise<RaasMutationResponse> {
  const res = await fetch(`/api/creator/characters/${characterId}/fine-tunes/${fineTuneId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = (await res.json().catch(() => ({}))) as RaasMutationResponse;
  if (!res.ok) return { ok: false, error: body.error ?? "Update failed" };
  return { ok: true };
}

export async function deleteFineTune(characterId: string, fineTuneId: string): Promise<RaasMutationResponse> {
  const res = await fetch(`/api/creator/characters/${characterId}/fine-tunes/${fineTuneId}`, {
    method: "DELETE",
  });
  const body = (await res.json().catch(() => ({}))) as RaasMutationResponse;
  if (!res.ok) return { ok: false, error: body.error ?? "Delete failed" };
  return { ok: true };
}
