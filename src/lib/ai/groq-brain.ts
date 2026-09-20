/**
 * Groq Brain — the free-tier "decision" LLM for Vantrix.
 *
 * WHAT THIS IS: one shared, rate-limit-aware entry point for every feature that
 * asks an LLM to DECIDE something (rank this shortlist, pick tomorrow's homepage
 * heroes, order these X posts) rather than to TALK to a user. Companion chat,
 * memory, moderation and everything else stay on OpenRouter — provider-router.ts
 * registers 'groq' but never puts it in a ROUTING_ORDER chain, so nothing here
 * can leak into chat and chat can never fail over onto Groq.
 *
 * WHY A GOVERNOR: Groq's free tier is limited per MODEL and per ORGANIZATION
 * (extra API keys don't add quota) — roughly 30 requests/min, ~1,000 requests/day
 * on the gpt-oss models, and a small tokens/min ceiling. A 429 costs a wasted
 * round trip and trips the shared circuit breaker, so this module counts usage
 * in Redis (shared across every serverless instance) and refuses to call BEFORE
 * the limit rather than after. Design consequences:
 *
 *   - Two-model load balancing: 'fast' (gpt-oss-20b) and 'smart' (gpt-oss-120b)
 *     have independent quotas. A call prefers the model that fits its size class
 *     and spills to the other when the first is exhausted, roughly doubling
 *     usable daily volume for free.
 *   - Priority classes: 'interactive' (a user is waiting) may use 100% of the
 *     envelope; 'background' (cron) is capped at BACKGROUND_SHARE of it so a
 *     batch job can never starve the homepage.
 *   - Per-task daily caps: one chatty task can't eat the whole day's budget.
 *   - Fail CLOSED on Redis trouble (same posture as content-generator.ts): an
 *     unmeterable call is a skipped call, never an unmetered one.
 *   - Every skip/failure returns a typed reason, never throws — callers already
 *     own a deterministic fallback and use it.
 *
 * DATA POLICY (enforced by callers, restated here because it matters): prompts
 * sent to Groq must carry only pseudonymous taste signals and public catalog
 * metadata (tag names, archetypes, character names, public captions). Never
 * chat text, memories, emails, user ids, or anything from NSFW-gated surfaces.
 */

import { z } from 'zod';
import { redis } from '@/lib/redis';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import { routeCompletion } from './provider-router';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BrainPriority = 'interactive' | 'background';
export type BrainSize     = 'fast' | 'smart';

export type BrainSkipReason =
  | 'disabled'   // GROQ_BRAIN_ENABLED=false
  | 'paused'     // admin kill switch (Redis flag)
  | 'no-key'     // GROQ_API_KEY unset
  | 'budget'     // governor refused (rpm / rpd / tpm / per-task cap / redis down)
  | 'cooldown'   // recent 429 on every candidate model
  | 'provider'   // call failed (timeout, 5xx, empty completion, breaker open)
  | 'parse'      // reply was not valid JSON
  | 'schema';    // JSON didn't match the caller's Zod schema

export type BrainOutcome<T> =
  | { ok: true;  data: T; model: string; latencyMs: number; tokens: number }
  | { ok: false; reason: BrainSkipReason };

export interface BrainJSONOptions<T> {
  /** Stable task id — used for per-task caps and stats, e.g. 'curator.discover'. */
  task:        string;
  system:      string;
  user:        string;
  schema:      z.ZodType<T>;
  priority:    BrainPriority;
  size?:       BrainSize;
  maxTokens?:  number;
  temperature?: number;
  /** Max calls this task may make per UTC day (in addition to the global limits). */
  dailyCap?:   number;
  signal?:     AbortSignal;
}

export interface BrainLimits { rpm: number; rpd: number; tpm: number }

// ── Limits ────────────────────────────────────────────────────────────────────

/**
 * Background work may use at most this share of every limit. Interactive calls
 * get the remainder plus anything background didn't use.
 */
export const BACKGROUND_SHARE = 0.6;

// Deliberately a notch under Groq's published free ceilings so estimation error
// and clock skew between instances don't turn into real 429s. Override with
// GROQ_RPM_LIMIT / GROQ_RPD_LIMIT / GROQ_TPM_LIMIT to match your org's
// console.groq.com limits page (they vary by model and change over time).
const PLAN_DEFAULTS: Record<'free' | 'developer', BrainLimits> = {
  free:      { rpm: 25,  rpd: 900,    tpm: 7_000   },
  developer: { rpm: 500, rpd: 50_000, tpm: 150_000 },
};

function positiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function getBrainLimits(): BrainLimits {
  const base = PLAN_DEFAULTS[env.GROQ_PLAN ?? 'free'];
  return {
    rpm: positiveInt(env.GROQ_RPM_LIMIT) ?? base.rpm,
    rpd: positiveInt(env.GROQ_RPD_LIMIT) ?? base.rpd,
    tpm: positiveInt(env.GROQ_TPM_LIMIT) ?? base.tpm,
  };
}

export function getBrainModels(): { fast: string; smart: string } {
  return {
    fast:  env.GROQ_BRAIN_MODEL_FAST  ?? 'openai/gpt-oss-20b',
    smart: env.GROQ_BRAIN_MODEL_SMART ?? 'openai/gpt-oss-120b',
  };
}

// ── Redis keys ────────────────────────────────────────────────────────────────

const PAUSED_KEY = 'groq:brain:paused';

function utcDay(d = new Date()): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
const minuteBucket = (): number => Math.floor(Date.now() / 60_000);

const rpmKey      = (m: string) => `groq:rpm:${m}:${minuteBucket()}`;
const tpmKey      = (m: string) => `groq:tpm:${m}:${minuteBucket()}`;
const rpdKey      = (m: string) => `groq:rpd:${m}:${utcDay()}`;
const cooldownKey = (m: string) => `groq:cooldown:${m}`;
const taskKey     = (t: string) => `groq:task:${t}:${utcDay()}`;
const statKey     = () => `groq:stat:${utcDay()}`;

// ── Governor ──────────────────────────────────────────────────────────────────

type ReserveResult = 'ok' | 'rpm' | 'rpd' | 'tpm' | 'error';

/**
 * INCR-then-check-then-refund. Atomic enough for a soft client-side limiter:
 * two instances racing can each get one extra request in, which the safety
 * margin in PLAN_DEFAULTS absorbs. On refusal the reservation is refunded so
 * refused calls don't consume quota.
 */
async function reserve(
  model: string, priority: BrainPriority, estTokens: number,
): Promise<ReserveResult> {
  const limits = getBrainLimits();
  const share  = priority === 'background' ? BACKGROUND_SHARE : 1;
  const maxRpm = Math.max(1, Math.floor(limits.rpm * share));
  const maxRpd = Math.max(1, Math.floor(limits.rpd * share));
  const maxTpm = Math.max(1, Math.floor(limits.tpm * share));

  const rk = rpmKey(model), dk = rpdKey(model), tk = tpmKey(model);
  try {
    const res = await redis.pipeline()
      .incr(rk).expire(rk, 90)
      .incr(dk).expire(dk, 60 * 60 * 26)
      .incrby(tk, estTokens).expire(tk, 90)
      .exec();

    const rpm = Number(res[0]);
    const rpd = Number(res[2]);
    const tpm = Number(res[4]);

    let refused: ReserveResult = 'ok';
    if (rpm > maxRpm)      refused = 'rpm';
    else if (rpd > maxRpd) refused = 'rpd';
    else if (tpm > maxTpm) refused = 'tpm';

    if (refused !== 'ok') {
      await redis.pipeline().decr(rk).decr(dk).decrby(tk, estTokens).exec().catch(() => {});
    }
    return refused;
  } catch (err) {
    logger.warn('[groq-brain] governor unavailable — failing closed', { error: String(err) });
    return 'error';
  }
}

async function reserveTask(task: string, cap: number): Promise<boolean> {
  const key = taskKey(task);
  try {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 60 * 60 * 26);
    if (n > cap) { await redis.decr(key); return false; }
    return true;
  } catch {
    return false;
  }
}

async function refundTask(task: string): Promise<void> {
  await redis.decr(taskKey(task)).catch(() => {});
}

async function bumpStat(task: string, outcome: string): Promise<void> {
  try {
    const key = statKey();
    await redis.hincrby(key, `${task}|${outcome}`, 1);
    await redis.expire(key, 60 * 60 * 24 * 3);
  } catch { /* stats are best-effort */ }
}

// ── Public controls ───────────────────────────────────────────────────────────

export async function setBrainPaused(paused: boolean): Promise<void> {
  if (paused) await redis.set(PAUSED_KEY, '1');
  else        await redis.del(PAUSED_KEY);
}

export async function isBrainPaused(): Promise<boolean> {
  try { return Boolean(await redis.get(PAUSED_KEY)); }
  catch { return true; } // can't read the kill switch → behave as if tripped
}

/** Cheap pre-check for callers that want to skip building a prompt at all. */
export function isBrainConfigured(): boolean {
  return env.GROQ_BRAIN_ENABLED !== 'false' && Boolean(process.env.GROQ_API_KEY);
}

// ── Core call ─────────────────────────────────────────────────────────────────

function stripFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/** ~4 chars/token, plus half the completion ceiling (reasoning:'low' rarely uses it all). */
function estimateTokens(system: string, user: string, maxTokens: number): number {
  return Math.ceil((system.length + user.length) / 4) + Math.ceil(maxTokens * 0.5);
}

function is429(err: unknown): boolean {
  return /\b429\b|rate.?limit/i.test(String(err));
}

export async function brainJSON<T>(opts: BrainJSONOptions<T>): Promise<BrainOutcome<T>> {
  const skip = async (reason: BrainSkipReason): Promise<BrainOutcome<T>> => {
    void bumpStat(opts.task, reason);
    return { ok: false, reason };
  };

  if (env.GROQ_BRAIN_ENABLED === 'false') return skip('disabled');
  if (!process.env.GROQ_API_KEY)          return skip('no-key');
  if (await isBrainPaused())              return skip('paused');

  const size      = opts.size ?? 'fast';
  const maxTokens = opts.maxTokens ?? 1200;
  const est       = estimateTokens(opts.system, opts.user, maxTokens);
  const models    = getBrainModels();
  // Preferred model first, the other as spill-over. De-duped in case both env
  // overrides point at the same model id.
  const order = [...new Set(size === 'smart'
    ? [models.smart, models.fast]
    : [models.fast, models.smart])];

  if (opts.dailyCap != null && !(await reserveTask(opts.task, opts.dailyCap))) {
    return skip('budget');
  }

  let sawCooldown = false;
  let sawBudget   = false;

  for (const model of order) {
    try {
      if (await redis.get(cooldownKey(model))) { sawCooldown = true; continue; }
    } catch { sawBudget = true; continue; }

    const r = await reserve(model, opts.priority, est);
    if (r !== 'ok') { sawBudget = true; continue; }

    const started = Date.now();
    try {
      const res = await routeCompletion({
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user',   content: opts.user },
        ],
        modelTier:        size === 'smart' ? 'SMART' : 'NANO',
        maxTokens,
        temperature:      opts.temperature ?? 0.3,
        modelOverride:    model,
        providerOverride: 'groq',
        jsonMode:         true,
        signal:           opts.signal,
      });

      let json: unknown;
      try { json = JSON.parse(stripFences(res.reply)); }
      catch {
        logger.warn('[groq-brain] non-JSON reply', { task: opts.task, model });
        return skip('parse');
      }

      const parsed = opts.schema.safeParse(json);
      if (!parsed.success) {
        logger.warn('[groq-brain] schema mismatch', {
          task: opts.task, model, issues: parsed.error.issues.slice(0, 3).map(i => i.path.join('.') + ': ' + i.message),
        });
        return skip('schema');
      }

      void bumpStat(opts.task, 'ok');
      return { ok: true, data: parsed.data, model, latencyMs: Date.now() - started, tokens: res.totalTokens };
    } catch (err) {
      if (is429(err)) {
        // Org-level limit hit despite the governor (another deployment sharing
        // the key, or our estimate was low). Back off this model for a minute
        // and try the other one.
        await redis.set(cooldownKey(model), '1', { ex: 60 }).catch(() => {});
        sawCooldown = true;
        continue;
      }
      logger.warn('[groq-brain] call failed', { task: opts.task, model, error: String(err).slice(0, 200) });
      return skip('provider');
    }
  }

  // Reaching here means no request was actually made (every model was refused
  // by the governor or cooling down), so give the per-task slot back.
  if (opts.dailyCap != null) await refundTask(opts.task);
  return skip(sawBudget ? 'budget' : sawCooldown ? 'cooldown' : 'provider');
}

// ── Introspection (admin status endpoint) ────────────────────────────────────

export interface BrainStatus {
  enabled:    boolean;
  configured: boolean;
  paused:     boolean;
  plan:       string;
  limits:     BrainLimits;
  models:     { fast: string; smart: string };
  usage:      Record<string, { rpmNow: number; rpdToday: number; tpmNow: number; cooldown: boolean }>;
  today:      Record<string, number>;
}

export async function getBrainStatus(): Promise<BrainStatus> {
  const models = getBrainModels();
  const usage: BrainStatus['usage'] = {};
  for (const m of new Set([models.fast, models.smart])) {
    try {
      const [rpm, rpd, tpm, cd] = await Promise.all([
        redis.get<number>(rpmKey(m)), redis.get<number>(rpdKey(m)),
        redis.get<number>(tpmKey(m)), redis.get(cooldownKey(m)),
      ]);
      usage[m] = { rpmNow: Number(rpm ?? 0), rpdToday: Number(rpd ?? 0), tpmNow: Number(tpm ?? 0), cooldown: Boolean(cd) };
    } catch {
      usage[m] = { rpmNow: 0, rpdToday: 0, tpmNow: 0, cooldown: false };
    }
  }
  let today: Record<string, number> = {};
  try {
    const raw = await redis.hgetall<Record<string, string | number>>(statKey());
    today = Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, Number(v)]));
  } catch { /* best-effort */ }

  return {
    enabled:    env.GROQ_BRAIN_ENABLED !== 'false',
    configured: Boolean(process.env.GROQ_API_KEY),
    paused:     await isBrainPaused(),
    plan:       env.GROQ_PLAN ?? 'free',
    limits:     getBrainLimits(),
    models,
    usage,
    today,
  };
}
