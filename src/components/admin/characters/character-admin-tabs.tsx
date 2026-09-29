"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CharacterModerationQueue } from "@/components/admin/character-moderation-queue";
import { CharacterSearchList } from "@/components/admin/characters/character-search-list";
import { CharacterMediaPanel } from "@/components/admin/characters/character-media-panel";
import type { PendingCharacter } from "@/lib/frontend/admin-characters";

/**
 * Splits /admin/characters into Moderation (pre-existing queue, unchanged)
 * and Media — the "change portrait" control that didn't exist despite its
 * API being fully built (see GET /api/admin/characters and the media
 * route's own doc comment). First real consumer of the Tabs primitive
 * (components/admin/tabs.tsx) — it existed, documented for exactly this
 * kind of page split, but nothing had actually used it yet.
 */
export function CharacterAdminTabs({ initialPending }: { initialPending: PendingCharacter[] }) {
  const [tab, setTab] = useState("moderation");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="mb-6">
        <TabsTrigger value="moderation">
          Moderation{initialPending.length > 0 ? ` (${initialPending.length})` : ""}
        </TabsTrigger>
        <TabsTrigger value="media">Media</TabsTrigger>
      </TabsList>

      {tab === "moderation" && <CharacterModerationQueue initial={initialPending} />}

      {tab === "media" && (
        <div className="grid md:grid-cols-[280px_1fr] gap-6">
          <CharacterSearchList selectedId={selectedId} onSelect={setSelectedId} />
          {selectedId ? (
            <CharacterMediaPanel key={selectedId} characterId={selectedId} />
          ) : (
            <p className="text-text-tertiary text-sm py-12 text-center border border-border-hairline rounded-md">
              Select a character to change its images.
            </p>
          )}
        </div>
      )}
    </Tabs>
  );
}
