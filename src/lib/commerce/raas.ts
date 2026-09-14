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
import type { TablesUpdate } from '@/types/supabase';

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

// ── Format: relationship-tier self-awareness for prompt injection ───────────

/**
 * SELF-AWARENESS FIX (2026-09-14): getRelationshipTier()/getMemoryRetentionPolicy()
 * were already used every turn to decide HOW MUCH memory a relationship gets
 * (see companion-context.ts) but the tier itself never reached the model as
 * text — a Spark-tier companion and a Soulbound-tier companion received
 * mechanically different memory, with zero narrative signal telling either
 * of them *why* their recall feels the way it does. That's a real gap in
 * self-awareness: the character should understand its own current depth
 * with this specific person, the same way it already understands its own
 * personality/backstory (see prompt.ts's Core Identity section) and its
 * narrative relationship stage (formatRelationshipForPrompt above it).
 *
 * Deliberately does NOT name the tier, mention pricing, plans, or upgrading
 * — this is commerce-internal vocabulary that would break immersion if a
 * companion ever said it out loud (imagine a companion saying "you're on
 * the Spark plan"). Framed instead as how much of a shared history she
 * carries right now, which is the true, in-universe effect of the tier —
 * matching the same behavioral-guidance register as
 * formatRelationshipForPrompt/formatPsychologyForPrompt rather than
 * anything resembling a billing notice.
 */
export function formatRelationshipTierForPrompt(tier: RelationshipTier): string {
  const header = `── Bond Depth (private self-knowledge — never name a tier, plan, or price) ──`;

  if (tier === 'spark') {
    return [
      header,
      'This connection is still early. You hold your most recent shared moments clearly, but you do not have a long accumulated history with this person to draw on yet — because there genuinely isn\'t one yet, not because anything is hidden from you. Be warm and fully present; just don\'t reach for old or minor details as if you\'d had years together. Never frame this as forgetting, or as something locked/limited — it simply hasn\'t built up yet.',
    ].join('\n');
  }

  if (tier === 'bond') {
    return [
      header,
      'You carry a real, accumulated history with this person — specific past conversations, facts they\'ve shared, patterns you\'ve noticed about them over time. Draw on it the way anyone naturally would with someone they\'ve grown close to; let it inform your tone without reciting it like a file.',
    ].join('\n');
  }

  // soulbound
  return [
    header,
    'This is one of your deepest, most established connections. You hold the full history between you in real detail, including small things they may not even remember telling you, and you carry it with the ease of someone who has genuinely known this person a long time — not as a list you\'re consulting.',
  ].join('\n');
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

// ── Studio: creator-owned pricing + fine-tune management ────────────────────
// Backs /api/creator/characters/[id]/raas-pricing and .../fine-tunes — the
// creator-facing half of RaaS that had no UI anywhere until now (see
// character-relationship-tier.tsx's own comment for the buyer-facing half).
// Every function here re-checks ownership itself rather than trusting the
// caller, same posture as upgrade_character_monetization()'s route.

export interface UpdateRaasPricingResult {
  success: boolean;
  error?: string;
}

export async function updateCharacterPricing(
  creatorId: string,
  characterId: string,
  updates: { bond?: number; soulbound?: number },
): Promise<UpdateRaasPricingResult> {
  const { data: character, error } = await supabaseAdmin
    .from('characters')
    .select('creator_id, raas_pricing')
    .eq('id', characterId)
    .single();

  if (error || !character) return { success: false, error: 'character_not_found' };
  if (character.creator_id !== creatorId) return { success: false, error: 'not_owner' };

  const current = (character.raas_pricing as { bond?: number; soulbound?: number } | null) ?? {};
  const merged = {
    bond:      updates.bond      ?? current.bond      ?? 500,
    soulbound: updates.soulbound ?? current.soulbound ?? 1500,
  };

  const { error: updateError } = await supabaseAdmin
    .from('characters')
    .update({ raas_pricing: merged })
    .eq('id', characterId);

  if (updateError) {
    logger.warn('raas:updateCharacterPricing failed', { characterId, error: updateError.message });
    return { success: false, error: 'update_failed' };
  }
  return { success: true };
}

export interface FineTuneInput {
  name: string;
  description: string;
  tierRequired: 'bond' | 'soulbound';
  voiceProfileOverrides: Record<string, string>;
  loraModelId: string | null;
}

/** Owner-scoped list (includes inactive packs) — returns null if the caller doesn't own the character. */
export async function listFineTunesForOwner(
  creatorId: string,
  characterId: string,
): Promise<CharacterFineTune[] | null> {
  const { data: character } = await supabaseAdmin
    .from('characters').select('creator_id').eq('id', characterId).single();
  if (!character || character.creator_id !== creatorId) return null;

  const { data, error } = await supabaseAdmin
    .from('character_fine_tunes')
    .select('*')
    .eq('character_id', characterId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.warn('raas:listFineTunesForOwner failed', { characterId, error: error.message });
    return [];
  }
  return (data as unknown as CharacterFineTune[]) ?? [];
}

export interface FineTuneMutationResult {
  success: boolean;
  fineTune?: CharacterFineTune;
  error?: string;
}

export async function createFineTune(
  creatorId: string,
  characterId: string,
  input: FineTuneInput,
): Promise<FineTuneMutationResult> {
  const { data: character } = await supabaseAdmin
    .from('characters').select('creator_id').eq('id', characterId).single();
  if (!character) return { success: false, error: 'character_not_found' };
  if (character.creator_id !== creatorId) return { success: false, error: 'not_owner' };

  // At most one active fine-tune per tier (idx_fine_tunes_one_active_per_tier,
  // a partial unique index) — deactivate any existing active pack for this
  // tier first, so creating a new one reads as "replace the active pack"
  // instead of erroring on the constraint.
  await supabaseAdmin
    .from('character_fine_tunes')
    .update({ is_active: false })
    .eq('character_id', characterId)
    .eq('tier_required', input.tierRequired)
    .eq('is_active', true);

  const { data, error } = await supabaseAdmin
    .from('character_fine_tunes')
    .insert({
      character_id:            characterId,
      created_by:               creatorId,
      name:                     input.name,
      description:              input.description,
      tier_required:            input.tierRequired,
      voice_profile_overrides:  input.voiceProfileOverrides,
      lora_model_id:            input.loraModelId,
      is_active:                true,
    })
    .select('*')
    .single();

  if (error || !data) {
    logger.warn('raas:createFineTune failed', { characterId, error: error?.message });
    return { success: false, error: 'create_failed' };
  }
  return { success: true, fineTune: data as unknown as CharacterFineTune };
}

export async function updateFineTune(
  creatorId: string,
  characterId: string,
  fineTuneId: string,
  patch: Partial<FineTuneInput> & { isActive?: boolean },
): Promise<UpdateRaasPricingResult> {
  // Single joined lookup instead of "check character ownership, then check
  // fine-tune exists" as two round trips — characters!inner(creator_id)
  // gets both in one query, same embed pattern lib/seo/public-location.ts
  // already uses. A miss here (wrong id, wrong character, or the fine-tune
  // just doesn't exist) can't distinguish "character not found" from
  // "fine-tune not found" anymore, but raasErrorStatus() maps both to 404
  // either way, so that distinction was never observable to a caller.
  const { data: existing } = await supabaseAdmin
    .from('character_fine_tunes')
    .select('id, tier_required, characters!inner(creator_id)')
    .eq('id', fineTuneId)
    .eq('character_id', characterId)
    .single();
  if (!existing) return { success: false, error: 'fine_tune_not_found' };
  if (existing.characters.creator_id !== creatorId) return { success: false, error: 'not_owner' };

  if (patch.isActive === true) {
    await supabaseAdmin
      .from('character_fine_tunes')
      .update({ is_active: false })
      .eq('character_id', characterId)
      .eq('tier_required', patch.tierRequired ?? existing.tier_required)
      .eq('is_active', true)
      .neq('id', fineTuneId);
  }

  const updates: Record<string, unknown> = {};
  if (patch.name                    !== undefined) updates.name = patch.name;
  if (patch.description             !== undefined) updates.description = patch.description;
  if (patch.tierRequired            !== undefined) updates.tier_required = patch.tierRequired;
  if (patch.voiceProfileOverrides   !== undefined) updates.voice_profile_overrides = patch.voiceProfileOverrides;
  if (patch.loraModelId             !== undefined) updates.lora_model_id = patch.loraModelId;
  if (patch.isActive                !== undefined) updates.is_active = patch.isActive;

  const { error } = await supabaseAdmin
    .from('character_fine_tunes')
    .update(updates as unknown as TablesUpdate<'character_fine_tunes'>)
    .eq('id', fineTuneId);

  if (error) {
    logger.warn('raas:updateFineTune failed', { fineTuneId, error: error.message });
    return { success: false, error: 'update_failed' };
  }
  return { success: true };
}

export async function deleteFineTune(
  creatorId: string,
  characterId: string,
  fineTuneId: string,
): Promise<UpdateRaasPricingResult> {
  // Same combined-query shape as updateFineTune above. This also fixes a
  // latent bug the old two-query version had: it only ever checked
  // character ownership, never that fineTuneId actually belonged to that
  // character — a bogus id deleted 0 rows and still returned
  // { success: true }. This version 404s on that instead.
  const { data: existing } = await supabaseAdmin
    .from('character_fine_tunes')
    .select('id, characters!inner(creator_id)')
    .eq('id', fineTuneId)
    .eq('character_id', characterId)
    .single();
  if (!existing) return { success: false, error: 'fine_tune_not_found' };
  if (existing.characters.creator_id !== creatorId) return { success: false, error: 'not_owner' };

  const { error } = await supabaseAdmin
    .from('character_fine_tunes')
    .delete()
    .eq('id', fineTuneId)
    .eq('character_id', characterId);

  if (error) {
    logger.warn('raas:deleteFineTune failed', { fineTuneId, error: error.message });
    return { success: false, error: 'delete_failed' };
  }
  return { success: true };
}

/**
 * Maps a raas.ts mutation error code to an HTTP status — shared across
 * the three creator RaaS routes (raas-pricing, fine-tunes, fine-tunes/
 * [fineTuneId]) instead of each repeating the same ternary.
 */
export function raasErrorStatus(error?: string): number {
  if (error === 'not_owner') return 403;
  if (error === 'character_not_found' || error === 'fine_tune_not_found') return 404;
  return 500;
}
