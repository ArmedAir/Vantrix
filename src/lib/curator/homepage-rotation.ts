/**
 * Homepage hero rotation — Groq decides which characters headline the
 * homepage; deterministic rules bound what it's allowed to choose.
 *
 * Surface: /api/discover/featured mode=full → `featured` (hero carousel),
 * which reads characters WHERE is_featured ORDER BY featured_position LIMIT 5.
 * This job owns only the slots admins haven't filled by hand:
 *
 *   slots = 5 − (characters featured manually)
 *
 * "Manually" = is_featured with featured_source 'manual' OR NULL. Those rows
 * are never demoted, reordered or otherwise touched. AI-managed rows carry
 * featured_source='ai' and positions 100+ so they always sort AFTER any
 * hand-picked hero.
 *
 * Three modes (HOMEPAGE_ROTATION_MODE):
 *   off    — no-op
 *   shadow — (default) run the full decision, log it to ai_brain_decisions,
 *            write NOTHING to characters. Review the log, then flip to live.
 *   live   — apply the decision.
 *
 * Safety properties:
 *   - SFW only: the hero is visible to logged-out visitors, so the pool is
 *     is_nsfw=false, live, active, public — regardless of who's asking.
 *   - The LLM only picks from a pool we built; sanitizePicks() (rotation-logic)
 *     re-validates whatever it returns and enforces carry-over + gender
 *     coverage. If Groq is unavailable the deterministic picker produces the
 *     same shape of answer, so the homepage keeps rotating without it.
 *   - Prompt carries public catalog metadata + counts only.
 *   - Every run — applied or not — is logged.
 */

import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { env } from '@/env';
import { brainJSON } from '@/lib/ai/groq-brain';
import type { Json } from '@/types/supabase';
import {
  deterministicPicks, sanitizePicks, MAX_CARRY_OVER_SHARE,
  type RotationCandidate,
} from './rotation-logic';

export const HERO_TOTAL_SLOTS   = 5;   // must match .limit(5) on the hero query in /api/discover/featured
const AI_POSITION_BASE          = 100; // AI slots sort after every hand-picked hero
const TASK                      = 'homepage-rotation';
const POOL_TOP_ENGAGEMENT       = 25;
const POOL_NEWEST               = 15;
const DAILY_CAP                 = 40;

export type RotationMode = 'off' | 'shadow' | 'live';

export interface RotationResult {
  mode:       RotationMode;
  status:     'skipped' | 'shadow' | 'applied' | 'failed';
  reason?:    string;
  picks:      string[];
  slots:      number;
  usedBrain:  boolean;
  model?:     string;
}

const responseSchema = z.object({
  picks: z.array(z.object({ id: z.string(), why: z.string().optional() })),
});

const toJson = (v: unknown): Json => JSON.parse(JSON.stringify(v)) as Json;

async function logDecision(row: {
  mode: 'shadow' | 'live'; applied: boolean; usedBrain: boolean; model?: string;
  input: unknown; output: unknown; latencyMs?: number;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('ai_brain_decisions').insert({
    task:          TASK,
    mode:          row.mode,
    applied:       row.applied,
    used_brain:    row.usedBrain,
    model:         row.model ?? null,
    input_summary: toJson(row.input),
    output:        toJson(row.output),
    latency_ms:    row.latencyMs ?? null,
  });
  if (error) logger.warn('[homepage-rotation] decision log insert failed', { error: error.message });
}

const CANDIDATE_COLS = 'id,name,gender,archetype,tags,like_count,follower_count,created_at';

async function loadPool(excludeIds: Set<string>): Promise<RotationCandidate[]> {
  const base = () => supabaseAdmin
    .from('characters')
    .select(CANDIDATE_COLS)
    .eq('is_live', true)
    .eq('active', true)
    .eq('is_public', true)
    .eq('is_nsfw', false)
    .not('image_url', 'is', null);

  const [top, fresh] = await Promise.all([
    base().order('like_count', { ascending: false }).limit(POOL_TOP_ENGAGEMENT),
    base().order('created_at', { ascending: false }).limit(POOL_NEWEST),
  ]);
  if (top.error)   throw new Error(`pool(top): ${top.error.message}`);
  if (fresh.error) throw new Error(`pool(fresh): ${fresh.error.message}`);

  const seen = new Set<string>();
  const pool: RotationCandidate[] = [];
  for (const row of [...(top.data ?? []), ...(fresh.data ?? [])]) {
    if (seen.has(row.id) || excludeIds.has(row.id)) continue;
    seen.add(row.id);
    pool.push(row as unknown as RotationCandidate);
  }
  return pool;
}

async function loadPreviousPicks(): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from('ai_brain_decisions')
    .select('output')
    .eq('task', TASK)
    .order('created_at', { ascending: false })
    .limit(1);
  const out = data?.[0]?.output as unknown as { picks?: unknown } | undefined;
  return new Set(Array.isArray(out?.picks) ? (out!.picks as unknown[]).filter((x): x is string => typeof x === 'string') : []);
}

function buildPrompt(pool: RotationCandidate[], slots: number, previous: Set<string>, now: number) {
  const system = [
    'You choose which characters headline the homepage hero carousel of an AI companion app.',
    `Pick EXACTLY ${slots} characters from the candidate list.`,
    'Goals, in priority order: (1) variety — mix genders and archetypes, never more than 2 of the same archetype; (2) a blend of proven favorites (high likes/followers) and fresh arrivals (low ageDays); (3) rotation — at most ' + Math.floor(slots * MAX_CARRY_OVER_SHARE) + ' picks may have wasFeatured=true.',
    'Respond with ONLY minified JSON, no prose, no code fences: {"picks":[{"id":"<id>","why":"<under 10 words>"}]}',
    'Use only ids from the candidate list, each at most once.',
  ].join(' ');

  const user = JSON.stringify({
    slots,
    candidates: pool.map(c => ({
      id: c.id,
      name: c.name,
      gender: c.gender,
      archetype: c.archetype,
      tags: (c.tags ?? []).slice(0, 4),
      likes: c.like_count ?? 0,
      followers: c.follower_count ?? 0,
      ageDays: Math.round((now - new Date(c.created_at).getTime()) / 86_400_000),
      wasFeatured: previous.has(c.id),
    })),
  });
  return { system, user };
}

export async function runHomepageRotation(): Promise<RotationResult> {
  const mode = (env.HOMEPAGE_ROTATION_MODE ?? 'shadow') as RotationMode;
  if (mode === 'off') return { mode, status: 'skipped', reason: 'mode=off', picks: [], slots: 0, usedBrain: false };

  const now = Date.now();

  // 1. Which hero slots are ours?
  const { data: featured, error: fErr } = await supabaseAdmin
    .from('characters')
    .select('id,featured_source')
    .eq('is_featured', true);
  if (fErr) throw new Error(`featured: ${fErr.message}`);

  const manualIds  = new Set((featured ?? []).filter(r => r.featured_source !== 'ai').map(r => r.id));
  const currentAi  = (featured ?? []).filter(r => r.featured_source === 'ai').map(r => r.id);
  const slots      = HERO_TOTAL_SLOTS - manualIds.size;
  if (slots <= 0) {
    return { mode, status: 'skipped', reason: 'all hero slots are manually pinned', picks: [], slots: 0, usedBrain: false };
  }

  // 2. Pool + what was shown last time.
  const [pool, previous] = await Promise.all([loadPool(manualIds), loadPreviousPicks()]);
  if (pool.length === 0) {
    return { mode, status: 'skipped', reason: 'empty candidate pool', picks: [], slots, usedBrain: false };
  }

  // 3. Decide — Groq first, deterministic fallback; both pass through sanitizePicks.
  let proposed: string[] = [];
  let usedBrain = false;
  let model: string | undefined;
  let latencyMs: number | undefined;

  const { system, user } = buildPrompt(pool, slots, previous, now);
  const out = await brainJSON({
    task: 'rotation.homepage', system, user, schema: responseSchema,
    priority: 'background', size: 'smart', maxTokens: 1500, temperature: 0.5, dailyCap: DAILY_CAP,
  });
  if (out.ok) {
    proposed  = out.data.picks.map(p => p.id);
    usedBrain = true;
    model     = out.model;
    latencyMs = out.latencyMs;
  } else {
    proposed = deterministicPicks(pool, slots, previous, now);
    logger.info('[homepage-rotation] brain unavailable, using deterministic picks', { reason: out.reason });
  }
  const picks = sanitizePicks(proposed, pool, slots, previous, now);

  const inputSummary = {
    slots, manualPinned: manualIds.size, poolSize: pool.length,
    previousPicks: [...previous], brainSkipReason: out.ok ? null : out.reason,
  };
  const outputSummary = {
    picks,
    why: out.ok ? Object.fromEntries(out.data.picks.filter(p => p.why).map(p => [p.id, p.why])) : {},
  };

  // 4. Shadow mode: log, don't touch the site.
  if (mode === 'shadow') {
    await logDecision({ mode: 'shadow', applied: false, usedBrain, model, input: inputSummary, output: outputSummary, latencyMs });
    return { mode, status: 'shadow', picks, slots, usedBrain, model };
  }

  // 5. Live: demote stale AI picks, promote the new ones.
  try {
    const toDemote = currentAi.filter(id => !picks.includes(id));
    if (toDemote.length) {
      const { error } = await supabaseAdmin
        .from('characters')
        .update({ is_featured: false, featured_position: 0, featured_source: null })
        .in('id', toDemote);
      if (error) throw new Error(`demote: ${error.message}`);
    }
    const results = await Promise.all(picks.map((id, i) =>
      supabaseAdmin
        .from('characters')
        .update({ is_featured: true, featured_position: AI_POSITION_BASE + i, featured_source: 'ai' })
        .eq('id', id),
    ));
    const failed = results.find(r => r.error);
    if (failed?.error) throw new Error(`promote: ${failed.error.message}`);

    await logDecision({ mode: 'live', applied: true, usedBrain, model, input: inputSummary, output: outputSummary, latencyMs });
    return { mode, status: 'applied', picks, slots, usedBrain, model };
  } catch (err) {
    logger.error('[homepage-rotation] apply failed', { error: String(err) });
    await logDecision({ mode: 'live', applied: false, usedBrain, model, input: { ...inputSummary, applyError: String(err) }, output: outputSummary, latencyMs });
    return { mode, status: 'failed', reason: String(err), picks, slots, usedBrain, model };
  }
}
