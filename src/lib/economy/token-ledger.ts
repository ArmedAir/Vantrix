import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface TokenLedgerEntry {
  id: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

// Known reasons from token_ledger's own writers (deduct_tokens/add_tokens/
// refund_tokens/credit_subscription_tokens default args, send_gift,
// start_date_session, voice/tts/route.ts — see 20261212_token_ledger.sql).
// Anything not in this map still displays fine via the humanized fallback
// below, so a new reason string introduced later never renders blank.
const REASON_LABELS: Record<string, string> = {
  token_spend: "Spent",
  token_credit: "Credit",
  refund: "Refund",
  subscription_credit: "Subscription credit",
  gift_sent: "Gift sent",
  date_session: "Date started",
  voice_tts: "Voice message",
  voice_tts_failed_refund: "Voice message refund",
  admin_adjustment: "Adjustment",
  character_creation: "Character created",
  chat_media_generation: "Media generated",
};

export function describeTokenLedgerReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

/**
 * Server Component data fetch (FRONTEND_DIRECTIVE §10 — direct lib call,
 * not a self-fetch over our own /api route). Reads through the request's
 * session-scoped client, not supabaseAdmin, so token_ledger's own RLS
 * policy (token_ledger_own_read: user_id = auth.uid()) is what actually
 * scopes this to the caller's own rows — the same trust boundary the
 * migration's comment says it mirrors from xp_events, not re-derived here
 * with an explicit .eq('user_id', ...) that could drift from the policy.
 *
 * Fails soft (empty array) on any read error — this is transaction
 * history, not the balance itself (getShellSession's profile.tokens
 * remains the source of truth for that), so a failed fetch here shouldn't
 * break the page it's shown on.
 */
export async function getTokenLedger(limit = 25): Promise<TokenLedgerEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("token_ledger")
    .select("id, amount, balance_after, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    amount: row.amount,
    balanceAfter: row.balance_after,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}
