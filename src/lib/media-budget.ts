// src/lib/media-budget.ts
//
// GAP THIS FILES CLOSES: peak-budget.ts already protects margin on PEAK-tier
// text generation with a dollar ceiling (not just a request count) — see
// that file's own comment: "a heavy Elite user on PEAK could cost well
// above their subscription price before the soft cap even noticed." The
// exact same failure mode exists for image and video generation, and was
// never fixed there:
//
//   checkDailyImageCap / checkDailyVideoCap (lib/rate-limit/index.ts) only
//   enforce a raw COUNT (dailyImages: 300, dailyVideos: 50 for premium —
//   see tiers/limits.ts). Neither checks an actual dollar amount.
//
// Doing the math on the existing count ceilings alone:
//   - Image generation (Flux-family via fal.ai): ~$0.003–$0.06/image
//     depending on model tier. 300 images/day for a month, uncapped by
//     dollars, could reach $27–$540/month against a $9.99–$3.99/mo
//     subscription.
//   - Video generation (Kling via fal.ai): ~$0.05–$0.42/SECOND, far more
//     expensive per unit than an image. 50 videos/day at even a
//     conservative 5s clip and the lower end of that range is
//     $12.50/day — ~$375/month possible against the same subscription
//     price. This is almost certainly the single largest overspend
//     exposure in the product, larger than PEAK text ever was.
//
// This module adds the same two-layer guard peak-budget.ts already proved
// out for text — request-count ceiling (already existed) + a monthly
// dollar ceiling (new) — for image and video independently, using the
// same atomic Redis reserve/settle pattern so concurrent requests can't
// all slip in under a too-small placeholder before any of them settles.
//
// STARTING NUMBERS, NOT FINAL: the dollar ceilings below are sized the
// same way peak-budget.ts sized PEAK's — against worst-case revenue
// (premium's lowest effective price, the $3.99/mo annual plan) — but
// using estimated market rates for Flux/Kling rather than a metered
// actual bill, since exact per-unit cost depends on which specific
// fal.ai model tier gets wired up. Re-derive PER_IMAGE_COST_USD_ESTIMATE
// and PER_VIDEO_SECOND_COST_USD_ESTIMATE from your real fal.ai invoice
// once there's a full billing cycle of data, the same way peak-budget.ts's
// own comment recommends revisiting after 90 days of usage.

import { redis } from '@/lib/redis';
import type { Tier } from '@/lib/rate-limit';

export type MediaKind = 'image' | 'video';

// ── Estimated per-unit cost (USD) — see header comment ─────────────────────
// Image: Flux-family pricing via fal.ai ranges ~$0.003 (schnell tier) to
// ~$0.06 (pro/ultra tier). Using $0.04 as a mid-range planning estimate;
// tune to whichever specific Flux tier is actually wired up in
// lib/media/primary-image.ts.
export const PER_IMAGE_COST_USD_ESTIMATE = 0.04;

// Video: Kling via fal.ai, ~$0.05–$0.42/second depending on quality tier.
// Using $0.15/sec as a mid-range planning estimate, and assuming a typical
// generated clip is ~5 seconds (matches the short in-chat video use case,
// not a long-form video product) for the per-request reservation below.
export const PER_VIDEO_SECOND_COST_USD_ESTIMATE = 0.15;
export const ESTIMATED_VIDEO_SECONDS_PER_CLIP = 5;
export const PER_VIDEO_COST_USD_ESTIMATE =
  PER_VIDEO_SECOND_COST_USD_ESTIMATE * ESTIMATED_VIDEO_SECONDS_PER_CLIP;

// ── Monthly dollar ceilings per tier ────────────────────────────────────────
// Sized against premium's worst-case ($3.99/mo annual revenue), same
// approach as PEAK_MONTHLY_DOLLAR_CEILING_USD in peak-budget.ts. Image and
// video are budgeted independently of each other and of PEAK's own $1.19
// ceiling — total worst-case AI cost per premium user is the sum of all
// three guards, which should be re-checked against actual revenue whenever
// any one of these numbers changes.
export const MEDIA_MONTHLY_DOLLAR_CEILING_USD: Record<MediaKind, Record<Tier, number>> = {
  image: {
    free: 0.05,   // ~1 image/month at worst-case pricing — free's dailyImages:1
                  // cap already limits volume; this is a second independent
                  // guard against a single unusually expensive generation.
    premium: 2.00, // ≈50 images/month at the $0.04 estimate above — well
                   // under premium's advertised dailyImages:300 count cap,
                   // which is deliberately generous on volume; this dollar
                   // ceiling is the real backstop once real usage data comes in.
  },
  video: {
    free: 0,      // free's dailyVideos is already 0 — belt-and-suspenders,
                  // matches checkDailyVideoCap's existing free-tier block.
    premium: 3.00, // ≈20 clips/month at the $0.75/clip estimate above.
                   // Deliberately conservative relative to the advertised
                   // dailyVideos:50 count cap — video is the highest per-unit
                   // cost item in the product; this ceiling is what actually
                   // protects margin, not the count cap.
  },
};

function monthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function settledCentsKey(kind: MediaKind, userId: string): string {
  return `vantrix:media-budget:${kind}:settled-cents:${monthKey()}:${userId}`;
}

function reservedCentsKey(kind: MediaKind, userId: string): string {
  return `vantrix:media-budget:${kind}:reserved-cents:${monthKey()}:${userId}`;
}

const TTL_SECONDS = 60 * 60 * 24 * 35; // comfortably past month boundary

// Same atomic check-and-reserve approach as peak-budget.ts's RESERVE_SCRIPT:
// a single Lua script so concurrent requests can't all read "under budget"
// and all pass.
const RESERVE_SCRIPT = `
local settled    = tonumber(redis.call('GET', KEYS[1]) or '0')
local reserved   = tonumber(redis.call('GET', KEYS[2]) or '0')
local dollarCeil = tonumber(ARGV[1])
local estCost    = tonumber(ARGV[2])
local ttl        = tonumber(ARGV[3])

if (settled + reserved) >= dollarCeil then
  return {0, settled + reserved}
end

reserved = redis.call('INCRBY', KEYS[2], estCost)
redis.call('EXPIRE', KEYS[2], ttl)

return {1, settled + reserved}
`;

export interface MediaBudgetCheck {
  allowed: boolean;
  reason?: 'dollar_ceiling_exceeded';
  spendUsd: number;
  ceilingUsd: number;
}

/**
 * Call BEFORE dispatching an image or video generation request, in addition
 * to (not instead of) the existing checkDailyImageCap/checkDailyVideoCap
 * count checks. If `allowed` is false, the request should be blocked the
 * same way a count-cap failure is blocked today (e.g. a 429 with an
 * upgrade/try-again-later message) — this is a second independent guard,
 * not a replacement for the count cap.
 *
 * On success, this has already atomically reserved the estimated cost —
 * callers MUST follow up with recordMediaUsage() once the job completes to
 * reconcile against actual cost (if known), or releaseMediaReservation() if
 * the job never reaches the provider (mirrors peak-budget.ts's contract).
 */
export async function checkMediaBudget(
  kind: MediaKind,
  userId: string,
  tier: Tier,
): Promise<MediaBudgetCheck> {
  const ceilingUsd = MEDIA_MONTHLY_DOLLAR_CEILING_USD[kind][tier] ?? 0;
  const estimatedCostUsd =
    kind === 'image' ? PER_IMAGE_COST_USD_ESTIMATE : PER_VIDEO_COST_USD_ESTIMATE;

  if (ceilingUsd <= 0) {
    return { allowed: false, reason: 'dollar_ceiling_exceeded', spendUsd: 0, ceilingUsd };
  }

  const [admitted, spendCents] = await redis.eval(
    RESERVE_SCRIPT,
    [settledCentsKey(kind, userId), reservedCentsKey(kind, userId)],
    [
      String(Math.round(ceilingUsd * 100)),
      String(Math.round(estimatedCostUsd * 100)),
      String(TTL_SECONDS),
    ],
  ) as [number, number];

  const spendUsd = spendCents / 100;

  if (admitted !== 1) {
    return { allowed: false, reason: 'dollar_ceiling_exceeded', spendUsd, ceilingUsd };
  }

  return { allowed: true, spendUsd, ceilingUsd };
}

/**
 * Call AFTER a generation job completes. If the provider returns an actual
 * cost/billing figure, pass it as `actualCostUsd` for an exact reconciliation
 * (mirrors peak-budget.ts's token-based reconciliation); otherwise this
 * falls back to settling the same estimate that was reserved, which is
 * still far better than never settling at all (the reservation would
 * otherwise sit in "reserved" for the rest of the month even though the
 * job succeeded and should count as real spend).
 */
export async function recordMediaUsage(
  kind: MediaKind,
  userId: string,
  actualCostUsd?: number,
): Promise<void> {
  const estimatedCostUsd =
    kind === 'image' ? PER_IMAGE_COST_USD_ESTIMATE : PER_VIDEO_COST_USD_ESTIMATE;
  const reservedCents = Math.round(estimatedCostUsd * 100);
  const actualCents = Math.round((actualCostUsd ?? estimatedCostUsd) * 100);

  const RECONCILE_SCRIPT = `
    redis.call('DECRBY', KEYS[1], tonumber(ARGV[1]))
    redis.call('INCRBY', KEYS[2], tonumber(ARGV[2]))
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
    redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3]))
    return 1
  `;

  await redis.eval(
    RECONCILE_SCRIPT,
    [reservedCentsKey(kind, userId), settledCentsKey(kind, userId)],
    [String(reservedCents), String(actualCents), String(TTL_SECONDS)],
  );
}

/**
 * Release a reservation without settling any real cost — for the case
 * where checkMediaBudget() admitted a request but it never reached the
 * provider (e.g. moderation rejected the prompt, or an error before
 * dispatch). Without this, an aborted request would permanently consume
 * its estimated-cost reservation for the rest of the month.
 */
export async function releaseMediaReservation(kind: MediaKind, userId: string): Promise<void> {
  const estimatedCostUsd =
    kind === 'image' ? PER_IMAGE_COST_USD_ESTIMATE : PER_VIDEO_COST_USD_ESTIMATE;
  const reservedCents = Math.round(estimatedCostUsd * 100);

  await redis.eval(
    `redis.call('DECRBY', KEYS[1], tonumber(ARGV[1])) return 1`,
    [reservedCentsKey(kind, userId)],
    [String(reservedCents)],
  );
}
