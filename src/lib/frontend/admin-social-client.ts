import type { SocialPost, SocialPostStatus, SocialSettings } from "@/lib/frontend/admin-social";

export type { SocialPost, SocialPostStatus, SocialSettings };

export interface FetchSocialPostsParams {
  status?: SocialPostStatus | "all";
  characterId?: string;
  before?: string;
  limit?: number;
}

export async function fetchSocialPosts(
  params: FetchSocialPostsParams = {},
): Promise<{ items: SocialPost[]; hasMore: boolean }> {
  const qs = new URLSearchParams();
  if (params.status && params.status !== "all") qs.set("status", params.status);
  if (params.characterId) qs.set("characterId", params.characterId);
  if (params.before) qs.set("before", params.before);
  if (params.limit) qs.set("limit", String(params.limit));

  const res = await fetch(`/api/admin/social?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed to load social queue");
  return { items: data.items ?? [], hasMore: Boolean(data.hasMore) };
}

export async function fetchSocialCounts(): Promise<Record<SocialPostStatus, number>> {
  const res = await fetch("/api/admin/social?counts=1");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed to load queue counts");
  return data.counts;
}

export interface TestConnectionResult {
  ok: boolean;
  account?: { id: string; username: string; name: string };
  error?: string;
}

/** POSTs to the parent route — a connection test, not a queue mutation (see that route's own doc comment). */
export async function testXConnection(): Promise<TestConnectionResult> {
  const res = await fetch("/api/admin/social", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error ?? "Connection test failed" };
  return data;
}

export type SocialReviewAction = { action: "publish" } | { action: "reject"; notes?: string };

export async function reviewSocialPost(
  id: string,
  payload: SocialReviewAction,
): Promise<{ id: string; status: SocialPostStatus }> {
  const res = await fetch(`/api/admin/social/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Action failed");
  return data.item;
}

export async function fetchSocialSettings(): Promise<SocialSettings> {
  const res = await fetch("/api/admin/social/settings");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed to load settings");
  return data;
}

export interface UpdateSocialSettingsInput {
  autoPublishEnabled?: boolean;
  dailyPostCap?: number;
}

export async function updateSocialSettings(input: UpdateSocialSettingsInput): Promise<SocialSettings> {
  const res = await fetch("/api/admin/social/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed to update settings");
  return data;
}
