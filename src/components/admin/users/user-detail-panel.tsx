"use client";

import { useEffect, useState } from "react";
import { Loader2, Coins, ShieldOff, ShieldCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchUserDetail,
  setUserDisabled,
  setUserRole,
  adjustUserTokens,
  type AdminUserDetail,
  type TokenLedgerEntry,
  type AdminUserSummary,
} from "@/lib/frontend/admin-users";

export function UserDetailPanel({
  userId,
  onClose,
  onUpdated,
}: {
  userId: string;
  onClose: () => void;
  onUpdated: (summary: AdminUserSummary) => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [ledger, setLedger] = useState<TokenLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tokenAmount, setTokenAmount] = useState("");
  const [tokenNote, setTokenNote] = useState("");

  function load() {
    setLoading(true);
    setError(null);
    fetchUserDetail(userId)
      .then((data) => {
        setDetail(data.user);
        setLedger(data.tokenLedger);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load user"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [userId]);

  async function toggleDisabled() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const summary = await setUserDisabled(detail.id, !detail.is_disabled);
      setDetail({ ...detail, ...summary });
      onUpdated(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(role: "user" | "moderator" | "admin") {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const summary = await setUserRole(detail.id, role);
      setDetail({ ...detail, ...summary });
      onUpdated(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitTokenAdjustment() {
    const amount = Number(tokenAmount);
    if (!detail || !amount || Number.isNaN(amount)) return;
    setBusy(true);
    setError(null);
    try {
      const { balance } = await adjustUserTokens(detail.id, amount, tokenNote || undefined);
      setDetail({ ...detail, tokens: balance });
      onUpdated({ ...detail, tokens: balance });
      setTokenAmount("");
      setTokenNote("");
      load(); // refresh ledger with the new entry
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjustment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card interactive={false} className="p-4 space-y-4 sticky top-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg">User detail</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {loading && <p className="text-sm text-text-secondary flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      {detail && !loading && (
        <>
          <div>
            <p className="font-medium text-text-primary">{detail.display_name || detail.username || detail.id.slice(0, 8)}</p>
            <p className="text-xs text-text-tertiary font-mono">{detail.id}</p>
            {detail.email && <p className="text-xs text-text-tertiary">{detail.email}</p>}
            <div className="flex gap-1.5 flex-wrap mt-2">
              <Badge variant="outline">{detail.tier}</Badge>
              <Badge variant="outline">{detail.role}</Badge>
              {detail.is_disabled && (
                <Badge variant="outline" className="border-danger/50 text-danger">disabled</Badge>
              )}
              {detail.suspended && (
                <Badge variant="outline" className="border-danger/50 text-danger">suspended (abuse flag)</Badge>
              )}
              {detail.age_verification_status === 'verified' && (
                <Badge variant="outline">age verified</Badge>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-text-tertiary">Tokens</dt>
            <dd className="text-text-primary text-right font-medium">{detail.tokens.toLocaleString()}</dd>
            <dt className="text-text-tertiary">Swipe points</dt>
            <dd className="text-text-primary text-right">{detail.swipe_points.toLocaleString()}</dd>
            <dt className="text-text-tertiary">Messages today</dt>
            <dd className="text-text-primary text-right">{detail.daily_messages_used}/{detail.daily_messages_limit}</dd>
            <dt className="text-text-tertiary">Subscription ends</dt>
            <dd className="text-text-primary text-right">{detail.subscription_end ? new Date(detail.subscription_end).toLocaleDateString() : "—"}</dd>
            <dt className="text-text-tertiary">Region</dt>
            <dd className="text-text-primary text-right">{detail.region ?? detail.country ?? "—"}</dd>
            <dt className="text-text-tertiary">Last active</dt>
            <dd className="text-text-primary text-right">{detail.last_active_at ? new Date(detail.last_active_at).toLocaleDateString() : "—"}</dd>
          </dl>

          <div className="border-t border-border-hairline pt-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-text-tertiary font-medium">Account</p>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant={detail.is_disabled ? "primary" : "destructive"} disabled={busy} onClick={toggleDisabled}>
                {detail.is_disabled ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
                {detail.is_disabled ? "Re-enable account" : "Disable account"}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-tertiary">Role</label>
              <select
                className="h-8 px-2 rounded-sm bg-base border border-border-hairline text-sm text-text-primary"
                value={detail.role}
                disabled={busy}
                onChange={(e) => changeRole(e.target.value as "user" | "moderator" | "admin")}
              >
                <option value="user">user</option>
                <option value="moderator">moderator</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>

          <div className="border-t border-border-hairline pt-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-text-tertiary font-medium">Adjust tokens</p>
            <div className="flex gap-2">
              <input
                type="number"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                placeholder="±amount"
                className="w-24 h-8 px-2 rounded-sm bg-base border border-border-hairline text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-gold-500/60"
              />
              <input
                value={tokenNote}
                onChange={(e) => setTokenNote(e.target.value)}
                placeholder="Reason (for the ledger)"
                className="flex-1 h-8 px-2 rounded-sm bg-base border border-border-hairline text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-gold-500/60"
              />
              <Button size="sm" variant="primary" disabled={busy || !tokenAmount} onClick={submitTokenAdjustment}>
                <Coins className="h-3.5 w-3.5" /> Apply
              </Button>
            </div>

            {ledger.length > 0 && (
              <ul className="text-xs divide-y divide-border-hairline max-h-48 overflow-y-auto">
                {ledger.map((entry) => (
                  <li key={entry.id} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="text-text-secondary truncate">{entry.reason.replace(/_/g, " ")}</span>
                    <span className={entry.amount >= 0 ? "text-emerald-400" : "text-danger"}>
                      {entry.amount >= 0 ? "+" : ""}{entry.amount}
                    </span>
                    <span className="text-text-tertiary whitespace-nowrap">{new Date(entry.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
