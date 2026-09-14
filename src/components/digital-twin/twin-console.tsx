"use client";

import { useState } from "react";
import { Download, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "./chat-panel";
import { TrainingPanel } from "./training-panel";
import { HistoryPanel } from "./history-panel";
import type { DigitalTwinProfile, TrainingDepth } from "@/lib/digital-twin/engine";

export function TwinConsole({
  initialProfile,
  trainingCosts,
  trainingEtas,
  tokens,
}: {
  initialProfile: DigitalTwinProfile | null;
  trainingCosts: Record<TrainingDepth, number>;
  trainingEtas: Record<TrainingDepth, number>;
  tokens: number;
}) {
  const [profile, setProfile] = useState(initialProfile);
  // Bumped on a successful scoped wipe so TrainingPanel/HistoryPanel/
  // ChatPanel remount with fresh internal state instead of hanging onto
  // stale notes/phrases/messages from before the delete — see
  // handleDeleteTwin below.
  const [resetKey, setResetKey] = useState(0);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingTwin, setDeletingTwin] = useState(false);
  const [deleteTwinError, setDeleteTwinError] = useState<string | null>(null);

  async function handleDeleteTwin() {
    if (deletingTwin) return;
    setDeletingTwin(true);
    setDeleteTwinError(null);
    try {
      const res = await fetch("/api/digital-twin", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Delete failed");
      setProfile(null);
      setResetKey((k) => k + 1);
      setConfirmingDelete(false);
    } catch {
      setDeleteTwinError("Couldn't delete your twin data. Please try again.");
    } finally {
      setDeletingTwin(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {profile?.autoTraits && (
            <Badge variant={profile.enabled ? "solid" : "outline"}>
              {profile.enabled ? "Active" : "Disabled"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {profile?.autoTraits && (
            <Button variant="ghost" size="sm" asChild>
              <a href="/api/digital-twin/export" download>
                <Download className="h-4 w-4" /> Export
              </a>
            </Button>
          )}
          {profile && !confirmingDelete && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete twin
            </Button>
          )}
        </div>
      </div>

      {confirmingDelete && (
        <div className="mb-5 rounded-sm border border-danger/30 bg-danger/5 p-3 space-y-3">
          <p className="flex items-start gap-2 text-xs text-danger">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Deletes your trained persona, manual notes, and everything your twin has generated.
            This doesn&rsquo;t touch your chats or the rest of your account, and can&rsquo;t be undone.
          </p>
          {deleteTwinError && <p className="text-xs text-danger">{deleteTwinError}</p>}
          <div className="flex gap-2">
            <Button onClick={handleDeleteTwin} disabled={deletingTwin} variant="destructive" size="sm">
              {deletingTwin ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete twin data
            </Button>
            <Button
              onClick={() => {
                setConfirmingDelete(false);
                setDeleteTwinError(null);
              }}
              disabled={deletingTwin}
              variant="ghost"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="chat" key={resetKey}>
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="pt-6">
          <ChatPanel profile={profile} />
        </TabsContent>

        <TabsContent value="training" className="pt-6">
          <TrainingPanel
            profile={profile}
            trainingCosts={trainingCosts}
            trainingEtas={trainingEtas}
            tokens={tokens}
            onProfileChange={setProfile}
          />
        </TabsContent>

        <TabsContent value="history" className="pt-6">
          <HistoryPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
