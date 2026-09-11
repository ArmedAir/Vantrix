/**
 * SEC-05 — Async Comment Moderation Tests
 *
 * /api/feed/posts/[id]/comments used to run the full pre-publish
 * moderateCharacter() gate (sync blocklist + a blocking AI call) before
 * ever inserting a comment. When the AI call failed on every attempt, that
 * gate fails closed — correct for character creation, but for feed
 * comments it meant a single AI-layer outage rejected every comment
 * platform-wide with "Content review is temporarily unavailable."
 *
 * See 20260909_async_comment_moderation.sql for the full rationale. This
 * file covers the two functions that replaced that call site's use of
 * moderateCharacter():
 *
 *   - moderateCommentSync(): layer 1 only (instant keyword blocklist) —
 *     must still hard-block the same categories moderateCharacter() does,
 *     unchanged, with no AI dependency.
 *   - runAsyncCommentReview(): layer 2, run after publish — must never
 *     throw, and must resolve to exactly one of three outcomes depending
 *     on the AI verdict: approved, rejected (+ an audit hold), or —
 *     critically, this is the behavior change — queued for manual review
 *     while staying VISIBLE when the AI layer itself is unavailable,
 *     rather than being pulled as if it had failed review.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCircuitBreaker } from '@/lib/circuit-breaker';

const fromMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { moderateCommentSync, runAsyncCommentReview, sweepStalePendingComments } from '@/lib/moderation';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fromMock.mockReset();
  // Same rationale as SEC-04: aiModerationCheck() shares the 'ai:openrouter'
  // breaker across tests in this process; reset it so an earlier test's
  // deliberate failures don't leak into a later one's verdict.
  getCircuitBreaker('ai:openrouter').reset();
});

/** Records every update()/insert() call made against a given table so
 *  assertions can check exactly what was written, keyed by table name. */
function mockSupabase() {
  const calls: { table: string; op: 'update' | 'insert'; payload: unknown }[] = [];
  fromMock.mockImplementation((table: string) => ({
    update: (payload: unknown) => {
      calls.push({ table, op: 'update', payload });
      return { eq: async () => ({ error: null }) };
    },
    insert: async (payload: unknown) => {
      calls.push({ table, op: 'insert', payload });
      return { error: null };
    },
    // moderateCharacter/aiModerationCheck's loadPromptConfig() reads
    // moderation_prompt_config on every call via this chain — unrelated
    // to what these tests assert on, so it's stubbed to "no extra config"
    // rather than tracked in `calls`.
    select: () => ({
      limit: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }),
  }));
  return calls;
}

// routeCompletion() reads the response via a streaming reader rather than
// res.json() — see readResponseWithLimit() in provider-router.ts — so the
// mock must supply a real ReadableStream body. Same shape SEC-04 uses.
function mockAiVerdict(json: string) {
  const bodyJson = JSON.stringify({ choices: [{ message: { content: json } }] });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok:   true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(bodyJson));
        controller.close();
      },
    }),
  }));
}

describe('SEC-05 — moderateCommentSync (layer 1, unchanged, no AI dependency)', () => {
  it('blocks the same hard categories moderateCharacter does', () => {
    const result = moderateCommentSync('this involves a minor');
    expect(result.allowed).toBe(false);
    expect(result.category).toBe('minors');
  });

  it('allows ordinary content through with no network call', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = moderateCommentSync("Don't go off");
    expect(result.allowed).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('SEC-05 — runAsyncCommentReview (layer 2, post-publish, never blocks)', () => {
  it('marks the comment approved when the AI verdict is allowed', async () => {
    mockAiVerdict('{"allowed": true}');
    const calls = mockSupabase();

    await runAsyncCommentReview({ commentId: 'c1', postId: 'p1', userId: 'u1', content: 'Hello dear' });

    const update = calls.find(c => c.table === 'character_post_comments' && c.op === 'update');
    expect(update?.payload).toMatchObject({ moderation_status: 'approved' });
    expect(calls.some(c => c.table === 'moderation_holds')).toBe(false);
  });

  it('rejects the comment and logs an audit hold when the AI verdict is disallowed', async () => {
    mockAiVerdict('{"allowed": false, "category": "hate", "reason": "hate speech"}');
    const calls = mockSupabase();

    await runAsyncCommentReview({ commentId: 'c2', postId: 'p1', userId: 'u1', content: 'bad content' });

    const update = calls.find(c => c.table === 'character_post_comments' && c.op === 'update');
    expect(update?.payload).toMatchObject({ moderation_status: 'rejected' });

    const hold = calls.find(c => c.table === 'moderation_holds');
    expect(hold?.payload).toMatchObject({ comment_id: 'c2', status: 'rejected' });
  });

  it('queues for manual review WITHOUT rejecting when the AI layer is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const calls = mockSupabase();

    await runAsyncCommentReview({ commentId: 'c3', postId: 'p1', userId: 'u1', content: 'Do you have anything to tell me' });

    // The old behavior this replaces would have rejected the comment
    // outright. The whole point of this change is that an availability
    // failure is not a verdict: no update to character_post_comments at
    // all (it stays 'pending', its insert-time default), just a hold
    // queued for a human.
    expect(calls.some(c => c.table === 'character_post_comments')).toBe(false);

    const hold = calls.find(c => c.table === 'moderation_holds');
    expect(hold?.payload).toMatchObject({ comment_id: 'c3', surface: 'feed_comment' });
    expect((hold?.payload as Record<string, unknown>)?.status).toBeUndefined(); // defaults to 'pending' in the DB
  });

  it('never throws, even if Supabase itself errors', async () => {
    mockAiVerdict('{"allowed": true}');
    fromMock.mockImplementation(() => ({
      update: () => ({ eq: async () => ({ error: { message: 'db down' } }) }),
      insert: async () => ({ error: { message: 'db down' } }),
      select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }));

    await expect(
      runAsyncCommentReview({ commentId: 'c4', postId: 'p1', userId: 'u1', content: 'fine' }),
    ).resolves.toBeUndefined();
  });

  it('retries a transient write failure and succeeds on the second attempt (RETRY-HARDENING FIX)', async () => {
    mockAiVerdict('{"allowed": true}');
    let updateAttempts = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'character_post_comments') {
        return {
          update: () => ({
            eq: async () => {
              updateAttempts += 1;
              // Fail once (simulating a transient blip), succeed on retry.
              return updateAttempts === 1 ? { error: { message: 'transient' } } : { error: null };
            },
          }),
        };
      }
      return {
        insert: async () => ({ error: null }),
        select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      };
    });

    await runAsyncCommentReview({ commentId: 'c5', postId: 'p1', userId: 'u1', content: 'fine' });

    expect(updateAttempts).toBe(2);
  });
});

describe('SEC-05 — sweepStalePendingComments (lost after()-task backstop)', () => {
  it('re-reviews every stale-pending comment it finds and reports counts', async () => {
    mockAiVerdict('{"allowed": true}');
    const staleRows = [
      { id: 'c10', post_id: 'p1', author_user_id: 'u1', content: 'hi there' },
      { id: 'c11', post_id: 'p2', author_user_id: 'u2', content: 'nice post' },
    ];
    fromMock.mockImplementation((table: string) => {
      if (table === 'character_post_comments') {
        return {
          select: () => ({
            eq: () => ({
              lt: () => ({
                limit: async () => ({ data: staleRows, error: null }),
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      return {
        insert: async () => ({ error: null }),
        select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      };
    });

    const result = await sweepStalePendingComments();
    expect(result).toEqual({ scanned: 2, reviewed: 2 });
  });

  it('returns zero counts and never throws when the scan query itself fails', async () => {
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ lt: () => ({ limit: async () => ({ data: null, error: { message: 'db down' } }) }) }),
      }),
    }));

    await expect(sweepStalePendingComments()).resolves.toEqual({ scanned: 0, reviewed: 0 });
  });
});
