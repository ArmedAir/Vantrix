/**
 * GET /api/admin/recall-accuracy
 *
 * Admin-only endpoint exposing the memory_recall_audit pass rate — the
 * aggregate output of the loop memory-recall-audit.ts (write) +
 * memory-recall-grader.ts (grade, via the recall-accuracy-audit cron)
 * implement. Sibling to /api/admin/circuit-stats: that endpoint answers
 * "is the retrieval infrastructure up," this one answers "when it's up,
 * is the model actually using what it retrieves correctly" — the
 * distinction the memory system's whole design has been organized around
 * (see memory-recall-audit.ts's module header).
 *
 * passRate excludes 'unverifiable' rows from the denominator deliberately —
 * a turn where no injected memory was even relevant to what was said isn't
 * a recall data point either way, and folding it into the denominator would
 * dilute the signal with turns that never tested anything.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { requireAdmin }  from '@/lib/auth/admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { toErrorBody }   from '@/lib/errors';
import { MEMORY_RECALL_ACCURACY_TARGET } from '@/lib/ai/memory-recall-grader';

export const dynamic = 'force-dynamic';

// Recent-window default — a 30-day pass rate is far more actionable for
// "is this regressing right now" than an all-time figure that a single bad
// week from months ago would keep dragging down forever.
const DEFAULT_WINDOW_DAYS = 30;
const RECENT_CONTRADICTIONS_LIMIT = 20;

export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    await requireAdmin(user.id);

    const windowDays = Number(req.nextUrl.searchParams.get('days')) || DEFAULT_WINDOW_DAYS;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const [pending, consistent, contradicted, unverifiable, skipped, recentContradictions] = await Promise.all([
      supabaseAdmin.from('memory_recall_audit').select('id', { count: 'exact', head: true })
        .eq('grading_status', 'pending'),
      supabaseAdmin.from('memory_recall_audit').select('id', { count: 'exact', head: true })
        .eq('grading_status', 'graded').eq('verdict', 'consistent').gte('graded_at', since),
      supabaseAdmin.from('memory_recall_audit').select('id', { count: 'exact', head: true })
        .eq('grading_status', 'graded').eq('verdict', 'contradicted').gte('graded_at', since),
      supabaseAdmin.from('memory_recall_audit').select('id', { count: 'exact', head: true })
        .eq('grading_status', 'graded').eq('verdict', 'unverifiable').gte('graded_at', since),
      supabaseAdmin.from('memory_recall_audit').select('id', { count: 'exact', head: true })
        .eq('grading_status', 'skipped').gte('created_at', since),
      supabaseAdmin.from('memory_recall_audit')
        .select('id, user_id, character_id, verdict_reasoning, user_message, assistant_reply, graded_at')
        .eq('verdict', 'contradicted')
        .order('graded_at', { ascending: false })
        .limit(RECENT_CONTRADICTIONS_LIMIT),
    ]);

    for (const r of [pending, consistent, contradicted, unverifiable, skipped, recentContradictions]) {
      if (r.error) throw new Error(r.error.message);
    }

    const consistentCount    = consistent.count ?? 0;
    const contradictedCount  = contradicted.count ?? 0;
    const unverifiableCount  = unverifiable.count ?? 0;
    const gradedDenominator  = consistentCount + contradictedCount; // 'unverifiable' excluded — see module header
    const passRate           = gradedDenominator > 0 ? consistentCount / gradedDenominator : null;

    return NextResponse.json({
      windowDays,
      target: MEMORY_RECALL_ACCURACY_TARGET,
      passRate,
      healthy: passRate === null ? true : passRate >= MEMORY_RECALL_ACCURACY_TARGET,
      counts: {
        pending:      pending.count ?? 0,
        consistent:   consistentCount,
        contradicted: contradictedCount,
        unverifiable: unverifiableCount,
        skipped:      skipped.count ?? 0,
      },
      recentContradictions: recentContradictions.data ?? [],
      ts: new Date().toISOString(),
    });
  } catch (err) {
    const status = err instanceof Error && 'statusCode' in err
      ? (err as { statusCode: number }).statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
