import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Shared bulk-update helper for the admin review-queue routes
 * (reply-guard-flags, keyword-watch-hits, user-reports). Each of those
 * tables already has the same reviewed_by/reviewed_at/status shape, and
 * each route's PATCH previously only accepted a single `id`. This adds a
 * capped, single round-trip bulk path without duplicating the update logic
 * three times.
 *
 * Deliberately NOT used for content-queue's PATCH — that route's actions
 * (publish/reject/retry) have real per-item side effects (writing to
 * character_content, calling processQueueItem), so silently bulk-executing
 * those isn't safe the way a plain status flip is. content-queue gets its
 * own bulk-reject-only route instead (see bulk/route.ts) — reject has no
 * side effects beyond the status flip, publish/retry stay single-item.
 */
export interface BulkUpdateResult {
  updated: number;
  ids: string[];
}

const MAX_BULK_IDS = 100;

/** The only tables this generic bulk-status helper is used against — each
 *  shares the same reviewed_by/reviewed_at/status shape (see header). */
export type BulkReviewTable = 'reply_guard_flags' | 'keyword_watch_hits' | 'user_reports';

export async function bulkUpdateReviewStatus(
  table: BulkReviewTable,
  ids: string[],
  update: Record<string, unknown>,
): Promise<BulkUpdateResult> {
  const capped = ids.slice(0, MAX_BULK_IDS);
  // Generic across three differently-shaped tables by design (see header),
  // so the precise per-table Update type can't be expressed here — the
  // `table` param is still narrowed to BulkReviewTable above, which is
  // the part that actually matters for safety (no arbitrary table writes).
  const { error } = await (supabaseAdmin
    .from(table) as unknown as {
      update: (u: Record<string, unknown>) => { in: (col: string, vals: string[]) => Promise<{ error: unknown }> };
    })
    .update(update)
    .in('id', capped);

  if (error) throw error;

  return { updated: capped.length, ids: capped };
}
