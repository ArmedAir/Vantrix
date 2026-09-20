/**
 * Groq brain governor tests — rate-limit accounting, priority classes, model
 * spill-over, 429 cooldown, per-task caps, kill switch, and fail-closed
 * behaviour. Redis, env, logger and the provider router are all faked; nothing
 * here touches the network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const h = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const hashes = new Map<string, Record<string, number>>();
  const state = { redisBroken: false };
  const num = (k: string) => Number(store.get(k) ?? 0);
  const api = {
    get: async (k: string) => { if (state.redisBroken) throw new Error('down'); return store.has(k) ? store.get(k) : null; },
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => {
      if (state.redisBroken) throw new Error('down');
      if (o?.nx && store.has(k)) return null;
      store.set(k, v); return 'OK';
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
      if (state.redisBroken) throw new Error('down');
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
  return { store, hashes, state, api, env, route };
});

vi.mock('@/lib/redis', () => ({ redis: h.api, parseRedisJson: (v: unknown) => v }));
vi.mock('@/env', () => ({ env: h.env }));
vi.mock('@/lib/logger', () => ({ logger: { warn() {}, info() {}, error() {} } }));
vi.mock('../lib/ai/provider-router', () => ({ routeCompletion: (...a: unknown[]) => h.route.fn(...a) }));

const schema = z.object({ ok: z.boolean() });
const reply = (body: unknown) => ({ reply: typeof body === 'string' ? body : JSON.stringify(body), totalTokens: 100, promptTokens: 60, completionTokens: 40 });

async function load() { return await import('../lib/ai/groq-brain'); }
const call = async (o: Partial<Parameters<Awaited<ReturnType<typeof load>>['brainJSON']>[0]> = {}) =>
  (await load()).brainJSON({ task: 't', system: 'sys JSON', user: 'usr', schema, priority: 'interactive', ...o } as never);

beforeEach(() => {
  h.store.clear(); h.hashes.clear(); h.state.redisBroken = false;
  for (const k of Object.keys(h.env)) delete h.env[k];
  Object.assign(h.env, { GROQ_BRAIN_ENABLED: 'true', GROQ_PLAN: 'free', GROQ_BRAIN_MODEL_FAST: 'fast-m', GROQ_BRAIN_MODEL_SMART: 'smart-m' });
  process.env.GROQ_API_KEY = 'gsk_test';
  h.route.fn = vi.fn().mockImplementation(async () => reply({ ok: true }));
});

describe('groq-brain — gating', () => {
  it('skips with no-key when GROQ_API_KEY is unset, without calling the router', async () => {
    delete process.env.GROQ_API_KEY;
    expect(await call()).toEqual({ ok: false, reason: 'no-key' });
    expect(h.route.fn.mock.calls.length).toBe(0);
  });
  it('skips with disabled when GROQ_BRAIN_ENABLED=false', async () => {
    h.env.GROQ_BRAIN_ENABLED = 'false';
    expect(await call()).toEqual({ ok: false, reason: 'disabled' });
  });
  it('honours the admin kill switch', async () => {
    (await load()).setBrainPaused; // ensure module loads
    await (await load()).setBrainPaused(true);
    expect(await call()).toEqual({ ok: false, reason: 'paused' });
    await (await load()).setBrainPaused(false);
    expect((await call()).ok).toBe(true);
  });
  it('fails closed when Redis is unreachable', async () => {
    h.state.redisBroken = true;
    const r = await call();
    expect(r.ok).toBe(false);
    expect(h.route.fn.mock.calls.length).toBe(0);
  });
});

describe('groq-brain — calls', () => {
  it('pins the groq provider, requests JSON mode, and prefers the fast model', async () => {
    const r = await call();
    expect(r.ok).toBe(true);
    const arg = h.route.fn.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.providerOverride).toBe('groq');
    expect(arg.jsonMode).toBe(true);
    expect(arg.modelOverride).toBe('fast-m');
  });
  it('prefers the smart model for size=smart', async () => {
    await call({ size: 'smart' });
    expect((h.route.fn.mock.calls[0][0] as Record<string, unknown>).modelOverride).toBe('smart-m');
  });
  it('reports parse and schema failures with typed reasons', async () => {
    h.route.fn = vi.fn().mockImplementation(async () => reply('not json at all'));
    expect(await call()).toEqual({ ok: false, reason: 'parse' });
    h.route.fn = vi.fn().mockImplementation(async () => reply({ nope: 1 }));
    expect(await call()).toEqual({ ok: false, reason: 'schema' });
  });
  it('strips a markdown fence before parsing', async () => {
    h.route.fn = vi.fn().mockImplementation(async () => reply('```json\n{"ok":true}\n```'));
    expect((await call()).ok).toBe(true);
  });
  it('maps a generic provider error to reason=provider', async () => {
    h.route.fn = vi.fn().mockImplementation(async () => { throw new Error('groq 500: boom'); });
    expect(await call()).toEqual({ ok: false, reason: 'provider' });
  });
});

describe('groq-brain — governor', () => {
  it('spills over to the second model when the first hits its RPM, then refuses', async () => {
    h.env.GROQ_RPM_LIMIT = '2'; h.env.GROQ_RPD_LIMIT = '1000'; h.env.GROQ_TPM_LIMIT = '100000';
    const models: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await call();
      if (r.ok) models.push(r.model);
    }
    expect(models).toEqual(['fast-m', 'fast-m', 'smart-m', 'smart-m']);
    expect(await call()).toEqual({ ok: false, reason: 'budget' });
  });
  it('caps background work at 60% of the envelope so interactive calls keep headroom', async () => {
    h.env.GROQ_RPM_LIMIT = '10'; h.env.GROQ_RPD_LIMIT = '1000'; h.env.GROQ_TPM_LIMIT = '100000';
    let ok = 0;
    for (let i = 0; i < 20; i++) if ((await call({ priority: 'background' })).ok) ok++;
    expect(ok).toBe(12);                 // 6 per model × 2 models
    expect((await call({ priority: 'interactive' })).ok).toBe(true);
  });
  it('refuses on token-per-minute pressure', async () => {
    h.env.GROQ_RPM_LIMIT = '100'; h.env.GROQ_RPD_LIMIT = '1000'; h.env.GROQ_TPM_LIMIT = '50';
    expect(await call({ system: 'x'.repeat(2000) })).toEqual({ ok: false, reason: 'budget' });
  });
  it('enforces the per-task daily cap and does not leak slots on refusal', async () => {
    expect((await call({ dailyCap: 2 })).ok).toBe(true);
    expect((await call({ dailyCap: 2 })).ok).toBe(true);
    expect(await call({ dailyCap: 2 })).toEqual({ ok: false, reason: 'budget' });
    const key = [...h.store.keys()].find(k => k.startsWith('groq:task:t:'))!;
    expect(h.store.get(key)).toBe(2);
  });
  it('a 429 puts that model on cooldown and the call spills to the other model', async () => {
    let n = 0;
    h.route.fn = vi.fn().mockImplementation(async () => {
      if (n++ === 0) throw new Error('groq 429: rate limit reached');
      return reply({ ok: true });
    });
    const r = await call();
    expect(r.ok && r.model).toBe('smart-m');
    expect(h.store.has('groq:cooldown:fast-m')).toBe(true);
  });
  it('reports cooldown when every model is rate limited', async () => {
    h.route.fn = vi.fn().mockImplementation(async () => { throw new Error('groq 429'); });
    expect(await call()).toEqual({ ok: false, reason: 'cooldown' });
  });
});
