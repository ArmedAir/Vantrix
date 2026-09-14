"use client";

import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { timeAgo } from "@/lib/utils";

/** Non-blocking notice, same posture as AppearanceStage's `notice` bar —
 *  informs without gating interaction with the stage underneath it. */
export function DraftResumeBanner({
  savedAt,
  onResume,
  onDiscard,
}: {
  savedAt: string;
  onResume: () => void;
  onDiscard: () => void;
}) {
  return (
    <Card
      interactive={false}
      className="mb-6 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-gold-500/30 bg-gold-500/5"
    >
      <div className="flex items-center gap-3 min-w-0">
        <History className="h-4 w-4 text-gold-400 shrink-0" />
        <p className="text-sm text-text-secondary min-w-0">
          You have an unfinished character saved from {timeAgo(savedAt)}.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
          <RotateCcw className="h-3.5 w-3.5" />
          Start fresh
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={onResume}>
          Resume draft
        </Button>
      </div>
    </Card>
  );
}
