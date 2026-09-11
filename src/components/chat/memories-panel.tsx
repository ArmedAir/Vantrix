"use client";

import { useEffect, useState } from "react";
import {
  Loader2, Brain, Heart, Sparkles, X, Eraser,
  Pin, PinOff, Pencil, Trash2, Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { momentLabel } from "@/lib/ai/moment-labels";
import type { PriorityMemory } from "@/lib/ai/priority-memory";
import { TieredMemorySection } from "./tiered-memory-section";

const SOURCE_ICON: Record<PriorityMemory["source"], typeof Brain> = {
  memory_graph: Brain,
  user_facts: Heart,
  manual: Sparkles,
};

/** Title-cases a user_facts category ('pain_point' -> 'Pain point') for
 *  display — mirrors momentLabel's readable-fallback shape for
 *  memory_graph categories without pretending fact categories are moments. */
function factCategoryLabel(category: string): string {
  const spaced = category.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function headlineFor(memory: PriorityMemory): string {
  if (memory.source === "memory_graph") return momentLabel(memory.category);
  if (memory.source === "user_facts") return factCategoryLabel(memory.category);
  return memory.headline;
}

/**
 * Backs GET /api/memories/priority — see that route's own doc comment
 * ("User-facing endpoint backing a 'memories' UI page") and
 * priority-memory.ts's header comment (item 1: "Shown directly to the
 * user"). Nothing in this codebase rendered it before this component.
 *
 * `initialMemories` is the server-rendered first paint (page.tsx calls
 * getPriorityMemories directly per this project's §10 convention); this
 * component only re-fetches client-side when the keyword filter changes.
 */
export function MemoriesPanel({
  characterId,
  characterName,
  initialMemories,
}: {
  characterId: string;
  characterName: string;
  initialMemories: PriorityMemory[];
}) {
  const [memories, setMemories] = useState<PriorityMemory[]>(initialMemories);
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // MEMORY-TIERS: this panel only ever displayed priority_memories (see
  // this component's header comment) — the separate short/medium/long-term
  // system in lib/memory-tiers/ had a reset path (clearShortTerm/
  // clearMediumTerm/clearLongTerm) but no UI ever called it. This wires
  // that in as an explicit, confirmed, opt-in action rather than doing it
  // silently — resetting is irreversible and this panel has no visibility
  // into that tier's contents to show the user what they'd be clearing.
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  async function handleForgetConversation() {
    if (resetting) return;
    const confirmed = window.confirm(
      `Forget everything ${characterName} has picked up from this conversation so far? This can't be undone.`
    );
    if (!confirmed) return;

    setResetting(true);
    try {
      const res = await fetch(`/api/characters/${characterId}/memory-reset`, { method: "DELETE" });
      if (!res.ok) throw new Error("reset failed");
      setResetDone(true);
    } catch {
      setError("Couldn't reset memory. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  useEffect(() => {
    // First paint already came from the server via initialMemories — only
    // hit the API route once a filter is actually applied/cleared.
    if (activeKeyword === null) {
      setMemories(initialMemories);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ characterId, keyword: activeKeyword });
    fetch(`/api/memories/priority?${params.toString()}`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setMemories(body.memories ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load memories.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKeyword, characterId]);

  const allKeywords = Array.from(
    new Set(initialMemories.flatMap((m) => m.keywords))
  ).slice(0, 12);

  // Mirrors getPriorityMemories' own ORDER BY (is_pinned desc, importance
  // desc, created_at desc) so a pin toggle or edit doesn't leave the list
  // out of sync with what a fresh fetch/reload would show.
  function resort(list: PriorityMemory[]): PriorityMemory[] {
    return [...list].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (a.importance !== b.importance) return b.importance - a.importance;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  function handleMemoryUpdated(updated: PriorityMemory) {
    setMemories((prev) => resort(prev.map((m) => (m.id === updated.id ? updated : m))));
  }

  function handleMemoryDeleted(id: string) {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-8 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-xs text-text-tertiary">
          Includes what {characterName} remembers from your ongoing chats, not just the moments shown below.
        </p>
        <button
          onClick={handleForgetConversation}
          disabled={resetting || resetDone}
          className="flex shrink-0 items-center gap-1.5 rounded-xs border border-border-hairline px-2.5 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:border-red-500/40 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resetting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Eraser className="h-3 w-3" />
          )}
          {resetDone ? "Forgotten" : "Forget this conversation"}
        </button>
      </div>

      <TieredMemorySection characterId={characterId} characterName={characterName} />

      {allKeywords.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {activeKeyword && (
            <button
              onClick={() => setActiveKeyword(null)}
              className="flex items-center gap-1 rounded-xs border border-gold-500/50 bg-gold-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold-400"
            >
              {activeKeyword} <X className="h-3 w-3" />
            </button>
          )}
          {allKeywords
            .filter((k) => k !== activeKeyword)
            .map((k) => (
              <button key={k} onClick={() => setActiveKeyword(k)}>
                <Badge variant="outline" className="cursor-pointer hover:border-gold-400 hover:text-gold-300">
                  {k}
                </Badge>
              </button>
            ))}
        </div>
      )}

      {error && <p className="py-8 text-center text-sm text-text-tertiary">{error}</p>}

      {loading && (
        <div className="flex items-center justify-center py-16 text-text-secondary">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {!loading && !error && memories.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-border-hairline py-16 text-center">
          <Brain className="h-8 w-8 text-text-tertiary" />
          <p className="max-w-xs text-sm text-text-secondary">
            {activeKeyword
              ? `Nothing tagged "${activeKeyword}" yet.`
              : `You haven't built up any memories with ${characterName} yet — keep talking and she'll start remembering what matters.`}
          </p>
        </div>
      )}

      {!loading && !error && memories.length > 0 && (
        <div className="flex flex-col gap-3">
          {memories.map((m) => (
            <MemoryCard
              key={m.id}
              memory={m}
              onKeywordClick={setActiveKeyword}
              onUpdated={handleMemoryUpdated}
              onDeleted={handleMemoryDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One priority_memories row, with edit/pin/delete controls wired to
 * PATCH/DELETE /api/memories/priority/[id] — see that route's doc comment.
 *
 * Only `content` is editable here: the bold line above it (headlineFor)
 * is a derived category label for memory_graph/user_facts rows, not the
 * stored `headline` field, so exposing a separate headline editor for
 * those sources wouldn't change anything the user actually sees.
 */
function MemoryCard({
  memory,
  onKeywordClick,
  onUpdated,
  onDeleted,
}: {
  memory: PriorityMemory;
  onKeywordClick: (keyword: string) => void;
  onUpdated: (updated: PriorityMemory) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);
  const [saving, setSaving] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  const Icon = SOURCE_ICON[memory.source] ?? Sparkles;

  async function patchMemory(body: Record<string, unknown>): Promise<PriorityMemory | null> {
    try {
      const res = await fetch(`/api/memories/priority/${memory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Update failed");
      return json.memory as PriorityMemory;
    } catch {
      setCardError("Couldn't save changes. Please try again.");
      return null;
    }
  }

  async function handleTogglePin() {
    if (pinning) return;
    setPinning(true);
    setCardError(null);
    const updated = await patchMemory({ isPinned: !memory.is_pinned });
    if (updated) onUpdated(updated);
    setPinning(false);
  }

  async function handleSaveEdit() {
    const content = draft.trim();
    if (!content || content === memory.content) {
      setEditing(false);
      setDraft(memory.content);
      return;
    }
    setSaving(true);
    setCardError(null);
    const updated = await patchMemory({ content });
    setSaving(false);
    if (updated) {
      onUpdated(updated);
      setEditing(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    const confirmed = window.confirm("Delete this memory? This can't be undone.");
    if (!confirmed) return;

    setDeleting(true);
    setCardError(null);
    try {
      const res = await fetch(`/api/memories/priority/${memory.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      onDeleted(memory.id);
    } catch {
      setCardError("Couldn't delete this memory. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <Card className={cn("p-4", memory.is_pinned && "border-gold-500/40")}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            memory.source === "memory_graph" ? "bg-gold-500/10" : "bg-white/5"
          )}
        >
          <Icon className="h-4 w-4 text-gold-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-text-primary">
              {headlineFor(memory)}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={handleTogglePin}
                disabled={pinning}
                aria-label={memory.is_pinned ? "Unpin memory" : "Pin memory"}
                className="rounded-xs p-1 text-text-tertiary transition-colors hover:text-gold-400 disabled:opacity-50"
              >
                {memory.is_pinned ? <Pin className="h-3.5 w-3.5 fill-gold-400 text-gold-400" /> : <PinOff className="h-3.5 w-3.5" />}
              </button>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  aria-label="Edit memory"
                  className="rounded-xs p-1 text-text-tertiary transition-colors hover:text-text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={deleting}
                aria-label="Delete memory"
                className="rounded-xs p-1 text-text-tertiary transition-colors hover:text-red-400 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {editing ? (
            <div className="mt-1.5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                maxLength={2000}
                autoFocus
                className="w-full resize-none rounded-xs border border-border-hairline bg-transparent p-2 text-sm text-text-primary focus:border-gold-400 focus:outline-none"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={saving || !draft.trim()}
                  className="flex items-center gap-1 rounded-xs bg-gold-500/10 px-2.5 py-1 text-[11px] font-semibold text-gold-400 transition-colors hover:bg-gold-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setDraft(memory.content);
                    setCardError(null);
                  }}
                  disabled={saving}
                  className="rounded-xs px-2.5 py-1 text-[11px] font-semibold text-text-tertiary transition-colors hover:text-text-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-text-secondary">{memory.content}</p>
          )}

          {cardError && <p className="mt-1.5 text-[11px] text-red-400">{cardError}</p>}

          {memory.keywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {memory.keywords.map((k) => (
                <button key={k} onClick={() => onKeywordClick(k)}>
                  <Badge variant="outline" className="cursor-pointer hover:border-gold-400 hover:text-gold-300">
                    {k}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
