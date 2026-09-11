"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, Layers, Gem, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TieredMemoryPayload {
  shortTerm: { role: "user" | "character"; text: string; ts: number }[];
  mediumTerm: {
    id: string;
    summary: string;
    topics: string[];
    importance: number;
    reinforcedCount: number;
    updatedAt: number;
  }[];
  longTerm: {
    id: string;
    headline: string;
    importance: number;
    reinforcementCount: number;
    lastReinforcedAt: string;
  }[];
}

/**
 * Surfaces the memory-tiers subsystem (src/lib/memory-tiers/) — the same
 * short/medium/long-term data getTieredMemoryContext() feeds into the chat
 * prompt — backed by GET /api/memories/tiered. See that route's header
 * comment and this file's sibling MemoriesPanel for the gap this closes:
 * a reset action existed for these tiers with no way to see what it would
 * clear.
 *
 * Lazy by design: fetches only when opened. This is supplementary to the
 * priority-memory list MemoriesPanel already shows by default, and most
 * users won't need to open it.
 */
export function TieredMemorySection({
  characterId,
  characterName,
}: {
  characterId: string;
  characterName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TieredMemoryPayload | null>(null);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/memories/tiered?characterId=${characterId}`);
        if (!res.ok) throw new Error("failed");
        setData(await res.json());
      } catch {
        setError("Couldn't load this right now.");
      } finally {
        setLoading(false);
      }
    }
  }

  const hasAnyContent =
    !!data && (data.shortTerm.length > 0 || data.mediumTerm.length > 0 || data.longTerm.length > 0);

  return (
    <div className="mb-5 rounded-md border border-border-hairline">
      <button
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="text-xs font-semibold text-text-secondary">
          What&rsquo;s shaping {characterName}&rsquo;s memory of you
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
        )}
      </button>

      {open && (
        <div className="border-t border-border-hairline px-3 py-3">
          {loading && (
            <div className="flex items-center justify-center py-6 text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}

          {!loading && error && (
            <p className="py-2 text-center text-xs text-text-tertiary">{error}</p>
          )}

          {!loading && !error && data && !hasAnyContent && (
            <p className="py-2 text-center text-xs text-text-tertiary">
              Nothing built up yet — keep talking.
            </p>
          )}

          {!loading && !error && data && hasAnyContent && (
            <div className="flex flex-col gap-4">
              {data.longTerm.length > 0 && (
                <TierGroup
                  icon={Gem}
                  label="Always remembered"
                  items={data.longTerm.map((m) => ({
                    key: m.id,
                    text: m.headline,
                    meta: m.reinforcementCount > 1 ? `×${m.reinforcementCount}` : undefined,
                  }))}
                />
              )}
              {data.mediumTerm.length > 0 && (
                <TierGroup
                  icon={Layers}
                  label="Building up"
                  items={data.mediumTerm.map((e) => ({
                    key: e.id,
                    text: e.summary,
                    meta: e.topics[0],
                  }))}
                />
              )}
              {data.shortTerm.length > 0 && (
                <TierGroup
                  icon={Clock}
                  label="This conversation"
                  items={[
                    {
                      key: "stm",
                      text: `${data.shortTerm.length} message${data.shortTerm.length === 1 ? "" : "s"} so far — folds into the tiers above once there's enough to summarize.`,
                    },
                  ]}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TierGroup({
  icon: Icon,
  label,
  items,
}: {
  icon: typeof Clock;
  label: string;
  items: { key: string; text: string; meta?: string }[];
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-gold-400" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">
          {label}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <div key={item.key} className="flex items-start justify-between gap-2 text-xs text-text-secondary">
            <span className="min-w-0 flex-1">{item.text}</span>
            {item.meta && (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {item.meta}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
