"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevealGroup } from "@/components/admin/motion/reveal";
import { AnimatedCounter } from "@/components/admin/motion/animated-counter";
import { SocialSettingsPanel } from "@/components/admin/social/social-settings-panel";
import { SocialPostCard } from "@/components/admin/social/social-post-card";
import {
  fetchSocialPosts,
  fetchSocialCounts,
  type SocialPost,
  type SocialPostStatus,
  type SocialSettings,
} from "@/lib/frontend/admin-social-client";
import { cn } from "@/lib/utils";

const STATUS_TABS: { value: SocialPostStatus; label: string }[] = [
  { value: "queued", label: "Queued" },
  { value: "pending_review", label: "Pending review" },
  { value: "posting", label: "Posting" },
  { value: "posted", label: "Posted" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Rejected" },
];

export function SocialReviewConsole({
  initialItems,
  initialCounts,
  initialSettings,
}: {
  initialItems: SocialPost[];
  initialCounts: Record<SocialPostStatus, number>;
  initialSettings: SocialSettings;
}) {
  const [status, setStatus] = useState<SocialPostStatus>("queued");
  const [items, setItems] = useState(initialItems);
  const [counts, setCounts] = useState(initialCounts);
  const [settings, setSettings] = useState(initialSettings);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback((s: SocialPostStatus) => {
    setLoading(true);
    fetchSocialPosts({ status: s })
      .then((res) => {
        setItems(res.items);
        setHasMore(res.hasMore);
      })
      .finally(() => setLoading(false));
  }, []);

  // Skip the redundant initial fetch — the server already loaded the
  // default ('queued') view; only refetch when the tab actually changes.
  const isDefaultView = status === "queued";
  useEffect(() => {
    if (isDefaultView) {
      setItems(initialItems);
      setHasMore(false);
      return;
    }
    load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function refreshCounts() {
    fetchSocialCounts().then(setCounts).catch(() => {});
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const oldest = items[items.length - 1];
      const res = await fetchSocialPosts({ status, before: oldest?.created_at });
      setItems((prev) => [...prev, ...res.items]);
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleItemUpdated(updated: SocialPost) {
    setItems((prev) => {
      // Once a row's status no longer matches the tab being viewed (e.g.
      // publish moves it out of "queued"), drop it here — the stat row
      // above is the source of truth for where it went.
      if (updated.status !== status) return prev.filter((i) => i.id !== updated.id);
      return prev.map((i) => (i.id === updated.id ? updated : i));
    });
    refreshCounts();
  }

  return (
    <div className="space-y-6">
      <SocialSettingsPanel settings={settings} onSettingsChanged={setSettings} />

      <RevealGroup className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {STATUS_TABS.map((tab) => (
          <button key={tab.value} type="button" onClick={() => setStatus(tab.value)} className="text-left">
            <Card
              interactive
              className={cn("p-3.5 transition-colors ease-premium", status === tab.value && "border-gold-500/60")}
            >
              <p className={cn("font-display text-2xl tabular-nums", status === tab.value ? "text-gold-400" : "text-text-primary")}>
                <AnimatedCounter value={counts[tab.value] ?? 0} />
              </p>
              <p className="text-[11px] text-text-secondary mt-0.5">{tab.label}</p>
            </Card>
          </button>
        ))}
      </RevealGroup>

      {loading ? (
        <p className="text-text-secondary text-sm py-8 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-text-tertiary text-sm py-12 text-center border border-border-hairline rounded-md">
          Nothing in {STATUS_TABS.find((t) => t.value === status)?.label.toLowerCase()}.
        </p>
      ) : (
        <RevealGroup className="space-y-3">
          {items.map((item) => (
            <SocialPostCard key={item.id} item={item} onUpdated={handleItemUpdated} />
          ))}
        </RevealGroup>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button size="sm" variant="ghost" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
