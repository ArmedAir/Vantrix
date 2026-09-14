"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { searchUsers, type AdminUserSummary } from "@/lib/frontend/admin-users";

const TIERS = ["free", "spark", "basic", "premium", "elite", "enterprise"];

export function UserSearchTable({
  onSelect,
  selectedId,
  refreshToken,
}: {
  onSelect: (id: string) => void;
  selectedId: string | null;
  refreshToken: number;
}) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("");
  const [disabledOnly, setDisabledOnly] = useState(false);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    searchUsers({ q: query || undefined, tier: tier || undefined, disabledOnly, page })
      .then((data) => {
        setUsers(data.users);
        setHasMore(data.hasMore);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }

  // Reset to page 1 whenever a filter changes; page itself triggers its own load.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, disabledOnly]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [page, tier, disabledOnly, refreshToken]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submitSearch} className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Username, email, or user id…"
            className="w-full h-9 pl-8 pr-3 rounded-sm bg-base border border-border-hairline text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-gold-500/60"
          />
        </div>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="h-9 px-2 rounded-sm bg-base border border-border-hairline text-sm text-text-primary"
        >
          <option value="">All tiers</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-text-secondary">
          <input type="checkbox" checked={disabledOnly} onChange={(e) => setDisabledOnly(e.target.checked)} />
          Disabled only
        </label>
        <Button type="submit" size="sm" variant="secondary" disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Search
        </Button>
      </form>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!loading && users.length === 0 && !error && (
        <p className="text-text-tertiary text-sm py-12 text-center border border-border-hairline rounded-md">
          No users match this search.
        </p>
      )}

      {users.length > 0 && (
        <Card interactive={false} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-tertiary text-xs uppercase tracking-wide border-b border-border-hairline">
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Tier</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Tokens</th>
                <th className="px-3 py-2 font-medium">Joined</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => onSelect(u.id)}
                  className={`border-b border-border-hairline last:border-0 cursor-pointer transition-colors hover:bg-white/[0.03] ${
                    selectedId === u.id ? "bg-gold-500/[0.06]" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <p className="text-text-primary font-medium">{u.display_name || u.username || u.id.slice(0, 8)}</p>
                    <p className="text-xs text-text-tertiary font-mono">{u.id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{u.tier}</td>
                  <td className="px-3 py-2 text-text-secondary">{u.role}</td>
                  <td className="px-3 py-2 text-text-secondary">{u.tokens.toLocaleString()}</td>
                  <td className="px-3 py-2 text-text-tertiary whitespace-nowrap">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    {u.is_disabled ? (
                      <Badge variant="outline" className="border-danger/50 text-danger">disabled</Badge>
                    ) : (
                      <Badge variant="outline">active</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <span className="text-xs text-text-tertiary">Page {page}</span>
        <Button size="sm" variant="ghost" disabled={!hasMore || loading} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
