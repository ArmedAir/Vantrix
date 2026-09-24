/**
 * Automation task: rank X cross-post candidates by likely appeal.
 *
 * Today x-social auto-select walks eligibility.ts's candidates in whatever
 * order the query returned them (newest-first) and queues the first N that
 * pass the cadence rules. This lets Groq pick WHICH of the eligible posts are
 * worth the day's limited slots — it only reorders; every eligibility,
 * cadence, daily-cap and admin-review rule in auto-select.ts still applies
 * afterwards, and nothing is ever added that eligibility.ts didn't return.
 *
 * Data sent: character name + public caption (≤140 chars) — eligibility.ts
 * already excludes NSFW / inactive / unmoderated characters, and these captions
 * are destined for a public timeline anyway.
 *
 * Any failure returns the input order unchanged.
 */

import { z } from 'zod';
import { brainJSON } from '@/lib/ai/groq-brain';
import type { EligiblePost } from '@/lib/social/eligibility';

const schema = z.object({
  ranking: z.array(z.object({ id: z.string(), score: z.number().min(0).max(10) })),
});

const MAX_TO_RANK = 40;

export async function rankXCandidates(candidates: EligiblePost[]): Promise<EligiblePost[]> {
  if (candidates.length < 3) return candidates;

  const head = candidates.slice(0, MAX_TO_RANK);
  const system = [
    'You are a social media editor for an AI companion app\'s public X (Twitter) account.',
    'Score each candidate post 0-10 for how likely it is to earn engagement and new signups from a cold audience: hooks, personality, curiosity, emotional pull, clarity out of context.',
    'Penalise posts that are generic, repetitive, or only make sense to existing users. Reward variety across characters.',
    'Respond with ONLY minified JSON, no prose, no code fences: {"ranking":[{"id":"<postId>","score":<0-10>}]}',
    'Include every id from the input exactly once.',
  ].join(' ');
  const user = JSON.stringify({
    posts: head.map(c => ({ id: c.postId, character: c.characterName, caption: c.caption.slice(0, 140) })),
  });

  const out = await brainJSON({
    task: 'automation.x-social-rank', system, user, schema,
    priority: 'background', size: 'fast', maxTokens: 1500, temperature: 0.2, dailyCap: 24,
  });
  if (!out.ok) return candidates;

  const score = new Map(out.data.ranking.map(r => [r.id, r.score]));
  // Stable: unscored items and ties keep their original relative order.
  const ranked = head
    .map((c, i) => ({ c, i, s: score.get(c.postId) ?? -1 }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(x => x.c);
  return [...ranked, ...candidates.slice(MAX_TO_RANK)];
}
