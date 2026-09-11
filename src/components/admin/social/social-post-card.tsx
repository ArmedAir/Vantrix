"use client";

import { useState } from "react";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { formatDistanceToNowStrict } from "date-fns";
import { Check, X, Loader2, Clock, ExternalLink, ImageOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RevealItem } from "@/components/admin/motion/reveal";
import { cn } from "@/lib/utils";
import { reviewSocialPost, type SocialPost } from "@/lib/frontend/admin-social-client";

const STATUS_STYLE: Record<string, string> = {
  queued: "text-text-tertiary",
  pending_review: "text-gold-400",
  posting: "text-gold-400",
  posted: "text-success",
  skipped: "text-text-tertiary",
  failed: "text-danger",
};

const TWEET_MAX = 280;

export function SocialPostCard({
  item,
  onUpdated,
}: {
  item: SocialPost;
  onUpdated: (item: SocialPost) => void;
}) {
  const [busy, setBusy] = useState<"publish" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);

  const canDecide = item.status === "queued" || item.status === "pending_review";
  const tweetLength = item.tweet_text?.length ?? 0;
  const overLimit = tweetLength > TWEET_MAX;

  async function act(action: "publish" | "reject") {
    setBusy(action);
    setError(null);
    try {
      const updated = await reviewSocialPost(item.id, action === "publish" ? { action } : { action, notes: rejectNote || undefined });
      onUpdated({ ...item, status: updated.status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <RevealItem>
      <Card interactive={false} className="p-4 flex flex-col sm:flex-row gap-4">
        <Preview item={item} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-medium text-text-primary truncate">{item.character_name}</p>
            <span className={cn("text-xs font-semibold capitalize", STATUS_STYLE[item.status])}>
              {item.status.replace("_", " ")}
            </span>
            {item.triggered_by === "cron" && <Badge variant="outline">cron</Badge>}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-text-tertiary mb-2">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNowStrict(new Date(item.created_at), { addSuffix: true })}
            </span>
          </div>

          {item.tweet_text ? (
            <div className="mb-2 rounded-sm border border-border-hairline bg-white/[0.02] p-3">
              <p className="text-sm text-text-primary whitespace-pre-line">{item.tweet_text}</p>
              <p className={cn("text-[11px] mt-1.5 text-right tabular-nums", overLimit ? "text-danger" : "text-text-tertiary")}>
                {tweetLength}/{TWEET_MAX}
              </p>
            </div>
          ) : (
            <p className="text-xs text-text-tertiary mb-2">No tweet text composed.</p>
          )}

          {item.status === "posted" && (
            <p className="text-xs text-text-secondary mb-2 flex items-center gap-2 flex-wrap">
              {item.posted_at && <span>Posted {formatDistanceToNowStrict(new Date(item.posted_at), { addSuffix: true })}</span>}
              {item.x_tweet_id && (
                <a
                  href={`https://x.com/i/web/status/${item.x_tweet_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-gold-400 hover:text-gold-300"
                >
                  View on X <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </p>
          )}

          {item.status === "posting" && (
            <p className="text-xs text-text-tertiary flex items-center gap-1.5 mb-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Posting — this list refreshes when you reload.
            </p>
          )}

          {item.status === "failed" && item.error && <p className="text-sm text-danger mb-2">{item.error}</p>}
          {item.status === "skipped" && (
            <p className="text-xs text-text-tertiary mb-2">
              {item.error ? `Rejection note: ${item.error}` : "Rejected — no note left."}
            </p>
          )}

          {error && <p className="text-sm text-danger mb-2">{error}</p>}

          {canDecide && (
            <div className="space-y-2">
              {showReject && (
                <input
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Rejection note (optional)"
                  className="w-full h-9 px-3 rounded-sm bg-base border border-border-hairline text-sm text-text-primary placeholder:text-text-tertiary focus:border-gold-500/60 outline-none"
                />
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => act("publish")}>
                  {busy === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Publish now
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy !== null}
                  onClick={() => (showReject ? act("reject") : setShowReject(true))}
                >
                  {busy === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  {showReject ? "Confirm reject" : "Reject"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </RevealItem>
  );
}

function Preview({ item }: { item: SocialPost }) {
  const base =
    "relative w-full sm:w-32 aspect-square rounded-sm overflow-hidden shrink-0 border border-border-hairline bg-white/5 flex items-center justify-center";

  if (item.media_url) {
    return (
      <a href={item.media_url} target="_blank" rel="noreferrer" className={base}>
        <Image src={item.media_url} alt={item.character_name} fill sizes="128px" className="object-cover" />
      </a>
    );
  }

  if (item.character_image_url) {
    return (
      <div className={base}>
        <Image src={item.character_image_url} alt={item.character_name} fill sizes="128px" className="object-cover opacity-60" />
      </div>
    );
  }

  return (
    <div className={base}>
      <ImageOff className="h-5 w-5 text-text-tertiary" />
    </div>
  );
}
