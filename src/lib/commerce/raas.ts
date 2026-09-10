/**
 * Relationship-as-a-Service (RaaS) — unification layer
 * ─────────────────────────────────────────────────────────────────────────
 * This module is the single place that ties together three previously
 * separate pieces of this codebase into one sellable, per-(user,character)
 * product:
 *
 *   MEMORY   — the hybrid memory stack (memory-graph.ts's bitemporal
 *              episodic log, knowledge-graph.ts's entity-relation triplets,
 *              priority-memory.ts, memory-tiers/) already exists but was
 *              applied uniformly to every relationship. getMemoryRetentionPolicy()
 *              is the one function that says how much of it a given
 *              relationship actually gets.
 *   FINE-TUNE — character_fine_tunes packages a creator-authored personality
 *              variant (text) and/or LoRA model (visual, reusing
 *              lora-pipeline.ts's existing model-id plumbing) for one
 *              character, unlocked at a tier.
 *   MARKETPLACE — characters.raas_pricing / creator_revenue_share_pct plus
 *              the raas_creator_earnings ledger let a creator earn from their
 *              own character's premium tiers, using the existing token
 *              economy (deduct_tokens / token_ledger) as the payment rail
 *              rather than a new one.
 *
 * The purchase itself is one atomic Postgres transaction — see
 * purchase_relationship_tier() in 20260910_raas_unification.sql — so this
 * module's purchaseRelationshipTier() below is a thin RPC wrapper, not
 * where the atomicity lives.
 *
 * Call sites:
 *   - companion-context.ts: getRelationshipTier() + getMemoryRetentionPolicy()
 *     gate which memory sources are actually included for this turn, and
 *     getActiveFineTune() supplies the personality overlay.
 *   - api/relationships/[characterId]/upgrade: purchaseRelationshipTier()
 *   - api/creator/earnings: getCreatorEarnings()
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger }        from '@/lib/logger';

export type RelationshipTier = 'spark' | 'bond' | 'soulbound';

export interface MemoryRetentionPolicy {
  tier: RelationshipTier;
  /** Deterministic entity-relation triplets — see knowledge-graph.ts. */
  includeKnowledgeGraph: boolean;
  /** Full bitemporal episodic log vs. a short recent-only window. */
  includeFullEpisodicLog: boolean;
  episodicWindowDays: number;   // used only when includeFullEpisodicLog is false
  episodicCap: number;          // max nodes returned regardless
  /** priority-memory.ts's curated "what actually matters" surface. */
  includePriorityMemories: boolean;
  /** Whether this relationship can carry an active fine-tune at all. */
  fineTuneEligible: boolean;
}

const RETENTION_POLICY: Record<RelationshipTier, Omit<MemoryRetentionPolicy, 'tier'>> = {
  spark: {
    includeKnowledgeGraph:   false,
    includeFullEpisodicLog:  false,
    episodicWindowDays:      7,
    episodicCap:             5,
    includePriorityMemories: false,
    fineTuneEligible:        false,
  },
  bond: {
    includeKnowledgeGraph:   true,
    includeFullEpisodicLog:  true,
    episodicWindowDays:      Infinity,
    episodicCap:             30,
    includePriorityMemories: true,
    fineTuneEligible:        false,
  },
  soulbound: {
    includeKnowledgeGraph:   true,
    includeFullEpisodicLog:  true,
    episodicWindowDays:      Infinity,
    episodicCap:             30,
    includePriorityMemories: true,
    fineTuneEligible:        true,
  },
};

export function getMemoryRetentionPolicy(tier: RelationshipTier): MemoryRetentionPolicy {
  return { tier, ...RETENTION_POLICY[tier] };
}

export interface CharacterFineTune {
  id:                      string;
  character_id:            string;
  name:                    string;
  description:             string;
  tier_required:           'bond' | 'soulbound';
  voice_profile_overrides: Record<string, unknown>;
  lora_model_id:           string | null;
}

// ── Read: current relationship tier ─────────────────────────────────────────

/** Defaults to 'spark' — every relationship starts here, no row required. */
export async function getRelationshipTier(userId: string, characterId: string): Promise<RelationshipTier> {
  try {
    const { data } = await supabaseAdmin
      .from('relationship_tiers')
      .select('tier, expires_at')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .maybeSingle();

    if (!data) return 'spark';
    // A tier can expire (subscription-style relationship tiers, not shipped
    // by this migration but the column exists for that future case) — an
    // expired row degrades to 'spark' rather than being deleted, preserving
    // purchase history.
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return 'spark';
    return data.tier as RelationshipTier;
  } catch (err) {
    logger.warn('raas:getRelationshipTier failed, defaulting to spark', { userId, characterId, error: String(err) });
    return 'spark';
  }
}

// ── Read: active fine-tune for a character at a given tier ─────────────────

export async function getActiveFineTune(
  characterId: string,
  tier: RelationshipTier,
): Promise<CharacterFineTune | null> {
  if (tier === 'spark') return null; // never eligible, skip the query

  try {
    // 'soulbound' relationships see the highest-tier active pack available;
    // 'bond' relationships only ever see a 'bond'-gated pack.
    const eligibleTiers = tier === 'soulbound' ? ['bond', 'soulbound'] : ['bond'];

    const { data } = await supabaseAdmin
      .from('character_fine_tunes')
      .select('*')
      .eq('character_id', characterId)
      .eq('is_active', true)
      .in('tier_required', eligibleTiers)
      .order('tier_required', { ascending: false }) // 'soulbound' sorts after 'bond' alphabetically — prefer the higher pack when both exist
      .limit(1)
      .maybeSingle();

    return (data as unknown as CharacterFineTune) ?? null;
  } catch (err) {
    logger.warn('raas:getActiveFineTune failed', { characterId, tier, error: String(err) });
    return null;
  }
}

// ── Format: fine-tune overlay for prompt injection ──────────────────────────

export function formatFineTuneForPrompt(fineTune: CharacterFineTune | null): string {
  if (!fineTune) return '';

  const overrideLines = Object.entries(fineTune.voice_profile_overrides)
    .map(([key, value]) => `  ${key.replace(/_/g, ' ')}: ${String(value)}`)
    .join('\n');

  return [
    `── Specialized Personality Pack: "${fineTune.name}" (active for this relationship) ──`,
    fineTune.description,
    overrideLines,
  ].filter(Boolean).join('\n');
}

// ── Pricing: what this character charges for each tier ─────────────────────

export interface RaasPricing {
  bond: number;
  soulbound: number;
  creatorRevenueSharePct: number;
  creatorId: string;
}

export async function getCharacterPricing(characterId: string): Promise<RaasPricing | null> {
  const { data, error } = await supabaseAdmin
    .from('characters')
    .select('raas_pricing, creator_revenue_share_pct, creator_id')
    .eq('id', characterId)
    .single();

  if (error || !data) {
    logger.warn('raas:getCharacterPricing failed', { characterId, error: error?.message });
    return null;
  }

  if (!data.creator_id) {
    // No creator on record (e.g. a platform/staff character) — RaaS purchase
    // requires a creator to pay out to, so this character isn't purchasable.
    logger.warn('raas:getCharacterPricing character has no creator_id', { characterId });
    return null;
  }

  const pricing = data.raas_pricing as { bond?: number; soulbound?: number } | null;
  return {
    bond:      pricing?.bond ?? 500,
    soulbound: pricing?.soulbound ?? 1500,
    creatorRevenueSharePct: data.creator_revenue_share_pct ?? 70,
    creatorId: data.creator_id,
  };
}

// ── Write: purchase (thin wrapper — atomicity lives in the RPC) ────────────

export interface PurchaseResult {
  success: boolean;
  tier?: RelationshipTier;
  error?: string;
}

export async function purchaseRelationshipTier(
  userId: string,
  characterId: string,
  tier: 'bond' | 'soulbound',
): Promise<PurchaseResult> {
  const pricing = await getCharacterPricing(characterId);
  if (!pricing) return { success: false, error: 'character_not_found' };

  // A creator cannot buy a paid tier on their own character — same
  // self-dealing guard as the existing gift-sending path would need.
  if (pricing.creatorId === userId) {
    return { success: false, error: 'cannot_purchase_own_character' };
  }

  const priceTokens = tier === 'bond' ? pricing.bond : pricing.soulbound;

  const { data, error } = await supabaseAdmin.rpc('purchase_relationship_tier', {
    p_user_id: userId,
    p_character_id: characterId,
    p_tier: tier,
    p_price_tokens: priceTokens,
    p_creator_id: pricing.creatorId,
    p_revenue_share_pct: pricing.creatorRevenueSharePct,
  });

  if (error) {
    if (error.message?.includes('insufficient_tokens')) {
      return { success: false, error: 'insufficient_tokens' };
    }
    logger.warn('raas:purchaseRelationshipTier failed', { userId, characterId, tier, error: error.message });
    return { success: false, error: 'purchase_failed' };
  }

  logger.info('raas:purchased', { userId, characterId, tier, priceTokens });
  return { success: true, tier: (data as { tier: RelationshipTier }).tier };
}

// ── Read: creator earnings ──────────────────────────────────────────────────

export interface CreatorEarningsSummary {
  totalEarnedTokens: number;
  pendingTokens: number;
  paidTokens: number;
  recentEntries: Array<{
    characterId: string;
    grossTokens: number;
    creatorEarnedTokens: number;
    payoutStatus: string;
    createdAt: string;
  }>;
}

export async function getCreatorEarnings(creatorId: string): Promise<CreatorEarningsSummary> {
  const { data, error } = await supabaseAdmin
    .from('raas_creator_earnings')
    .select('character_id, gross_tokens, creator_earned_tokens, payout_status, created_at')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data) {
    logger.warn('raas:getCreatorEarnings failed', { creatorId, error: error?.message });
    return { totalEarnedTokens: 0, pendingTokens: 0, paidTokens: 0, recentEntries: [] };
  }

  let totalEarnedTokens = 0, pendingTokens = 0, paidTokens = 0;
  for (const row of data) {
    totalEarnedTokens += row.creator_earned_tokens;
    if (row.payout_status === 'pending') pendingTokens += row.creator_earned_tokens;
    if (row.payout_status === 'paid') paidTokens += row.creator_earned_tokens;
  }

  return {
    totalEarnedTokens, pendingTokens, paidTokens,
    recentEntries: data.map(r => ({
      characterId: r.character_id,
      grossTokens: r.gross_tokens,
      creatorEarnedTokens: r.creator_earned_tokens,
      payoutStatus: r.payout_status,
      createdAt: r.created_at,
    })),
  };
}
