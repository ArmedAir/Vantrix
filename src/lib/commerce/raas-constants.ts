/**
 * RaaS (Relationship-as-a-Service) tier constants — client-safe.
 *
 * raas.ts holds the authoritative tier logic (RETENTION_POLICY) but
 * imports supabaseAdmin, so it can't be pulled into a client bundle —
 * same client/server split lib/dating/constants.ts already established
 * for dating tiers (see that file's own header comment for the original
 * chunk-crash this pattern avoids). This file mirrors RETENTION_POLICY's
 * three tiers as plain user-facing copy for the upgrade UI. Keep it in
 * sync with raas.ts's RETENTION_POLICY if the tiers themselves change.
 */

export type RelationshipTier = 'spark' | 'bond' | 'soulbound';

export const RELATIONSHIP_TIER_ORDER: RelationshipTier[] = ['spark', 'bond', 'soulbound'];

export interface RelationshipTierCopy {
  label: string;
  blurb: string;
  perks: string[];
}

export const RELATIONSHIP_TIER_COPY: Record<RelationshipTier, RelationshipTierCopy> = {
  spark: {
    label: 'Spark',
    blurb: 'Recent memory only — the last week or so.',
    perks: ['Remembers roughly the last 7 days of conversation'],
  },
  bond: {
    label: 'Bond',
    blurb: 'Full memory. Nothing fades.',
    perks: [
      'Remembers everything, with no time limit',
      "Recalls how you're connected — people, places, running threads",
      "Surfaces what matters most, not just what's recent",
    ],
  },
  soulbound: {
    label: 'Soulbound',
    blurb: 'Everything in Bond, plus eligible for a specialized personality pack.',
    perks: [
      'Everything in Bond',
      "Eligible for this character's specialized personality pack, when the creator has released one",
    ],
  },
};

/** Tiers strictly above `tier`, in upgrade order — what the upgrade UI should offer. */
export function tiersAbove(tier: RelationshipTier): Array<'bond' | 'soulbound'> {
  const idx = RELATIONSHIP_TIER_ORDER.indexOf(tier);
  return RELATIONSHIP_TIER_ORDER.slice(idx + 1) as Array<'bond' | 'soulbound'>;
}
