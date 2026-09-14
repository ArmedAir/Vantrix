/**
 * Character Remix — Vantrix
 *
 * The gap this closes: Vantrix's creation studio (creation-studio.tsx) is
 * a genuinely deep 8-stage wizard, and the character library/discovery
 * surfaces are solid — but the two were never connected. Every character
 * had to be built from emptyDraft(), even by a creator who just wanted to
 * riff on someone else's popular public character. That's the actual
 * mechanic behind "community-created personas" as a growth engine
 * elsewhere: most community content isn't first-of-its-kind, it's a fork
 * of something that already resonated, tweaked and re-published. Vantrix
 * had the depth but not the fork button.
 *
 * canRemix() + buildRemixSeed() are the whole feature surface; everything
 * else (the API route, the studio wiring, the button) just calls these.
 */

import type { CharacterDraft } from '@/components/studio/creation/types';
import { emptyDraft } from '@/components/studio/creation/types';

export interface RemixSourceCharacter {
  id: string;
  name: string;
  creator_id: string | null;
  is_public: boolean;
  active: boolean;
  age: number | null;
  gender: string | null;
  pronouns: string | null;
  occupation: string | null;
  origin: string | null;
  category: string | null;
  description: string | null;
  personality: string | null;
  archetype: string | null;
  attachment_style: string | null;
  love_language: string | null;
  char_openness: number | null;
  char_warmth: number | null;
  char_adventure: number | null;
  char_depth: number | null;
  values_list: string[] | null;
  fears: string[] | null;
  flaws: string[] | null;
  dreams: string[] | null;
  current_goal: string | null;
  daily_routine: string[] | null;
  backstory: string | null;
  scenario: string | null;
  family_bg: string | null;
  childhood_bg: string | null;
  friends_list: string[] | null;
  opening_line: string | null;
  speech_style: string | null;
  speech_uses: string[] | null;
  speech_avoids: string[] | null;
  hair_color: string | null;
  eye_color: string | null;
  body_type: string | null;
  skin_tone: string | null;
  clothing: string | null;
  tags: string[] | null;
}

/**
 * Only public, active characters can be remixed — same visibility bar
 * discovery itself already uses, so a remix source is by definition
 * something the requesting user could already see and chat with. A
 * character's own creator remixing their own character is allowed (it's
 * a reasonable way to spin off a variant) and isn't special-cased.
 */
export function canRemix(character: Pick<RemixSourceCharacter, 'is_public' | 'active'>): boolean {
  return character.is_public && character.active;
}

/**
 * Builds a starting CharacterDraft from an existing public character.
 * Deliberately partial in what it carries over:
 *
 *   - Carries: identity/personality/psychology/voice text fields — the
 *     writing is the part worth building on.
 *   - Drops: image_url, face_prompt, generation_style,
 *     identity_locked — every remix starts with NO locked visual
 *     identity, so the new creator generates their own appearance in the
 *     Appearance stage rather than inheriting a pixel-identical render of
 *     someone else's character. hair_color/eye_color/body_type/skin_tone
 *     (plain descriptive fields, not a locked seed) DO carry over as a
 *     starting point, same as any other text field — they're just
 *     defaults the Appearance stage can change.
 *   - Drops: secrets and memories — those read as the original creator's
 *     private worldbuilding notes for their own character, not something
 *     implied by "remix this."
 *   - Resets: is_nsfw to false and dating_enabled to false regardless of
 *     the source's values — a remix is a fresh character pending its own
 *     moderation/activation, not an inherited rating.
 *   - Sets creation_prompt to a lineage note and appends the source name
 *     to name/tags so the new draft doesn't read as a silent duplicate.
 */
export function buildRemixSeed(source: RemixSourceCharacter): CharacterDraft {
  const base = emptyDraft();

  return {
    ...base,
    name: source.name ? `${source.name} (Remix)` : base.name,
    age: source.age ?? base.age,
    gender: (source.gender as CharacterDraft['gender']) ?? base.gender,
    pronouns: source.pronouns ?? base.pronouns,
    occupation: source.occupation ?? base.occupation,
    origin: source.origin ?? base.origin,
    category: source.category ?? base.category,
    description: source.description ?? base.description,

    personality: source.personality ?? base.personality,
    archetype: source.archetype ?? base.archetype,
    attachment_style: source.attachment_style ?? base.attachment_style,
    love_language: source.love_language ?? base.love_language,
    char_openness: source.char_openness ?? base.char_openness,
    char_warmth: source.char_warmth ?? base.char_warmth,
    char_adventure: source.char_adventure ?? base.char_adventure,
    char_depth: source.char_depth ?? base.char_depth,
    values_list: source.values_list ?? base.values_list,
    fears: source.fears ?? base.fears,
    flaws: source.flaws ?? base.flaws,
    dreams: source.dreams ?? base.dreams,
    current_goal: source.current_goal ?? base.current_goal,
    daily_routine: source.daily_routine ?? base.daily_routine,

    backstory: source.backstory ?? base.backstory,
    scenario: source.scenario ?? base.scenario,
    family_bg: source.family_bg ?? base.family_bg,
    childhood_bg: source.childhood_bg ?? base.childhood_bg,
    friends_list: source.friends_list ?? base.friends_list,
    opening_line: source.opening_line ?? base.opening_line,

    speech_style: source.speech_style ?? base.speech_style,
    speech_uses: source.speech_uses ?? base.speech_uses,
    speech_avoids: source.speech_avoids ?? base.speech_avoids,

    hair_color: source.hair_color ?? base.hair_color,
    eye_color: source.eye_color ?? base.eye_color,
    body_type: source.body_type ?? base.body_type,
    skin_tone: source.skin_tone ?? base.skin_tone,
    clothing: source.clothing ?? base.clothing,

    tags: source.tags ?? base.tags,

    creation_prompt: `Remixed from "${source.name}"`,
    usedAI: false,
    is_nsfw: false,
    dating_enabled: false,
    visibility: 'private',
    remixed_from_character_id: source.id,
  };
}
