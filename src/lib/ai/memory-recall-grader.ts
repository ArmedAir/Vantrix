/**
 * Memory Recall Grader — the read side of the recall-accuracy loop.
 * ───────────────────────────────────────────────────────────────────────────
 * Samples rows memory-recall-audit.ts wrote, re-fetches the referenced
 * memory_graph rows fresh (not a copy — so an edit or archival between
 * write and grading is reflected), and asks a cheap judge model whether the
 * reply was faithful to what the character actually knew.
 *
 * This is NOT a live-request gate. It runs from a low-frequency cron
 * (api/cron/recall-accuracy-audit, same tier as embedding-backfill) against
 * already-sent replies, purely for observability — see
 * MEMORY_RECALL_ACCURACY_TARGET below and /api/admin/recall-accuracy for
 * where the aggregate shows up. A bad verdict here can inform a fix (a
 * prompt-instruction change, a precedence bug in memory-arbiter.ts) but
 * never blocks or retroactively alters anything a user already received.
 *
 * Design mirrors response-planner.ts's judge-call shape deliberately: NANO
 * tier, low temperature, strict-JSON instruction, defensive markdown-fence
 * stripping, fail-open on any parse/provider failure (row just stays
 * 'pending' and is retried on the next run rather than mis-recorded).
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { routeCompletion } from '@/lib/ai/provider-router';

const GRADER_TIMEOUT_MS = 4_000; // offline batch job, not request-latency-sensitive — generous but still bounded
const GRADER_MAX_TOKENS = 150;
const MAX_MEMORY_TEXT_LEN = 400; // matches semantic-memory.ts's own memoryText() truncation

// Below this pass rate (consistent / (consistent + contradicted), excluding
// 'unverifiable') the admin recall-accuracy endpoint flags red rather than
// just reporting a number — see api/admin/recall-accuracy/route.ts. Chosen
// as a starting threshold, same spirit as semantic-memory.ts's
// MAX_EXTRA_SIMILARITY_HITS comment: tune against real score distributions
// once this has run against production traffic, not guessed forever.
export const MEMORY_RECALL_ACCURACY_TARGET = 0.95;

interface AuditRow {
  id: string;
  memory_ids: string[];
  user_message: string;
  assistant_reply: string;
}

interface JudgeVerdict {
  verdict: 'consistent' | 'contradicted' | 'unverifiable';
  reasoning: string;
}

function buildJudgePrompt(memories: { title: string; description: string }[], userMessage: string, assistantReply: string): string {
  const memoryLines = memories
    .map((m, i) => `${i + 1}. ${m.title}: ${m.description.slice(0, MAX_MEMORY_TEXT_LEN)}`)
    .join('\n');

  return [
    'You are a strict consistency checker for an AI companion app\'s long-term memory system.',
    'You will be given the exact memories the companion has access to, the user\'s message, and the companion\'s reply.',
    '',
    'Memories available to the companion:',
    memoryLines,
    '',
    `User said: "${userMessage.slice(0, 500)}"`,
    `Companion replied: "${assistantReply.slice(0, 800)}"`,
    '',
    'Decide the verdict:',
    '- "contradicted": the reply states something, as a specific recalled fact, that conflicts with one of the memories above, OR invents a specific detail (a name, date, place, or event) framed as something remembered that does not appear in any memory above.',
    '- "consistent": the reply does not conflict with or invent anything beyond the memories above. General in-character warmth, tone, or vague affection is fine and does not need to be traceable to a specific memory.',
    '- "unverifiable": none of the memories above are relevant to what\'s being discussed and the reply makes no specific recall claim either way.',
    '',
    'Output ONLY valid JSON, no markdown fences, no commentary, matching exactly this shape:',
    '{"verdict": "consistent" | "contradicted" | "unverifiable", "reasoning": string}',
    'Keep "reasoning" to one short sentence.',
  ].join('\n');
}

function parseVerdict(raw: string): JudgeVerdict | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (parsed.verdict !== 'consistent' && parsed.verdict !== 'contradicted' && parsed.verdict !== 'unverifiable') return null;

    return {
      verdict: parsed.verdict,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 300) : '',
    };
  } catch {
    return null;
  }
}

async function gradeOne(row: AuditRow): Promise<void> {
  const { data: memoryRows, error: fetchErr } = await supabaseAdmin
    .from('memory_graph')
    .select('title, description')
    .in('id', row.memory_ids);

  if (fetchErr) {
    logger.warn('memory-recall-grader: memory fetch failed', { auditId: row.id, error: fetchErr.message });
    return; // leave pending — retried next run
  }

  const memories = (memoryRows ?? []) as unknown as { title: string; description: string }[];

  // Every referenced memory has since been archived/deleted — nothing left
  // to grade against. Not a judge failure; mark it explicitly so this row
  // stops being re-sampled forever (see idx_recall_audit_pending, which
  // only ever pulls grading_status = 'pending').
  if (memories.length === 0) {
    const { error } = await supabaseAdmin
      .from('memory_recall_audit')
      .update({ grading_status: 'skipped', graded_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) logger.warn('memory-recall-grader: skip-write failed', { auditId: row.id, error: error.message });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRADER_TIMEOUT_MS);

  try {
    const response = await routeCompletion({
      messages: [
        { role: 'system', content: buildJudgePrompt(memories, row.user_message, row.assistant_reply) },
        { role: 'user', content: 'Return the verdict JSON now.' },
      ],
      modelTier: 'NANO',
      maxTokens: GRADER_MAX_TOKENS,
      temperature: 0.1, // grading, not generation — want the judge to be consistent run to run
      signal: controller.signal,
    });

    const verdict = parseVerdict(response.reply);
    if (!verdict) {
      logger.warn('memory-recall-grader: unparseable verdict, leaving pending', { auditId: row.id, raw: response.reply.slice(0, 200) });
      return; // leave pending — retried next run rather than recorded wrong
    }

    const { error: updateErr } = await supabaseAdmin
      .from('memory_recall_audit')
      .update({
        grading_status: 'graded',
        verdict: verdict.verdict,
        verdict_reasoning: verdict.reasoning,
        graded_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (updateErr) {
      logger.warn('memory-recall-grader: grade-write failed', { auditId: row.id, error: updateErr.message });
    } else if (verdict.verdict === 'contradicted') {
      // Worth its own log line at warn (not just the aggregate) — a single
      // contradicted turn is a real data point on a specific
      // character/user pair, not noise to only see in a dashboard average.
      logger.warn('memory-recall-grader: contradiction detected', {
        auditId: row.id, reasoning: verdict.reasoning,
      });
    }
  } catch (err) {
    logger.warn('memory-recall-grader: judge call failed, leaving pending', { auditId: row.id, error: err instanceof Error ? err.message : String(err) });
  } finally {
    clearTimeout(timer);
  }
}

export interface GradeBatchResult {
  sampled: number;
  graded: number;
  skipped: number;
  contradicted: number;
}

/**
 * Grades up to `batchSize` pending audit rows, oldest first, weighted
 * toward turns that had active fact-conflicts (see the migration's index
 * comment — that's where confabulation risk concentrates). Never throws;
 * a per-row failure just leaves that row 'pending' for the next run.
 */
export async function gradeRecallBatch(batchSize = 25): Promise<GradeBatchResult> {
  const { data, error } = await supabaseAdmin
    .from('memory_recall_audit')
    .select('id, memory_ids, user_message, assistant_reply')
    .eq('grading_status', 'pending')
    .order('fact_conflict_count', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    logger.warn('memory-recall-grader: sample fetch failed', { error: error.message });
    return { sampled: 0, graded: 0, skipped: 0, contradicted: 0 };
  }

  const rows = (data ?? []) as unknown as AuditRow[];
  if (rows.length === 0) return { sampled: 0, graded: 0, skipped: 0, contradicted: 0 };

  for (const row of rows) {
    await gradeOne(row);
  }

  // Re-read final statuses for this batch rather than tracking counters
  // through gradeOne()'s early-returns — fewer places for the two to drift.
  const { data: finalRows } = await supabaseAdmin
    .from('memory_recall_audit')
    .select('grading_status, verdict')
    .in('id', rows.map((r) => r.id));

  const settled = (finalRows ?? []) as unknown as { grading_status: string; verdict: string | null }[];
  return {
    sampled: rows.length,
    graded: settled.filter((r) => r.grading_status === 'graded').length,
    skipped: settled.filter((r) => r.grading_status === 'skipped').length,
    contradicted: settled.filter((r) => r.verdict === 'contradicted').length,
  };
}
