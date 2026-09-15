export interface BgLedgerTask {
  label: string;
  success_count: number;
  fail_count: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  last_user_id: string | null;
  updated_at: string;
}

export async function fetchBgLedger(): Promise<{
  tasks: BgLedgerTask[];
  totals: { success: number; fail: number };
  ts: string;
}> {
  const res = await fetch("/api/admin/bg-ledger");
  if (!res.ok) throw new Error("Failed to load background task ledger");
  return res.json();
}

export interface CircuitStats {
  circuits: Record<string, { state: string; [key: string]: unknown }>;
  queue: { depths: { high: number; normal: number; low: number }; total: number };
  ts: string;
}

export async function fetchCircuitStats(): Promise<CircuitStats> {
  const res = await fetch("/api/admin/circuit-stats");
  if (!res.ok) throw new Error("Failed to load circuit stats");
  return res.json();
}

export interface RecallAccuracyContradiction {
  id: string;
  user_id: string;
  character_id: string;
  verdict_reasoning: string | null;
  user_message: string;
  assistant_reply: string;
  graded_at: string | null;
}

export interface RecallAccuracyStats {
  windowDays: number;
  target: number;
  passRate: number | null;
  healthy: boolean;
  counts: {
    pending: number;
    consistent: number;
    contradicted: number;
    unverifiable: number;
    skipped: number;
  };
  recentContradictions: RecallAccuracyContradiction[];
  ts: string;
}

export async function fetchRecallAccuracy(): Promise<RecallAccuracyStats> {
  const res = await fetch("/api/admin/recall-accuracy");
  if (!res.ok) throw new Error("Failed to load recall-accuracy stats");
  return res.json();
}

export interface BackfillSummary {
  [key: string]: unknown;
}

export async function triggerUniverseImageBackfill(): Promise<BackfillSummary> {
  const res = await fetch("/api/admin/backfill-universe-images", { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Backfill failed");
  }
  return res.json();
}

export function waitlistExportUrl(format: "csv" | "json"): string {
  return `/api/admin/waitlist-export?format=${format}`;
}
