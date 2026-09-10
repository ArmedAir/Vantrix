/**
 * GET /api/cron/memory-tier-consolidation
 *
 * Drives the new short/medium/long-term memory tier subsystem
 * (src/lib/memory-tiers/). Pops pairs marked dirty by
 * appendShortTermTurn() and, for each, digests new short-term turns into
 * medium-term, then promotes any medium-term entries that have crossed the
 * importance/reinforcement threshold into permanent long-term storage.
 *
 * Frequent, cheap, small batches — same rationale as message-recovery and
 * billing-recovery's every-5-minutes cadence: a dirty-set drain is meant to
 * stay caught up continuously, not batch up a huge backlog and process it
 * once a day. Each invocation only claims BATCH_SIZE pairs so a single run
 * always finishes well inside maxDuration even under load; leftover dirty
 * pairs simply get picked up by the next invocation.
 *
 * Security: requires CRON_SECRET header, same as every other cron route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth }             from '@/lib/security';
import { supabaseAdmin }             from '@/lib/supabase/admin';
import { logger }                    from '@/lib/logger';
import { env }                       from '@/env';
import { heartbeatStart, heartbeatSuccess, heartbeatFail } from '@/lib/cron/heartbeat';
import { drainDirtyPairs } from '@/lib/memory-tiers/memory-tier-engine';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';
export const maxDuration = 30;

const BATCH_SIZE = 200;

// Small in-memory cache for the lifetime of this single invocation only —
// several dirty pairs in the same batch are often the same character
// (many users, one character), no reason to hit Supabase per pair.
async function makeCharacterNameResolver() {
  const cache = new Map<string, string>();
  return async (characterId: string): Promise<string> => {
    const cached = cache.get(characterId);
    if (cached) return cached;
    const { data } = await supabaseAdmin
      .from('characters')
      .select('name')
      .eq('id', characterId)
      .single();
    const name = (data?.name as string) || 'They';
    cache.set(characterId, name);
    return name;
  };
}

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await heartbeatStart('MEMORY_TIER_CONSOLIDATION');

  try {
    const resolveCharacterName = await makeCharacterNameResolver();
    const results = await drainDirtyPairs(BATCH_SIZE, resolveCharacterName);

    const digested = results.filter(r => r.digested).length;
    const promoted = results.reduce((sum, r) => sum + r.promotedCount, 0);
    const failed = results.filter(r => r.skipped).length;

    logger.info('cron:memory-tier-consolidation:complete', {
      pairsProcessed: results.length,
      digested,
      promoted,
      failed,
    });

    await heartbeatSuccess('MEMORY_TIER_CONSOLIDATION');
    return NextResponse.json({
      ok: true,
      pairsProcessed: results.length,
      digested,
      promoted,
      failed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('cron:memory-tier-consolidation:failed', { error: err instanceof Error ? err.message : String(err) });
    await heartbeatFail('MEMORY_TIER_CONSOLIDATION');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
