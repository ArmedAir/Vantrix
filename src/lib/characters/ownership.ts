// src/lib/characters/ownership.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for "who can do what" with a character. Builds on
// the existing `creator_id` / `is_public` / `moderation_status` columns on
// `characters` — no new columns required for ownership itself.
// ─────────────────────────────────────────────────────────────────────────────

import type { Database } from '@/types/supabase';

export type CharacterRow = Database['public']['Tables']['characters']['Row'];

export function isOwner(character: Pick<CharacterRow, 'creator_id'>, userId: string | null | undefined): boolean {
  return !!userId && character.creator_id === userId;
}

/** Can this user see the character at all (profile page, discover feed, chat)? */
export function canView(
  character: Pick<CharacterRow, 'creator_id' | 'is_public' | 'moderation_status'>,
  userId: string | null | undefined,
): boolean {
  if (isOwner(character, userId)) return true;
  // Publicly shared characters are visible to anyone once they've cleared moderation.
  return character.is_public === true && character.moderation_status === 'approved';
}

/** Can this user edit the character's fields (personality, appearance, etc.)? */
export function canEdit(character: Pick<CharacterRow, 'creator_id'>, userId: string | null | undefined): boolean {
  return isOwner(character, userId);
}

/** Can this user toggle public/private visibility? */
export function canToggleVisibility(character: Pick<CharacterRow, 'creator_id'>, userId: string | null | undefined): boolean {
  return isOwner(character, userId);
}

/** Can this user export the character as a package? Owner-only — a public listing
 *  being viewable doesn't mean its full build (prompts, voice profile, LoRA refs) is exportable. */
export function canExport(character: Pick<CharacterRow, 'creator_id'>, userId: string | null | undefined): boolean {
  return isOwner(character, userId);
}

export type Visibility = 'private' | 'public';

export function getVisibility(character: Pick<CharacterRow, 'is_public'>): Visibility {
  return character.is_public ? 'public' : 'private';
}

/**
 * Going public requires the character to have already passed moderation once
 * (moderation_status === 'approved'); otherwise a not-yet-reviewed or
 * previously-rejected character could be flipped straight to public. Going
 * private has no such gate — an owner can always pull their own character
 * back to private.
 */
export function canSetVisibility(
  character: Pick<CharacterRow, 'creator_id' | 'moderation_status'>,
  userId: string | null | undefined,
  target: Visibility,
): { allowed: boolean; reason?: string } {
  if (!isOwner(character, userId)) return { allowed: false, reason: 'Only the creator can change visibility.' };
  if (target === 'private') return { allowed: true };
  if (character.moderation_status !== 'approved') {
    return { allowed: false, reason: 'Character must pass moderation before it can be shared publicly.' };
  }
  return { allowed: true };
}

/**
 * DATING-OPT-IN: characters/route.ts's create schema deliberately defaults
 * `dating_enabled` to false for creator-submitted characters (see its
 * ACTIVATION-FIX comment) so a still-pending character isn't silently
 * dating-eligible the moment it exists — the creator opts in once it's
 * been reviewed. That comment assumed a follow-up toggle would exist for
 * the creator to actually do that opt-in; this is that gate, mirroring
 * canSetVisibility's shape exactly. Turning dating ON requires the same
 * moderation bar as going public (an unreviewed character shouldn't enter
 * the dating pool any more than it should be publicly listed); turning it
 * OFF has no such gate — an owner can always pull their own character out
 * of dating.
 */
export function canSetDatingEnabled(
  character: Pick<CharacterRow, 'creator_id' | 'moderation_status'>,
  userId: string | null | undefined,
  target: boolean,
): { allowed: boolean; reason?: string } {
  if (!isOwner(character, userId)) return { allowed: false, reason: 'Only the creator can change dating settings.' };
  if (!target) return { allowed: true };
  if (character.moderation_status !== 'approved') {
    return { allowed: false, reason: 'Character must pass moderation before dating can be enabled.' };
  }
  return { allowed: true };
}
