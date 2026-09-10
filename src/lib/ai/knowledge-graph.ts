/**
 * Knowledge Graph — Explicit Entity-Relation Triplets (GraphRAG-style)
 *
 * Companion piece to user-fact-graph.ts. That module stores facts as a flat
 * category/key/value bag, tuned for fuzzy prompt injection. This module
 * stores the same underlying disclosures as (subject)-[PREDICATE]->(object)
 * triplets — e.g. (user)-[LIVES_IN]->(Austin) — giving deterministic recall
 * for core identity facts: a single indexed point-lookup instead of a
 * similarity search, so "where does this user live" can never return the
 * wrong city because a different fact happened to embed nearby.
 *
 * Versioning: writing a new edge for a (subject, predicate) that already
 * has a live edge supersedes the old one (valid_to set, superseded_by
 * linked) rather than overwriting it — see the bitemporal shape in
 * 20260909_bitemporal_knowledge_graph.sql. The full history stays
 * queryable via getEdgeHistory(); getLiveGraph() only ever returns what's
 * currently believed true.
 *
 * Extraction mirrors user-fact-graph.ts's two-pass shape (sync heuristic +
 * periodic AI pass) so a caller can run both extractors side by side off
 * the same message without duplicating the sanitize/cache/fire-and-forget
 * plumbing decisions already made there.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger, bg }    from '@/lib/logger';
import { generateStructured } from './capability';
import { redis }              from '@/lib/redis';
import { sanitize }           from '@/lib/sanitize';

const GRAPH_CACHE_TTL = 60 * 60; // 1-hour Redis cache, matches user-fact-graph.ts

// ── Types ────────────────────────────────────────────────────────────────

export type Predicate =
  | 'LIVES_IN' | 'WORKS_AS' | 'WORKS_AT' | 'HAS_PET' | 'HAS_FAMILY_MEMBER'
  | 'LIKES' | 'DISLIKES' | 'DREAMS_OF' | 'STRUGGLES_WITH' | 'BELIEVES'
  | 'IN_RELATIONSHIP_WITH' | 'PRACTICES_HOBBY' | 'BORN_IN' | 'STUDIED_AT'
  | 'ALLERGIC_TO' | 'CELEBRATES';

export interface KnowledgeEdge {
  id:             string;
  subject:        string;      // almost always 'user' or 'character'
  predicate:      Predicate | string;
  object:         string;
  confidence:     number;      // 0-1
  source:         'heuristic' | 'ai' | 'user_confirmed';
  event_time:     string;
  ingestion_time: string;
  valid_to:       string | null;
}

function graphKey(userId: string, characterId: string): string {
  return `vantrix:kg:${userId}:${characterId}`;
}

// ── Heuristic extraction (sync, no API call) ────────────────────────────────
// Deliberately narrower than user-fact-graph.ts's PATTERNS — this only
// captures disclosures precise enough to become a deterministic triplet.
// Anything softer (general sentiment, vague preferences) stays in the
// fuzzy user_facts/embeddings layer instead of polluting the graph.

const EDGE_PATTERNS: Array<{ re: RegExp; predicate: Predicate }> = [
  { re: /i (?:live in|am living in|reside in) ([^.!?,]{2,40})/gi,                      predicate: 'LIVES_IN' },
  { re: /i(?:'m| am) (?:a |an )([^.!?,]{3,40}) (?:by trade|professionally|at work)/gi, predicate: 'WORKS_AS' },
  { re: /i work at ([^.!?,]{2,50})/gi,                                                 predicate: 'WORKS_AT' },
  { re: /(?:my|i have a) (?:dog|cat|pet)(?: named| called)? ([^.!?,]{2,30})/gi,        predicate: 'HAS_PET' },
  { re: /i was born in ([^.!?,]{2,40})/gi,                                             predicate: 'BORN_IN' },
  { re: /i (?:studied|went to school) at ([^.!?,]{2,50})/gi,                           predicate: 'STUDIED_AT' },
  { re: /i(?:'m| am) allergic to ([^.!?,]{2,40})/gi,                                   predicate: 'ALLERGIC_TO' },
  { re: /my (?:sister|brother|mom|dad|mother|father|wife|husband) (?:is |named )?([^.!?,]{2,30})/gi, predicate: 'HAS_FAMILY_MEMBER' },
];

export function heuristicExtractEdges(
  message: string,
  subject: 'user' | 'character' = 'user',
): Array<{ subject: string; predicate: Predicate; object: string; confidence: number; source: 'heuristic' }> {
  const edges: Array<{ subject: string; predicate: Predicate; object: string; confidence: number; source: 'heuristic' }> = [];

  for (const { re, predicate } of EDGE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(message)) !== null) {
      // Same rationale as user-fact-graph.ts's heuristicExtract: sanitize at
      // capture time, before this ever reaches storage or gets re-injected
      // into a future system prompt.
      const rawValue = (m[1] ?? '').trim();
      const value = sanitize(rawValue, 80);
      if (value.length < 2 || value.length > 60) continue;
      edges.push({ subject, predicate, object: value, confidence: 0.7, source: 'heuristic' });
    }
  }

  return edges;
}

// ── AI extraction (async, fire-and-forget, periodic) ────────────────────────

async function aiExtractEdges(
  userMessage:    string,
  assistantReply: string,
): Promise<Array<{ subject: string; predicate: string; object: string; confidence: number; source: 'ai' }>> {
  const parsed = await generateStructured<unknown[]>({
    caller: 'knowledge-graph',
    maxTokens: 300,
    system: `Extract factual (subject)-[PREDICATE]->(object) triplets about the USER from this conversation snippet.
Only extract concrete, unambiguous facts — not vague sentiment. Predicate must be UPPER_SNAKE_CASE (e.g. LIVES_IN, WORKS_AS, HAS_PET, DREAMS_OF, STRUGGLES_WITH, IN_RELATIONSHIP_WITH).
Return ONLY a valid JSON array. Each item: { "predicate": string, "object": concise string, "confidence": 0.7-0.95 }.
Return [] if nothing concrete to extract. No markdown, no explanations.`,
    user: `User said: "${sanitize(userMessage, 300)}"\nAI replied: "${assistantReply.slice(0, 200)}"`,
  });

  if (!parsed || !Array.isArray(parsed)) return [];

  return parsed
    .filter((e: unknown) => e && typeof e === 'object' && 'predicate' in (e as object) && 'object' in (e as object))
    .map((raw: unknown) => {
      const e = raw as Record<string, unknown>;
      return {
        subject:    'user',
        predicate:  String(e.predicate ?? '').toUpperCase().replace(/[^A-Z_]/g, '_').slice(0, 40),
        // Sanitize the extraction model's own output before persistence —
        // same rationale as user-fact-graph.ts's aiExtract fix.
        object:     sanitize(String(e.object ?? ''), 80),
        confidence: Math.min(0.95, Math.max(0, Number(e.confidence) || 0.75)),
        source:     'ai' as const,
      };
    })
    .filter(e => e.predicate.length >= 3 && e.object.length >= 2);
}

// ── Storage: write with versioning ──────────────────────────────────────────

async function upsertEdge(
  userId:      string,
  characterId: string,
  edge: { subject: string; predicate: string; object: string; confidence: number; source: 'heuristic' | 'ai' | 'user_confirmed' },
  eventTime?: string,
): Promise<void> {
  // Find the current live edge for this (subject, predicate), if any.
  const { data: existing } = await supabaseAdmin
    .from('knowledge_graph_edges')
    .select('id, object')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .eq('subject', edge.subject)
    .eq('predicate', edge.predicate)
    .is('valid_to', null)
    .maybeSingle();

  // Same fact restated — nothing to version, just skip the write.
  if (existing && existing.object.toLowerCase() === edge.object.toLowerCase()) return;

  const { data: inserted } = await supabaseAdmin
    .from('knowledge_graph_edges')
    .insert({
      user_id:      userId,
      character_id: characterId,
      subject:      edge.subject,
      predicate:    edge.predicate,
      object:       edge.object,
      confidence:   edge.confidence,
      source:       edge.source,
      event_time:   eventTime ?? new Date().toISOString(),
    })
    .select('id')
    .single();

  // Supersede the prior edge rather than deleting it — preserves history
  // for getEdgeHistory() / any future "what did you used to believe" UI.
  if (existing && inserted) {
    await supabaseAdmin
      .from('knowledge_graph_edges')
      .update({ valid_to: new Date().toISOString(), superseded_by: (inserted as { id: string }).id })
      .eq('id', existing.id);
  }
}

// ── Main: extract and persist ───────────────────────────────────────────────

export async function extractAndStoreEdges(
  userId:         string,
  characterId:    string,
  userMessage:    string,
  assistantReply: string,
  sessionCount:   number,
): Promise<void> {
  try {
    const heuristicEdges = heuristicExtractEdges(userMessage, 'user');

    // AI pass every 5th message — matches user-fact-graph.ts's cadence so
    // the two extractors' API-call cost stays proportional.
    const aiEdges = sessionCount % 5 === 0
      ? await aiExtractEdges(userMessage, assistantReply)
      : [];

    const allEdges = [...heuristicEdges, ...aiEdges];
    if (!allEdges.length) return;

    await Promise.all(allEdges.map(e => upsertEdge(userId, characterId, e)));
    await redis.del(graphKey(userId, characterId));

    logger.info('knowledge-graph:extracted', {
      userId, count: allEdges.length, aiCount: aiEdges.length,
    });
  } catch (err) {
    logger.warn('knowledge-graph:extract-error', { userId, error: String(err) });
  }
}

// ── Read: deterministic recall ───────────────────────────────────────────────

/** All currently-live edges (valid_to IS NULL) — "what do we believe now". */
export async function getLiveGraph(userId: string, characterId: string): Promise<KnowledgeEdge[]> {
  try {
    const cached = await redis.get<KnowledgeEdge[]>(graphKey(userId, characterId));
    // DEFENSIVE (same rationale as user-fact-graph.ts's getFactGraph): don't
    // trust an unverified cache shape, fall through to Supabase instead.
    if (Array.isArray(cached)) return cached;
  } catch (err) {
    logger.warn('[knowledge-graph] Redis cache get failed', { error: String(err) });
  }

  const { data, error } = await supabaseAdmin
    .from('knowledge_graph_edges')
    .select('*')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .is('valid_to', null)
    .order('confidence', { ascending: false })
    .limit(40);

  if (error) {
    logger.warn('knowledge-graph:fetch-error', { userId, error: error.message });
    return [];
  }

  const edges = data as unknown as KnowledgeEdge[];
  redis.set(graphKey(userId, characterId), edges, { ex: GRAPH_CACHE_TTL }).catch(bg('knowledgeGraph.cacheWrite'));
  return edges;
}

/** Deterministic point-lookup — "what is the live object for (subject, predicate)". */
export async function getEdge(
  userId: string, characterId: string, predicate: string, subject: 'user' | 'character' = 'user',
): Promise<string | null> {
  const graph = await getLiveGraph(userId, characterId);
  return graph.find(e => e.subject === subject && e.predicate === predicate)?.object ?? null;
}

/** Full version history for one (subject, predicate) — includes superseded edges. */
export async function getEdgeHistory(
  userId: string, characterId: string, predicate: string, subject: 'user' | 'character' = 'user',
): Promise<KnowledgeEdge[]> {
  const { data, error } = await supabaseAdmin
    .from('knowledge_graph_edges')
    .select('*')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .eq('subject', subject)
    .eq('predicate', predicate)
    .order('ingestion_time', { ascending: false });

  if (error) {
    logger.warn('knowledge-graph:history-error', { userId, error: error.message });
    return [];
  }
  return data as unknown as KnowledgeEdge[];
}

// ── Format for prompt injection ─────────────────────────────────────────────
// Deliberately terse and declarative — this is meant to sit alongside
// formatFactGraphForPrompt()'s softer prose, giving the model unambiguous
// ground truth it can't hallucinate around.

export function formatGraphForPrompt(edges: KnowledgeEdge[]): string {
  const userEdges = edges.filter(e => e.subject === 'user');
  if (!userEdges.length) return '';

  const lines = ['Known facts (verified, do not contradict these):'];
  for (const e of userEdges.slice(0, 20)) {
    lines.push(`  ${e.predicate.replace(/_/g, ' ').toLowerCase()}: ${e.object}`);
  }
  return lines.join('\n');
}
