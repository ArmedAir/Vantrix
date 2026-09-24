/**
 * Groq brain — TOKENS-PER-DAY governor.
 *
 * Groq's free plan caps the gpt-oss models at 1,000 requests/day but only
 * 200,000 tokens/day per model, so tokens — not requests — is the limit that
 * binds (a ~3K-token curator call exhausts 200K in ~65 calls). These tests pin:
 * - the daily token gate refuses while requests/day is nowhere near its cap,
 * - the reservation is reconciled to Groq's real usage in both directions,
 * - rejected / unprocessed calls are refunded (empty completions are NOT),
 * - a daily-limit 429 backs off far longer than a per-minute one,
 * - settle/refund use the SAME minute bucket the reservation used.
 * Same fakes as groq-brain-governor.test.ts; nothing touches the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

const h = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const ttl = new Map<string, number>();
  const hashes = new Map<string, Record<string, number>>();
  const state = { redisBroken: false, pipelineBroken: false };
  const num = (k: string) => Number(store.get(k) ?? 0);
  const api = {
    get: async (k: string) => { if (state.redisBroken) throw new Error('down'); return store.has(k) ? store.get(k) : null; },
    set: async (k: string, v: unknown, o?: { nx?: boolean; ex?: number }) => {
      if (state.redisBroken) throw new Error('down');
      if (o?.nx && store.has(k)) return null;
      store.set(k, v); if (o?.ex) ttl.set(k, o.ex); return 'OK';
    },
    del: async (k: string) => { store.delete(k); return 1; },
    incr: async (k: string) => { if (state.redisBroken) throw new Error('down'); store.set(k, num(k) + 1); return num(k); },
    decr: async (k: string) => { store.set(k, num(k) - 1); return num(k); },
    incrby: async (k: string, n: number) => { store.set(k, num(k) + n); return num(k); },
    decrby: async (k: string, n: number) => { store.set(k, num(k) - n); return num(k); },
    expire: async () => 1,
    hincrby: async (k: string, f: string, n: number) => {
      const m = hashes.get(k) ?? {}; m[f] = (m[f] ?? 0) + n; hashes.set(k, m); return m[f];
    },
    hgetall: async (k: string) => hashes.get(k) ?? null,
    pipeline: () => {
      if (state.redisBroken || state.pipelineBroken) throw new Error('down');
      const ops: (() => Promise<unknown>)[] = [];
      const p: Record<string, unknown> = {};
      for (const name of ['incr', 'decr', 'incrby', 'decrby', 'expire'] as const) {
        p[name] = (...args: unknown[]) => { ops.push(() => (api[name] as (...a: unknown[]) => Promise<unknown>)(...args)); return p; };
      }
      p.exec = async () => { const out: unknown[] = []; for (const op of ops) out.push(await op()); return out; };
      return p;
    },
  };
  const env: Record<string, unknown> = {};
  const route = { fn: null as unknown as ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>> };
  return { store, ttl, hashes, state, api, env, route };
});

vi.mock('@/lib/redis', () => ({ redis: h.api, parseRedisJson: (v: unknown) => v }));
vi.mock('@/env', () => ({ env: h.env }));
vi.mock('@/lib/logger', () => ({ logger: { warn() {}, info() {}, error() {} } }));
vi.mock('../lib/ai/provider-router', () => ({ routeCompletion: (...a: unknown[]) => h.route.fn(...a) }));

const schema = z.object({ ok: z.boolean() });
const reply = (body: unknown, totalTokens = 100) =>
  ({ reply: typeof body === 'string' ? body : JSON.stringify(body), totalTokens, promptTokens: 0, completionTokens: totalTokens });

async function load() { return await import('../lib/ai/groq-brain'); }
// est = ceil((system+user)/4) + ceil(maxTokens/2) = 102 + 200 = 302 tokens per call
const call = async (o: Record<string, unknown> = {}) =>
  (await load()).brainJSON({
    task: 't', system: 'j'.repeat(400) + ' JSON', user: 'usr', schema,
    priority: 'interactive', maxTokens: 400, ...o,
  } as never);

const keyOf = (prefix: string) => [...h.store.keys()].find(k => k.startsWith(prefix));
const val = (prefix: string) => { const k = keyOf(prefix); return k ? Number(h.store.get(k)) : 0; };

beforeEach(() => {
  h.store.clear(); h.ttl.clear(); h.hashes.clear(); h.state.redisBroken = false; h.state.pipelineBroken = false;
  for (const k of Object.keys(h.env)) delete h.env[k];
  Object.assign(h.env, {
    GROQ_BRAIN_ENABLED: 'true', GROQ_PLAN: 'free',
    GROQ_BRAIN_MODEL_FAST: 'fast-m', GROQ_BRAIN_MODEL_SMART: 'smart-m',
    GROQ_RPM_LIMIT: '1000', GROQ_RPD_LIMIT: '100000', GROQ_TPM_LIMIT: '10000000',
  });
  process.env.GROQ_API_KEY = 'gsk_test';
  h.route.fn = vi.fn().mockImplementation(async () => reply({ ok: true }, 400));
});

afterEach(() => { vi.useRealTimers(); });

describe('limits', () => {
  it('free plan defaults to 170K tokens/day (85% of Groq\'s 200K); developer is not enforced unless GROQ_TPD_LIMIT is set', async () => {
    const { getBrainLimits } = await load();
    expect(getBrainLimits().tpd).toBe(170_000);
    h.env.GROQ_PLAN = 'developer';
    expect(getBrainLimits().tpd).toBeNull();
    h.env.GROQ_TPD_LIMIT = '500000';
    expect(getBrainLimits().tpd).toBe(500_000);
  });
});

describe('daily token gate', () => {
  it('refuses on tokens/day while requests/day is nowhere near its limit, spilling to the other model first', async () => {
    h.env.GROQ_TPD_LIMIT = '1000'; // RPD limit is 100000 — irrelevant here
    const models: string[] = [];
    for (let i = 0; i < 4; i++) { const r = await call(); if (r.ok) models.push(r.model); }
    expect(models).toEqual(['fast-m', 'fast-m', 'smart-m', 'smart-m']); // 2 x 400 actual tokens fits, 3rd tips fast-m over 1000
    expect(await call()).toEqual({ ok: false, reason: 'budget' });
  });

  it('background work gets 60% of the daily token budget; interactive keeps the rest', async () => {
    h.env.GROQ_TPD_LIMIT = '1000'; // background ceiling = 600/model
    const bg: boolean[] = [];
    for (let i = 0; i < 3; i++) bg.push((await call({ priority: 'background' })).ok);
    expect(bg).toEqual([true, true, false]); // fast: 400, then 400+302 > 600 -> spill to smart, then smart also exhausted
    expect((await call({ priority: 'interactive' })).ok).toBe(true);
  });

  it('does not enforce tokens/day on a developer plan unless a limit is set', async () => {
    h.env.GROQ_PLAN = 'developer';
    h.env.GROQ_RPM_LIMIT = '100000'; h.env.GROQ_RPD_LIMIT = '100000'; h.env.GROQ_TPM_LIMIT = '100000000';
    h.route.fn = vi.fn().mockImplementation(async () => reply({ ok: true }, 100_000));
    let ok = 0;
    for (let i = 0; i < 10; i++) if ((await call()).ok) ok++;
    expect(ok).toBe(10);
  });

  it('fails closed when the governor itself cannot meter (pause check passes, pipeline is down)', async () => {
    h.state.pipelineBroken = true; // get() still works, so this is NOT the kill-switch path
    expect(await call()).toEqual({ ok: false, reason: 'budget' });
    expect(h.route.fn).not.toHaveBeenCalled();
  });

  it('fails closed when Redis is fully down (kill switch unreadable reads as paused)', async () => {
    h.state.redisBroken = true;
    expect(await call()).toEqual({ ok: false, reason: 'paused' });
    expect(h.route.fn).not.toHaveBeenCalled();
  });
});

describe('settling to real usage', () => {
  it('replaces a too-high estimate with what Groq billed (302 est -> 50 actual)', async () => {
    h.route.fn = vi.fn().mockImplementation(async () => reply({ ok: true }, 50));
    await call();
    expect(val('groq:tpd:fast-m:')).toBe(50);
    expect(val('groq:tpm:fast-m:')).toBe(50);
  });

  it('replaces a too-low estimate too (302 est -> 900 actual), so the daily gate cannot underestimate', async () => {
    h.route.fn = vi.fn().mockImplementation(async () => reply({ ok: true }, 900));
    await call();
    expect(val('groq:tpd:fast-m:')).toBe(900);
  });

  it('settles even when the reply is unparseable — those tokens were spent', async () => {
    h.route.fn = vi.fn().mockImplementation(async () => reply('not json at all', 777));
    expect(await call()).toEqual({ ok: false, reason: 'parse' });
    expect(val('groq:tpd:fast-m:')).toBe(777);
  });

  it('settles against the reservation\'s minute bucket even if the clock rolls over mid-call', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-21T12:00:30Z'));
    const reservedBucket = Math.floor(Date.now() / 60_000);
    h.route.fn = vi.fn().mockImplementation(async () => {
      vi.setSystemTime(new Date('2026-09-21T12:01:10Z')); // minute rolls while Groq is thinking
      return reply({ ok: true }, 900);
    });
    await call();
    expect(h.store.get(`groq:tpm:fast-m:${reservedBucket}`)).toBe(900);
    expect(h.store.has(`groq:tpm:fast-m:${reservedBucket + 1}`)).toBe(false);
  });
});

describe('refunds', () => {
  it('a 429 consumed no quota: reservation is refunded, and the call spills to the other model', async () => {
    let n = 0;
    h.route.fn = vi.fn().mockImplementation(async () => {
      if (n++ === 0) throw new Error('groq 429: rate limit reached');
      return reply({ ok: true }, 400);
    });
    const r = await call();
    expect(r.ok && r.model).toBe('smart-m');
    expect(val('groq:tpd:fast-m:')).toBe(0);
    expect(val('groq:rpd:fast-m:')).toBe(0);
    expect(val('groq:tpd:smart-m:')).toBe(400);
  });

  it('a 5xx / timeout is refunded', async () => {
    h.route.fn = vi.fn().mockImplementation(async () => { throw new Error('groq 500: upstream error'); });
    expect(await call()).toEqual({ ok: false, reason: 'provider' });
    expect(val('groq:tpd:fast-m:')).toBe(0);
    expect(val('groq:rpd:fast-m:')).toBe(0);
  });

  it('an EMPTY completion keeps its reservation (Groq billed those tokens)', async () => {
    h.route.fn = vi.fn().mockImplementation(async () => { throw new Error('groq: empty completion'); });
    expect(await call()).toEqual({ ok: false, reason: 'provider' });
    expect(val('groq:tpd:fast-m:')).toBe(302);
  });
});

describe('cooldown length', () => {
  const cooldownTtl = () => h.ttl.get('groq:cooldown:fast-m');

  it('a per-minute 429 backs off for 60s', async () => {
    h.route.fn = vi.fn().mockImplementation(async () => { throw new Error('groq 429: Rate limit reached for requests per minute'); });
    await call();
    expect(cooldownTtl()).toBe(60);
  });

  it('a DAILY-token 429 backs off for 10 minutes instead of re-probing every 60s all day', async () => {
    h.route.fn = vi.fn().mockImplementation(async () => { throw new Error('groq 429: Rate limit reached for tokens per day (TPD)'); });
    await call();
    expect(cooldownTtl()).toBe(600);
  });

  it('a DAILY-request 429 (RPD) also backs off for 10 minutes', async () => {
    h.route.fn = vi.fn().mockImplementation(async () => { throw new Error('groq 429: ... on requests per day (RPD)'); });
    await call();
    expect(cooldownTtl()).toBe(600);
  });
});

describe('status view', () => {
  it('reports tokens used today and the enforced daily ceiling', async () => {
    h.route.fn = vi.fn().mockImplementation(async () => reply({ ok: true }, 1234));
    await call();
    const st = await (await load()).getBrainStatus();
    expect(st.limits.tpd).toBe(170_000);
    expect(st.usage['fast-m']!.tpdToday).toBe(1234);
    expect(st.usage['smart-m']!.tpdToday).toBe(0);
  });
});
