"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, RefreshCw, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { resolveImageSrc } from "@/lib/utils";

export interface AdminCharacterListItem {
  id: string;
  name: string;
  image_url: string | null;
  avatar_url: string | null;
  is_public: boolean;
  is_nsfw: boolean;
  moderation_status: string | null;
  created_at: string | null;
  profiles: { username: string | null } | null;
}

/**
 * Master list for the Media tab — same search-table shape as
 * user-search-table.tsx (debounced query box driving a selected-id passed
 * up to the parent), swapped from GET /api/admin/users to the new GET
 * /api/admin/characters (see that route's own doc comment for why it
 * didn't already exist: only a pending-moderation query and a single-id
 * read existed before this).
 */
export function CharacterSearchList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<AdminCharacterListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/characters?${params}`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Search failed");
      const data = await res.json();
      setItems(data.characters);
      setHasMore(data.hasMore);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + whenever the page changes.
  useEffect(() => {
    load(query, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    load(query, 0);
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submitSearch} className="flex items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Character name…"
            className="w-full h-9 pl-8 pr-3 rounded-sm bg-base border border-border-hairline text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-gold-500/60"
          />
        </div>
        <Button type="submit" size="sm" variant="secondary" disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </form>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!loading && items.length === 0 && !error && (
        <p className="text-text-tertiary text-sm py-12 text-center border border-border-hairline rounded-md">
          No characters match this search.
        </p>
      )}

      {items.length > 0 && (
        <Card interactive={false} className="overflow-hidden">
          <ul className="divide-y divide-border-hairline max-h-[60vh] overflow-y-auto">
            {items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.03] ${
                    selectedId === c.id ? "bg-gold-500/[0.06]" : ""
                  }`}
                >
                  <div className="relative h-10 w-10 shrink-0 rounded-sm overflow-hidden bg-black/40">
                    <Image
                      src={resolveImageSrc(c.avatar_url || c.image_url)}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-text-primary text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-text-tertiary truncate">
                      {c.profiles?.username ? `@${c.profiles.username}` : "seeded"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {!c.is_public && <Badge variant="outline">private</Badge>}
                    {c.moderation_status && c.moderation_status !== "approved" && (
                      <Badge variant="outline" className="border-danger/50 text-danger">
                        {c.moderation_status}
                      </Badge>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(page > 0 || hasMore) && items.length > 0 && (
        <div className="flex items-center justify-between text-xs text-text-tertiary">
          <span>{total.toLocaleString()} total</span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={page === 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!hasMore || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
