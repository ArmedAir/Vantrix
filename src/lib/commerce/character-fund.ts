/**
 * Creator Fund — Character Value Score program
 * ─────────────────────────────────────────────────────────────────────────
 * The pooled-royalty counterpart to lib/commerce/raas.ts's per-purchase
 * marketplace. Where raas.ts pays a creator when one specific buyer
 * purchases a bond/soulbound tier, this module pays out of a small, fixed
 * slice of platform subscription revenue, split across every
 * monetization-eligible character by a Character Value Score:
 *
 *   Creator Earnings = Eligible Revenue × Character Usage Share × Quality/Retention Multiplier
 *
 * IMPORTANT MATH NOTE — normalization, not naive multiplication:
 * If every character's "usage share" already summed to 100% of the pool,
 * multiplying each one by an independent quality multiplier would make
 * total payouts no longer sum to the pool (over- or under-distributing
 * real money depending on the mix of multipliers that period). Instead:
 *
 *   1. rawUsageScore(character)   — engagement-weighted volume signal
 *      (returning users weighted far above one-off chatters — see
 *      computeRawUsageScore()). This is the module's direct answer to
 *      "don't simply count messages."
 *   2. qualityMultiplier(character) — a BOUNDED (0.5x–2.0x), purely
 *      ratio-based signal (retention rate, progression rate, minus a
 *      report-rate penalty) that is scale-independent — a character with
 *      5 users and a character with 50,000 can each hit the same
 *      multiplier on the strength of their retention alone.
 *   3. weightedScore = rawUsageScore × qualityMultiplier
 *   4. usage_share(character) = weightedScore / Σ weightedScore (ALL
 *      eligible characters with qualifying activity this period)
 *   5. grossTokens(character) = pool × usage_share(character)
 *
 * Step 4's normalization is what actually is "Character Usage Share" in
 * the persisted ledger — it guarantees Σ grossTokens == pool (mod
 * rounding) every period, while still being driven by the raw-usage ×
 * quality product from steps 1-3. See the worked Bianca/Maya example in
 * this module's tests (character-fund.test.ts, if present) or the
 * program's design doc for why this reliably favors low-volume,
 * high-retention characters the way the product wants.
 *
 * Self-dealing: every signal is computed with the character's own
 * creator_id excluded at the SQL layer (see
 * compute_character_engagement_signals() in
 * 20270115_creator_fund_character_value_score.sql) — a creator chatting
 * with their own character contributes NOTHING to their own payout. This
 * module additionally runs a handful of cheap fraud heuristics
 * (detectFlags()) that hold a period's payout for human review without
 * ever blocking the character itself.
 *
 * Call sites:
 *   - api/cron/character-fund-distribution: computeCharacterValueScores()
 *   - api/creator/characters/[id]/monetization: upgradeCharacterMonetization()
 *   - api/creator/dashboard: getCreatorDashboard()
 *   - api/admin/creator-fund-flags: reviewed via the generic ReviewQueue,
 *     same as abuse_signals — no dedicated function needed here.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger }        from '@/lib/logger';
import type { Database } from '@/types/supabase';
import { BASE_MONTHLY_PRICE } from '@/lib/tiers/config';
import { TOKEN_PACKS } from '@/lib/economy/token-packs';

// ── Config ───────────────────────────────────────────────────────────────

export interface CreatorFundConfig {
  eligibleRevenuePct: number;      // % of period subscription revenue that becomes the pool
  creatorSharePct: number;         // of each character's cut, % to the creator
  platformSharePct: number;        // of each character's cut, % retained by the platform
  monetizationUpgradeFeeTokens: number;
  minActiveUsers: number;          // characters under this are excluded from the period entirely
}

const CONFIG_DEFAULTS: CreatorFundConfig = {
  eligibleRevenuePct: 4,
  creatorSharePct: 70,
  platformSharePct: 30,
  monetizationUpgradeFeeTokens: 250,
  minActiveUsers: 5,
};

async function readConfigNumber(key: string, fallback: number): Promise<number> {
  const { data } = await supabaseAdmin.from('app_config').select('value').eq('key', key).maybeSingle();
  const parsed = data?.value ? Number(data.value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getCreatorFundConfig(): Promise<CreatorFundConfig> {
  const [eligibleRevenuePct, creatorSharePct, platformSharePct, monetizationUpgradeFeeTokens, minActiveUsers] =
    await Promise.all([
      readConfigNumber('creator_fund_eligible_revenue_pct', CONFIG_DEFAULTS.eligibleRevenuePct),
      readConfigNumber('creator_fund_creator_share_pct', CONFIG_DEFAULTS.creatorSharePct),
      readConfigNumber('creator_fund_platform_share_pct', CONFIG_DEFAULTS.platformSharePct),
      readConfigNumber('character_monetization_upgrade_fee', CONFIG_DEFAULTS.monetizationUpgradeFeeTokens),
      readConfigNumber('creator_fund_min_active_users', CONFIG_DEFAULTS.minActiveUsers),
    ]);
  return { eligibleRevenuePct, creatorSharePct, platformSharePct, monetizationUpgradeFeeTokens, minActiveUsers };
}

// ── Pool sizing: a documented approximation, not a real payments ledger ────
//
// No per-payment revenue log exists in this codebase yet (subscriptions
// rows track current state, not a transaction history) — so the pool is
// approximated as active-subscriber-count × BASE_MONTHLY_PRICE. Swap this
// for a real MRR/payments feed the moment one exists; everything
// downstream (computeCharacterValueScores) only depends on the returned
// USD-cents number, not on how it was derived.
export async function getPeriodEligibleRevenueUsdCents(periodEnd: Date): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .gt('expires_at', periodEnd.toISOString());

  if (error) {
    logger.warn('character-fund:getPeriodEligibleRevenueUsdCents failed', { error: error.message });
    return 0;
  }
  return Math.round((count ?? 0) * BASE_MONTHLY_PRICE * 100);
}

// Blended platform token-purchase rate, from the "Popular Pack" (1200
// tokens for $9.99 — see TOKEN_PACKS). Used only to convert the fund's
// USD pool into Vantrix Coin so payouts land in the SAME ledger currency
// as the existing per-purchase raas_creator_earnings, rather than introducing
// a second payout currency/reconciliation path.
function usdCentsToTokens(usdCents: number): number {
  const popular = TOKEN_PACKS.find(p => p.id === 'tokens_1200') ?? TOKEN_PACKS[0];
  // NOTE: popular.tokens already includes bonusTokens (see TokenPack's own
  // doc comment in token-packs.ts) — do not add bonusTokens again here.
  const tokensPerPack = popular.tokens;
  const centsPerPack = popular.priceUsd * 100;
  return Math.round(usdCents * (tokensPerPack / centsPerPack));
}

// ── Signals (from the SQL aggregation) ──────────────────────────────────────

export interface CharacterEngagementSignals {
  character_id: string;
  creator_id: string;
  active_users: number;
  returning_users: number;
  meaningful_conversations: number;
  total_session_minutes: number;
  saves: number;
  follows: number;
  users_with_progression: number;
  milestones_reached: number;
  reports: number;
  creator_own_messages: number;
  total_messages_incl_creator: number;
}

async function loadEngagementSignals(periodStart: Date, periodEnd: Date): Promise<CharacterEngagementSignals[]> {
  const { data, error } = await supabaseAdmin.rpc('compute_character_engagement_signals', {
    p_period_start: periodStart.toISOString(),
    p_period_end: periodEnd.toISOString(),
  });
  if (error) {
    logger.error('character-fund:loadEngagementSignals failed', { error: error.message });
    return [];
  }
  return (data ?? []) as CharacterEngagementSignals[];
}

// ── Scoring ──────────────────────────────────────────────────────────────

// Weights chosen so returning users dominate the raw-usage score by
// design — a character that converts one-off discovery into repeat
// visits scores far higher than one with equivalent total messages but
// no return visits, matching the Bianca/Maya worked example in the
// module header.
const USAGE_WEIGHTS = {
  returningUser: 5,
  meaningfulConversation: 3,
  save: 2,
  follow: 2,
  userWithProgression: 4,
  milestone: 1,
  sessionMinute: 0.02,
};

export function computeRawUsageScore(s: CharacterEngagementSignals): number {
  return (
    s.returning_users * USAGE_WEIGHTS.returningUser +
    s.meaningful_conversations * USAGE_WEIGHTS.meaningfulConversation +
    s.saves * USAGE_WEIGHTS.save +
    s.follows * USAGE_WEIGHTS.follow +
    s.users_with_progression * USAGE_WEIGHTS.userWithProgression +
    s.milestones_reached * USAGE_WEIGHTS.milestone +
    s.total_session_minutes * USAGE_WEIGHTS.sessionMinute
  );
}

const QUALITY_MULTIPLIER_MIN = 0.5;
const QUALITY_MULTIPLIER_MAX = 2.0;
const QUALITY_BASELINE = 0.7; // below the 1.0x neutral point — quality must be earned, not assumed

export function computeQualityMultiplier(s: CharacterEngagementSignals): { multiplier: number; retentionRate: number } {
  if (s.active_users === 0) return { multiplier: QUALITY_MULTIPLIER_MIN, retentionRate: 0 };

  const retentionRate = s.returning_users / s.active_users;
  const progressionRate = s.users_with_progression / s.active_users;
  const reportRate = s.reports / s.active_users;

  const raw = QUALITY_BASELINE + retentionRate * 1.0 + progressionRate * 0.3 - reportRate * 1.5;
  const multiplier = Math.min(QUALITY_MULTIPLIER_MAX, Math.max(QUALITY_MULTIPLIER_MIN, raw));
  return { multiplier, retentionRate };
}

interface ScoredCharacter {
  signals: CharacterEngagementSignals;
  rawUsageScore: number;
  qualityMultiplier: number;
  retentionRate: number;
  weightedScore: number;
}

// ── Self-dealing / farming heuristics ───────────────────────────────────────

export interface CreatorFundFlagDraft {
  flag_type: string;
  score: number;
  reasons: string[];
  evidence: Database['public']['Tables']['creator_fund_flags']['Row']['evidence'];
}

const MIN_SAMPLE_FOR_SELF_USAGE_CHECK = 20;

async function detectFlags(s: CharacterEngagementSignals, periodStart: Date, periodEnd: Date): Promise<CreatorFundFlagDraft[]> {
  const flags: CreatorFundFlagDraft[] = [];

  // 1. Creator's own account made up a large share of raw traffic before
  // exclusion. That activity already earns nothing (excluded at the SQL
  // layer), but a high ratio is itself worth a human look — commonly
  // precedes an attempt to route earnings back to the creator via
  // secondary accounts.
  if (s.total_messages_incl_creator >= MIN_SAMPLE_FOR_SELF_USAGE_CHECK) {
    const selfShare = s.creator_own_messages / s.total_messages_incl_creator;
    if (selfShare > 0.4) {
      flags.push({
        flag_type: 'creator_self_usage_dominant',
        score: Math.min(100, Math.round(selfShare * 100)),
        reasons: [`Creator's own account sent ${Math.round(selfShare * 100)}% of this character's raw messages this period`],
        evidence: { creator_own_messages: s.creator_own_messages, total_messages_incl_creator: s.total_messages_incl_creator, self_share: selfShare },
      });
    }
  }

  // 2. Nearly all engagement comes from a very small, tight group of
  // returning users — could be entirely legitimate (a small devoted fan
  // base), but combined with low absolute numbers it's the same shape as
  // a handful of alt accounts propping up retention metrics.
  if (s.active_users > 0 && s.active_users < 8 && s.returning_users > 0) {
    const concentration = s.returning_users / s.active_users;
    if (concentration > 0.8) {
      flags.push({
        flag_type: 'low_diversity_returning_users',
        score: Math.min(100, Math.round(concentration * 70)),
        reasons: [`${s.returning_users} of only ${s.active_users} active users account for this character's entire retention signal`],
        evidence: { active_users: s.active_users, returning_users: s.returning_users, concentration },
      });
    }
  }

  // 3. Reports spiked this period — ties fund eligibility to safety
  // signals, not just engagement volume.
  if (s.reports >= 3) {
    flags.push({
      flag_type: 'moderation_reports_spike',
      score: Math.min(100, s.reports * 15),
      reasons: [`${s.reports} user reports against this character this period`],
      evidence: { reports: s.reports },
    });
  }

  // 4. Targeted second-pass query — only for characters with a small
  // enough returning-user count that a real query is cheap and the
  // signal is meaningful (a large creator with thousands of organic
  // returning users doesn't need this check).
  if (s.returning_users > 0 && s.returning_users <= 10) {
    const { data: clusterCount, error } = await supabaseAdmin.rpc('count_new_account_cluster', {
      p_character_id: s.character_id,
      p_period_start: periodStart.toISOString(),
      p_period_end: periodEnd.toISOString(),
    });
    if (!error && typeof clusterCount === 'number' && clusterCount >= 3) {
      flags.push({
        flag_type: 'coordinated_new_accounts',
        score: Math.min(100, clusterCount * 20),
        reasons: [`${clusterCount} returning users created their accounts within days of this character's launch`],
        evidence: { new_account_cluster_count: clusterCount },
      });
    }
  }

  return flags;
}

// ── Main orchestration ──────────────────────────────────────────────────────

export interface ComputeRunSummary {
  periodStart: string;
  periodEnd: string;
  eligibleCharacters: number;
  scoredCharacters: number;
  excludedLowActivity: number;
  poolTokens: number;
  flaggedCharacters: number;
}

/**
 * Computes and persists one period's Character Value Score payouts.
 * Idempotent — a second call for the same period_start is a safe no-op
 * per character (UNIQUE(character_id, period_start), ON CONFLICT DO
 * NOTHING), so a retried cron run never double-pays.
 */
export async function computeCharacterValueScores(periodStart: Date, periodEnd: Date): Promise<ComputeRunSummary> {
  const config = await getCreatorFundConfig();
  const allSignals = await loadEngagementSignals(periodStart, periodEnd);

  const qualifying = allSignals.filter(s => s.active_users >= config.minActiveUsers);
  const excludedLowActivity = allSignals.length - qualifying.length;

  const poolUsdCents = Math.round(
    (await getPeriodEligibleRevenueUsdCents(periodEnd)) * (config.eligibleRevenuePct / 100),
  );
  const poolTokens = usdCentsToTokens(poolUsdCents);

  const scored: ScoredCharacter[] = qualifying.map(signals => {
    const rawUsageScore = computeRawUsageScore(signals);
    const { multiplier, retentionRate } = computeQualityMultiplier(signals);
    return {
      signals,
      rawUsageScore,
      qualityMultiplier: multiplier,
      retentionRate,
      weightedScore: rawUsageScore * multiplier,
    };
  }).filter(sc => sc.weightedScore > 0); // no qualifying engagement at all — nothing to distribute or record

  const totalWeighted = scored.reduce((sum, sc) => sum + sc.weightedScore, 0);

  let flaggedCharacters = 0;
  const scoreRows: Database['public']['Tables']['character_value_scores']['Insert'][] = [];
  const flagRows: Database['public']['Tables']['creator_fund_flags']['Insert'][] = [];

  for (const sc of scored) {
    const usageShare = totalWeighted > 0 ? sc.weightedScore / totalWeighted : 0;
    const grossTokens = Math.round(poolTokens * usageShare);
    const creatorEarnedTokens = Math.round(grossTokens * (config.creatorSharePct / 100));
    const platformTokens = grossTokens - creatorEarnedTokens;

    const flags = await detectFlags(sc.signals, periodStart, periodEnd);
    const heldForReview = flags.length > 0;
    if (heldForReview) flaggedCharacters += 1;

    const rowId = crypto.randomUUID();
    scoreRows.push({
      id: rowId,
      character_id: sc.signals.character_id,
      creator_id: sc.signals.creator_id,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      active_users: sc.signals.active_users,
      returning_users: sc.signals.returning_users,
      meaningful_conversations: sc.signals.meaningful_conversations,
      total_session_minutes: sc.signals.total_session_minutes,
      saves: sc.signals.saves,
      follows: sc.signals.follows,
      users_with_progression: sc.signals.users_with_progression,
      milestones_reached: sc.signals.milestones_reached,
      reports: sc.signals.reports,
      raw_usage_score: sc.rawUsageScore,
      quality_multiplier: sc.qualityMultiplier,
      weighted_score: sc.weightedScore,
      usage_share: usageShare,
      retention_rate: sc.retentionRate,
      eligible_pool_tokens: poolTokens,
      gross_tokens: grossTokens,
      platform_share_pct: config.platformSharePct,
      creator_share_pct: config.creatorSharePct,
      creator_earned_tokens: creatorEarnedTokens,
      platform_tokens: platformTokens,
      payout_status: heldForReview ? 'pending_review' : 'pending',
      held_for_review: heldForReview,
    });

    for (const flag of flags) {
      flagRows.push({
        character_id: sc.signals.character_id,
        creator_id: sc.signals.creator_id,
        character_value_score_id: rowId,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        flag_type: flag.flag_type,
        score: flag.score,
        reasons: flag.reasons,
        evidence: flag.evidence,
      });
    }
  }

  if (scoreRows.length > 0) {
    const { error } = await supabaseAdmin
      .from('character_value_scores')
      .upsert(scoreRows, { onConflict: 'character_id,period_start', ignoreDuplicates: true });
    if (error) logger.error('character-fund:insert character_value_scores failed', { error: error.message });
  }
  if (flagRows.length > 0) {
    const { error } = await supabaseAdmin.from('creator_fund_flags').insert(flagRows);
    if (error) logger.error('character-fund:insert creator_fund_flags failed', { error: error.message });
  }

  logger.info('character-fund:computeCharacterValueScores complete', {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    eligibleCharacters: allSignals.length,
    scoredCharacters: scored.length,
    excludedLowActivity,
    poolTokens,
    flaggedCharacters,
  });

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    eligibleCharacters: allSignals.length,
    scoredCharacters: scored.length,
    excludedLowActivity,
    poolTokens,
    flaggedCharacters,
  };
}

// ── Monetization upgrade ────────────────────────────────────────────────────

export interface MonetizationUpgradeResult {
  success: boolean;
  error?: 'character_not_found' | 'not_owner' | 'already_monetized' | 'monetization_suspended' |
    'character_not_public' | 'character_not_approved' | 'insufficient_tokens' | 'upgrade_failed';
}

export async function upgradeCharacterMonetization(userId: string, characterId: string): Promise<MonetizationUpgradeResult> {
  const config = await getCreatorFundConfig();

  const { error } = await supabaseAdmin.rpc('upgrade_character_monetization', {
    p_user_id: userId,
    p_character_id: characterId,
    p_fee_tokens: config.monetizationUpgradeFeeTokens,
  });

  if (error) {
    const msg = error.message ?? '';
    const knownErrors: MonetizationUpgradeResult['error'][] = [
      'character_not_found', 'not_owner', 'already_monetized', 'monetization_suspended',
      'character_not_public', 'character_not_approved',
    ];
    const matched = knownErrors.find(e => e && msg.includes(e));
    if (matched) return { success: false, error: matched };
    if (msg.includes('insufficient_tokens')) return { success: false, error: 'insufficient_tokens' };
    logger.warn('character-fund:upgradeCharacterMonetization failed', { userId, characterId, error: msg });
    return { success: false, error: 'upgrade_failed' };
  }

  logger.info('character-fund:monetization upgraded', { userId, characterId });
  return { success: true };
}

// ── Dashboard read model ────────────────────────────────────────────────────

export interface CharacterFundDashboardEntry {
  characterId: string;
  characterName: string;
  imageUrl: string | null;
  monetizationStatus: string;
  interactionsThisPeriod: number; // active_users + returning_users, for the "38,421 interactions" style card
  activeUsers: number;
  returningUsers: number;
  retentionPct: number;
  avgRelationshipDurationDays: number | null;
  trendPct: number | null; // vs. prior period's creator_earned_tokens
  fundEarnedTokens: number;
  marketplaceEarnedTokens: number;
  totalEarnedTokens: number;
  heldForReview: boolean;
}

export interface CreatorDashboard {
  periodStart: string | null;
  periodEnd: string | null;
  totalEarnedTokens: number;
  totalEarnedTrendPct: number | null;
  pendingTokens: number;
  paidTokens: number;
  characters: CharacterFundDashboardEntry[];
  /** Explanatory copy for empty states, e.g. no period computed yet. */
  note?: string;
}

/**
 * Combines both earnings streams (character_value_scores from THIS module
 * + raas_creator_earnings from lib/commerce/raas.ts's marketplace) into one
 * dashboard shape. Kept as a composition at read time rather than a
 * shared table so each stream's own write path stays simple and
 * independently auditable.
 */
export async function getCreatorDashboard(creatorId: string, periodStart: Date, periodEnd: Date, priorPeriodStart: Date): Promise<CreatorDashboard> {
  const [{ data: fundRows }, { data: priorFundRows }, { data: marketplaceRows }, { data: characters }] = await Promise.all([
    supabaseAdmin
      .from('character_value_scores')
      .select('*')
      .eq('creator_id', creatorId)
      .eq('period_start', periodStart.toISOString()),
    supabaseAdmin
      .from('character_value_scores')
      .select('character_id, creator_earned_tokens')
      .eq('creator_id', creatorId)
      .eq('period_start', priorPeriodStart.toISOString()),
    supabaseAdmin
      .from('raas_creator_earnings')
      .select('character_id, creator_earned_tokens, payout_status')
      .eq('creator_id', creatorId),
    supabaseAdmin
      .from('characters')
      .select('id, name, image_url, monetization_status')
      .eq('creator_id', creatorId),
  ]);

  const characterMeta = new Map((characters ?? []).map(c => [c.id as string, c]));
  const priorByCharacter = new Map((priorFundRows ?? []).map(r => [r.character_id as string, r.creator_earned_tokens as number]));

  const marketplaceByCharacter = new Map<string, { earned: number; pending: number; paid: number }>();
  for (const row of marketplaceRows ?? []) {
    const entry = marketplaceByCharacter.get(row.character_id) ?? { earned: 0, pending: 0, paid: 0 };
    entry.earned += row.creator_earned_tokens;
    if (row.payout_status === 'pending' || row.payout_status === 'pending_review') entry.pending += row.creator_earned_tokens;
    if (row.payout_status === 'paid') entry.paid += row.creator_earned_tokens;
    marketplaceByCharacter.set(row.character_id, entry);
  }

  const entries: CharacterFundDashboardEntry[] = (fundRows ?? []).map(row => {
    const meta = characterMeta.get(row.character_id);
    const marketplace = marketplaceByCharacter.get(row.character_id) ?? { earned: 0, pending: 0, paid: 0 };
    const priorEarned = priorByCharacter.get(row.character_id) ?? 0;
    const trendPct = priorEarned > 0 ? ((row.creator_earned_tokens - priorEarned) / priorEarned) * 100 : null;
    const avgRelationshipDurationDays = row.active_users > 0
      ? Math.round((row.total_session_minutes / row.active_users / 60) * 100) / 100
      : null;

    return {
      characterId: row.character_id,
      characterName: meta?.name ?? 'Unknown character',
      imageUrl: meta?.image_url ?? null,
      monetizationStatus: meta?.monetization_status ?? 'none',
      interactionsThisPeriod: row.active_users + row.returning_users,
      activeUsers: row.active_users,
      returningUsers: row.returning_users,
      retentionPct: Math.round(row.retention_rate * 1000) / 10,
      avgRelationshipDurationDays,
      trendPct,
      fundEarnedTokens: row.creator_earned_tokens,
      marketplaceEarnedTokens: marketplace.earned,
      totalEarnedTokens: row.creator_earned_tokens + marketplace.earned,
      heldForReview: row.held_for_review,
    };
  });

  const totalEarnedTokens = entries.reduce((s, e) => s + e.totalEarnedTokens, 0);
  const priorTotal = [...priorByCharacter.values()].reduce((s, v) => s + v, 0);
  const totalEarnedTrendPct = priorTotal > 0 ? ((totalEarnedTokens - priorTotal) / priorTotal) * 100 : null;

  const pendingTokens = entries.reduce((s, e) => {
    const row = (fundRows ?? []).find(r => r.character_id === e.characterId);
    const fundPending = row && (row.payout_status === 'pending' || row.payout_status === 'pending_review') ? row.creator_earned_tokens : 0;
    return s + fundPending + (marketplaceByCharacter.get(e.characterId)?.pending ?? 0);
  }, 0);
  const paidTokens = entries.reduce((s, e) => {
    const row = (fundRows ?? []).find(r => r.character_id === e.characterId);
    const fundPaid = row?.payout_status === 'paid' ? row.creator_earned_tokens : 0;
    return s + fundPaid + (marketplaceByCharacter.get(e.characterId)?.paid ?? 0);
  }, 0);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalEarnedTokens,
    totalEarnedTrendPct,
    pendingTokens,
    paidTokens,
    characters: entries.sort((a, b) => b.totalEarnedTokens - a.totalEarnedTokens),
  };
}
