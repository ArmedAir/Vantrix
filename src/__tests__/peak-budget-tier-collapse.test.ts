// src/__tests__/peak-budget-tier-collapse.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cost/quality audit (2026-09-05): when the old 6-tier model (spark/basic/
// premium/elite/enterprise) collapsed to two tiers (free/premium), 'elite'
// (the old top paid tier, and the one premium now represents) had a real
// PEAK budget — but 'premium' was left at the zero-default. model-router.ts's
// PEAK_ELIGIBLE_PLANS marks premium eligible, classifyComplexity can flag a
// message as PEAK-worthy, but checkPeakBudget() returned `tier_ineligible`
// before even checking Redis — every deep/emotional-moment premium message
// was silently downgraded to POWER, with premium subscribers never getting
// what their tier promises.
//
// This pins the fix: premium must have a real, non-zero budget on both
// guards, and free-tier (never PEAK-eligible) must stay at zero.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({
  redis: {
    eval: vi.fn().mockResolvedValue([1, 1, 0]),
    get:  vi.fn(),
  },
}));

describe('peak-budget.ts — premium tier-collapse fix', () => {
  it('gives premium a non-zero request budget and dollar ceiling', async () => {
    const { PEAK_MONTHLY_REQUEST_BUDGET, PEAK_MONTHLY_DOLLAR_CEILING_USD } = await import('../lib/peak-budget');
    expect(PEAK_MONTHLY_REQUEST_BUDGET.premium).toBeGreaterThan(0);
    expect(PEAK_MONTHLY_DOLLAR_CEILING_USD.premium).toBeGreaterThan(0);
  });

  it('keeps free tier at zero — PEAK is not free-tier eligible', async () => {
    const { PEAK_MONTHLY_REQUEST_BUDGET, PEAK_MONTHLY_DOLLAR_CEILING_USD } = await import('../lib/peak-budget');
    expect(PEAK_MONTHLY_REQUEST_BUDGET.free).toBe(0);
    expect(PEAK_MONTHLY_DOLLAR_CEILING_USD.free).toBe(0);
  });

  it('checkPeakBudget no longer returns tier_ineligible for premium', async () => {
    const { checkPeakBudget } = await import('../lib/peak-budget');
    const result = await checkPeakBudget('user-1', 'premium');
    expect(result.reason).not.toBe('tier_ineligible');
  });

  it('checkPeakBudget still returns tier_ineligible for free', async () => {
    const { checkPeakBudget } = await import('../lib/peak-budget');
    const result = await checkPeakBudget('user-1', 'free');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('tier_ineligible');
  });

  it("premium's dollar ceiling stays safely under 30% of its worst-case (annual, $3.99/mo) revenue", async () => {
    const { PEAK_MONTHLY_DOLLAR_CEILING_USD } = await import('../lib/peak-budget');
    expect(PEAK_MONTHLY_DOLLAR_CEILING_USD.premium).toBeLessThanOrEqual(3.99 * 0.30);
  });
});
