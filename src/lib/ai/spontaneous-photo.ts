/**
 * Spontaneous Photo Engine — Vantrix
 *
 * Candy AI's chat+generated-image combo is entirely reactive: the
 * character only ever produces a photo because the user asked for one.
 * character-initiative.ts already gives characters unprompted opening
 * lines ("I woke up wondering if you slept okay"); this module lets a
 * handful of those openers arrive WITH a photo she wasn't asked to send —
 * a morning selfie, a photo from the thing she's excited about, a candid
 * in the moment she's feeling something. That's the actual gap: not
 * better images, a character who shares one without being prompted.
 *
 * Deliberately narrow, on purpose:
 *   - Only 3 of the 7 initiative types are visual-shaped at all (see
 *     PHOTO_CONTEXT below). "Concern" ("you've been quiet") or
 *     "anticipation" texts getting a random selfie attached would read as
 *     a non-sequitur, not a moment.
 *   - Gated behind the same relationship-depth floor
 *     media-milestone-engine.ts already uses for unprompted voice notes
 *     (canSendSpontaneousPhoto) — a stranger doesn't get unsolicited
 *     photos, same reasoning as the existing voice-note gate.
 *   - SPONTANEOUS_PHOTO_CHANCE keeps this rare even when eligible, plus a
 *     hard 1-per-user-per-day Redis cap independent of
 *     proactive-arbitrator's own daily ceiling — this is a bonus riding
 *     inside an already-arbitrated slot, not a new push channel, so it
 *     needs its own tighter cap to stay a genuine "she sent me something"
 *     moment rather than routine.
 *   - Always isExplicit:false and always the safe 'selfie' angle,
 *     regardless of the character's is_nsfw flag or relationship stage —
 *     an unprompted, unrequested message is never the right place for
 *     mature content, full stop. This is stricter than /api/chat/image's
 *     own gating, deliberately.
 *   - Reuses the user's own monthly image-dollar ceiling
 *     (media-budget.ts's checkMediaBudget) rather than a separate
 *     unlimited platform budget, so this can never become an unbounded
 *     FAL cost source. It's simply free of the per-image token charge —
 *     the token wallet is completely bypassed.
 *
 * A failure anywhere in this module (budget denied, provider error, redis
 * down) just means no photo — it must never fail the initiative's text
 * message, which is the guaranteed part.
 */

import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import type { RelationshipStage } from '@/lib/ai/relationship-engine';
import type { Tier } from '@/lib/rate-limit';
import { canSendSpontaneousPhoto } from '@/lib/ai/media-milestone-engine';
import { checkMediaBudget, recordMediaUsage, releaseMediaReservation } from '@/lib/media-budget';
import { buildImagePrompt } from '@/lib/image/in-chat-image';
import type { CharacterAppearance, SceneContext } from '@/lib/image/in-chat-image';
import { generatePrimaryImage } from '@/lib/media/primary-image';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { InitiativeType } from '@/lib/ai/character-initiative';

const SPONTANEOUS_PHOTO_CHANCE = 0.3;
const DAILY_CAP_TTL_SECONDS = 26 * 60 * 60; // matches proactive-arbitrator's own TZ-slop margin

function dailyPhotoCapKey(userId: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `vantrix:spontaneous-photo:daily:${userId}:${day}`;
}

// Only these three read as "a moment she'd naturally want to show, not
// just tell" — see header. Each maps to a scene mood/lighting/setting
// that fits the initiative's own guidance in character-initiative.ts.
const PHOTO_CONTEXT: Partial<Record<InitiativeType, SceneContext>> = {
  morning_greeting: { mood: 'soft sleepy smile, just woke up', lighting: 'natural', setting: 'cozy bedroom, morning light through the window' },
  goal_milestone:    { mood: 'genuine excited smile, proud', lighting: 'golden_hour', setting: 'wherever feels right to celebrate a small win' },
  emotional_peak:    { mood: 'warm, soft, thoughtful expression', lighting: 'soft', setting: 'quiet, intimate everyday setting' },
};

export interface SpontaneousPhotoInput {
  character: {
    id: string;
    name: string;
    gender?: string | null;
    age?: number | null;
    description?: string | null;
    personality?: string | null;
    occupation?: string | null;
    visual_seed?: string | null;
    hair_color?: string | null;
    eye_color?: string | null;
    body_type?: string | null;
    skin_tone?: string | null;
    generation_style?: string | null;
  };
  type: InitiativeType;
  stage: RelationshipStage;
  userId: string;
  tier: Tier;
}

/**
 * Returns an image URL to attach to this initiative, or null if this one
 * isn't getting a photo — either by design (wrong type / relationship not
 * deep enough), by the dice roll, by the daily cap, or by any downstream
 * failure. Never throws.
 */
export async function maybeGenerateSpontaneousPhoto(
  input: SpontaneousPhotoInput,
): Promise<string | null> {
  const { character, type, stage, userId, tier } = input;

  const sceneBase = PHOTO_CONTEXT[type];
  if (!sceneBase) return null;
  if (!canSendSpontaneousPhoto(stage)) return null;
  if (Math.random() >= SPONTANEOUS_PHOTO_CHANCE) return null;

  try {
    const claimedToday = await redis.set(dailyPhotoCapKey(userId), '1', {
      nx: true,
      ex: DAILY_CAP_TTL_SECONDS,
    });
    if (!claimedToday) return null;
  } catch (err) {
    // Fail closed here (unlike proactive-arbitrator's fail-open) — this
    // is a cost guard, not a delivery guarantee, and skipping the photo
    // never blocks the initiative's text.
    logger.warn('spontaneous-photo:redis-cap-check-failed', { userId, error: String(err) });
    return null;
  }

  const budget = await checkMediaBudget('image', userId, tier);
  if (!budget.allowed) return null;

  try {
    const appearance: CharacterAppearance = {
      id: character.id,
      name: character.name,
      gender: character.gender ?? null,
      age: character.age ?? null,
      description: character.description ?? null,
      personality: character.personality ?? null,
      occupation: character.occupation ?? null,
      art_style: (character.generation_style as CharacterAppearance['art_style']) ?? 'realistic',
      visual_seed: character.visual_seed ?? null,
      hair_color: character.hair_color ?? null,
      eye_color: character.eye_color ?? null,
      body_type: character.body_type ?? null,
      skin_tone: character.skin_tone ?? null,
    };

    const scene: SceneContext = {
      ...sceneBase,
      angle: 'selfie',
      isExplicit: false, // always — see header
    };

    const { positive, negative, seedUsed, newSeed } = buildImagePrompt(appearance, scene);

    const result = await generatePrimaryImage({
      prompt: positive,
      negativePrompt: negative,
      imageSize: 'portrait_4_3',
    });

    if (!result.success || !result.imageUrl) {
      await releaseMediaReservation('image', userId);
      logger.warn('spontaneous-photo:generation-failed', { characterId: character.id, type, error: result.error });
      return null;
    }

    await recordMediaUsage('image', userId);

    if (newSeed) {
      // Fire-and-forget, same posture as getOrCreateSeed's own callers in
      // /api/chat/image — never worth failing the photo over.
      supabaseAdmin
        .from('characters')
        .update({ visual_seed: seedUsed })
        .eq('id', character.id)
        .then(undefined, (err) => logger.warn('spontaneous-photo:seed-persist-failed', { characterId: character.id, error: String(err) }));
    }

    logger.info('spontaneous-photo:generated', { characterId: character.id, userId, type });
    return result.imageUrl;
  } catch (err) {
    await releaseMediaReservation('image', userId).catch(() => {});
    logger.warn('spontaneous-photo:error', { characterId: character.id, userId, type, error: String(err) });
    return null;
  }
}
