import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getXAutoPublishEnabled, getXDailyPostCap, countXPostsToday } from "@/lib/config/x-social";
import { isXClientConfigured } from "@/lib/social/x-client";

// Duplicated from the /api/admin/social route rather than imported from
// it — same call this codebase already made for
// CONTENT_QUEUE_STATUSES/admin-content-queue.ts vs. its route: nothing
// under src/lib imports from an app/api route module anywhere in this
// codebase, so a lib file stays the single source of truth for its own
// domain shape instead of reaching into a route handler for it.
export const SOCIAL_POST_STATUSES = [
  "queued",
  "pending_review",
  "posting",
  "posted",
  "failed",
  "skipped",
] as const;
export type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number];

export interface SocialPost {
  id: string;
  character_id: string;
  character_name: string;
  character_image_url: string | null;
  source_post_id: string | null;
  status: SocialPostStatus;
  tweet_text: string | null;
  media_url: string | null;
  x_tweet_id: string | null;
  triggered_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  error: string | null;
  posted_at: string | null;
  created_at: string;
}

const SOCIAL_SELECT =
  "id,character_id,source_post_id,status,tweet_text,media_url,x_tweet_id,triggered_by,reviewed_by,reviewed_at,error,posted_at,created_at,characters:character_id(name,image_url)";

function mapRow(row: any): SocialPost {
  const character = Array.isArray(row.characters) ? row.characters[0] : row.characters;
  return {
    id: row.id,
    character_id: row.character_id,
    character_name: character?.name ?? "Unknown character",
    character_image_url: character?.image_url ?? null,
    source_post_id: row.source_post_id,
    status: row.status,
    tweet_text: row.tweet_text,
    media_url: row.media_url,
    x_tweet_id: row.x_tweet_id,
    triggered_by: row.triggered_by,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    error: row.error,
    posted_at: row.posted_at,
    created_at: row.created_at,
  };
}

/**
 * SSR page-load snapshot: the 'queued' review queue (the tab an admin
 * lands on) plus per-status counts for the stat-card row, plus the
 * auto-publish/daily-cap settings for the panel above the queue.
 * 'queued' rather than 'pending_review' as the default view — auto-
 * select.ts only ever inserts rows as 'queued'; 'pending_review' is a
 * valid status in the schema/CHECK constraint (and handled defensively
 * by the publish/reject route) but nothing in this codebase's pipeline
 * writes it yet. Mirrors getContentQueueSnapshot()'s split for
 * /admin/content-engine: SSR the default view, client-fetch the rest.
 */
export async function getSocialQueueSnapshot(): Promise<{
  items: SocialPost[];
  counts: Record<SocialPostStatus, number>;
  settings: SocialSettings;
}> {
  const [{ data: rows }, counts, settings] = await Promise.all([
    supabaseAdmin
      .from("social_posts")
      .select(SOCIAL_SELECT)
      .eq("status", "queued")
      .order("created_at", { ascending: false })
      .limit(50),
    loadStatusCounts(),
    getSocialSettings(),
  ]);

  return { items: (rows ?? []).map(mapRow), counts, settings };
}

/**
 * One head-count query per status, same reasoning as
 * admin-content-queue.ts's loadStatusCounts — no group-by escape hatch
 * in the supabase-js query builder short of a raw RPC, and this is an
 * admin-only page loaded infrequently against an indexed (status)
 * column. Runs in parallel.
 */
async function loadStatusCounts(): Promise<Record<SocialPostStatus, number>> {
  const entries = await Promise.all(
    SOCIAL_POST_STATUSES.map(async (status) => {
      const { count } = await supabaseAdmin
        .from("social_posts")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<SocialPostStatus, number>;
}

export interface SocialSettings {
  autoPublishEnabled: boolean;
  dailyPostCap: number;
  postedToday: number;
  xConfigured: boolean;
}

/**
 * Shared by the SSR snapshot above and GET/PATCH /api/admin/social/settings
 * so all three stay in lockstep. countXPostsToday() fails closed to
 * +Infinity on a query error (see its own comment) — that's the right
 * behavior for the publisher's cap check, but Infinity doesn't survive
 * JSON.stringify (serializes to null), so it's clamped to the cap here
 * for anything that renders or returns this over the wire: the UI still
 * correctly reads as "cap reached" either way.
 */
export async function getSocialSettings(): Promise<SocialSettings> {
  const [autoPublishEnabled, dailyPostCap, rawPostedToday] = await Promise.all([
    getXAutoPublishEnabled(),
    getXDailyPostCap(),
    countXPostsToday(),
  ]);
  const postedToday = Number.isFinite(rawPostedToday) ? rawPostedToday : dailyPostCap;
  return { autoPublishEnabled, dailyPostCap, postedToday, xConfigured: isXClientConfigured() };
}
