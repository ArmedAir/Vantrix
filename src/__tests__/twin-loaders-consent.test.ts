/**
 * Consent gating for twin-derived personalization. Supabase is stubbed with a
 * tiny chainable fake so these run without a database; what is under test is
 * WHEN the loaders are allowed to return anything at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown> | null;
const state: { optin: Row; twin: Row; optinError: boolean; twinError: boolean; queried: string[] } = {
  optin: null, twin: null, optinError: false, twinError: false, queried: [],
};

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from(table: string) {
      state.queried.push(table);
      const result = () => {
        if (table === 'character_twin_optins') {
          return state.optinError ? { data: null, error: { message: 'boom' } } : { data: state.optin, error: null };
        }
        return state.twinError ? { data: null, error: { message: 'boom' } } : { data: state.twin, error: null };
      };
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => result();
      return chain;
    },
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { loadTwinMirrorBlock, loadTwinMatchSignals } from '../lib/digital-twin/twin-loaders';

const TRAINED = {
  enabled: true,
  auto_traits: { tone: 'warm and teasing', humorStyle: 'dry', values: ['honesty'], formality: 'casual', coreBeliefs: ['SECRET'] },
  auto_style_summary: 'short lowercase texts',
  use_for_matching: true,
};

beforeEach(() => {
  state.optin = null; state.twin = null; state.optinError = false; state.twinError = false; state.queried = [];
});

describe('loadTwinMirrorBlock — per-character consent', () => {
  it('returns null and never touches the twin when there is no opt-in for this character', async () => {
    state.twin = TRAINED;
    expect(await loadTwinMirrorBlock('u1', 'c1')).toBeNull();
    expect(state.queried).toEqual(['character_twin_optins']);
  });

  it('returns null when opted in but the twin is disabled', async () => {
    state.optin = { character_id: 'c1' };
    state.twin = { ...TRAINED, enabled: false };
    expect(await loadTwinMirrorBlock('u1', 'c1')).toBeNull();
  });

  it('returns null when opted in but the twin row is gone (e.g. wiped)', async () => {
    state.optin = { character_id: 'c1' };
    state.twin = null;
    expect(await loadTwinMirrorBlock('u1', 'c1')).toBeNull();
  });

  it('returns the block when opted in with an enabled, trained twin — without intimate fields', async () => {
    state.optin = { character_id: 'c1' };
    state.twin = TRAINED;
    const block = await loadTwinMirrorBlock('u1', 'c1');
    expect(block).toContain('tone: warm and teasing');
    expect(block).toContain('humor: dry');
    expect(block).not.toContain('SECRET');
    expect(block).not.toContain('honesty'); // values are for ranking only, never sent into chat
  });

  it('fails open (null) on any DB error', async () => {
    state.optinError = true;
    expect(await loadTwinMirrorBlock('u1', 'c1')).toBeNull();
    state.optinError = false; state.optin = { character_id: 'c1' }; state.twinError = true;
    expect(await loadTwinMirrorBlock('u1', 'c1')).toBeNull();
  });

  it('returns null for missing ids without querying', async () => {
    expect(await loadTwinMirrorBlock('', 'c1')).toBeNull();
    expect(await loadTwinMirrorBlock('u1', '')).toBeNull();
    expect(state.queried).toEqual([]);
  });
});

describe('loadTwinMatchSignals — account-level consent', () => {
  it('returns signals only when enabled AND use_for_matching', async () => {
    state.twin = TRAINED;
    const sig = await loadTwinMatchSignals('u1');
    expect(sig?.humor).toEqual(['dry']);
    expect(sig?.values).toEqual(['honesty']);
    expect(JSON.stringify(sig)).not.toContain('SECRET');
  });

  it('null when the user has not opted in to matching', async () => {
    state.twin = { ...TRAINED, use_for_matching: false };
    expect(await loadTwinMatchSignals('u1')).toBeNull();
  });

  it('null when the twin is disabled, missing, or the query fails', async () => {
    state.twin = { ...TRAINED, enabled: false };
    expect(await loadTwinMatchSignals('u1')).toBeNull();
    state.twin = null;
    expect(await loadTwinMatchSignals('u1')).toBeNull();
    state.twin = TRAINED; state.twinError = true;
    expect(await loadTwinMatchSignals('u1')).toBeNull();
  });

  it('null for a logged-out caller without querying', async () => {
    expect(await loadTwinMatchSignals('')).toBeNull();
    expect(state.queried).toEqual([]);
  });
});
