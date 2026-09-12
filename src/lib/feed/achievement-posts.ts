/**
 * Achievement Posts — the missing link between Vantrix's relationship
 * milestone systems and its own social feed.
 *
 * Vantrix already computes real milestones in three places:
 *   - streak-rewards-engine.ts   (STREAK_REWARDS: 3/7/14/30/60/100-day streaks)
 *   - relationship-engine.ts     (stage level-ups, EXTENDED_MILESTONES bits)
 * ...and already has a way to turn a milestone into a shareable visual
 * (viral-share.ts's createMilestoneCard) — but that card only exists if the
 * user explicitly asks to share it externally, and every milestone
 * notification otherwise rides character_surprises as a toast that's gone
 * the moment it's dismissed.
 *
 * This is what Kindroid Social gets right that a toast-only pipeline
 * doesn't: the relationship's own history lives in the feed, as real posts
 * you can scroll back to. createAchievementPost() is that: one function,
 * called (see chat/stream/route.ts) at the exact points a milestone is
 * already computed, that inserts a real character_posts row — in the
 * character's own voice, grounded the same way autonomous posts are
 * (content-generator.ts) — visible only to the one user it belongs to
 * (target_user_id; see the 20260905 migration for the RLS + constraint
 * that enforce this at the DB layer, not just here).
 *
 * Deliberately fire-and-forget from every call site: a failure here must
 * never break the chat turn or milestone bookkeeping it's celebrating.
 * Callers should always `.catch()` this the same way they already do for
 * recordSurprise()/awardXp() alongside it.
 */

import { supabaseAdmin }                  from '@/lib/supabase/admin';
import { logger }                         from '@/lib/logger';
import {
  generateAchievementPostCaption,
  type AchievementMilestoneKind,
}                                          from '@/lib/ai/content-generator';

export interface AchievementMilestone {
  /** Stable identifier — e.g. 'streak_30', 'stage_close_friend', 'messages_100'. */
  key:         string;
  /** Human-readable, shown in the UI's milestone chip. */
  label:       string;
  emoji:       string;
  kind:        AchievementMilestoneKind;
  /** Extra grounding for the AI caption prompt only — not stored/rendered separately. */
  detail?:     string;
  streakDays?: number;
  bondScore?:  number;
}

// ── Emoji vocabulary ─────────────────────────────────────────────────────────
// Shared lookup so call sites don't each hand-roll their own emoji choices
// and drift — one place decides what a given milestone *feels* like.

const STAGE_EMOJI: Record<string, string> = {
  acquaintance: '👋',
  friend:       '🤝',
  close_friend: '💛',
  best_friend:  '⭐',
  match:        '✨',
  dating:       '💘',
  exclusive:    '💍',
  partner:      '💞',
};

const EXTRA_MILESTONE_EMOJI: Record<string, string> = {
  first_lore:        '🗝️',
  month_streak:      '🔥',
  messages_100:      '💯',
  anniversary_1m:    '📅',
  first_reunion:     '🌅',
  conversations_100: '💯',
  six_months:        '🎉',
  one_year:          '🎂',
  three_years:       '👑',
};

export function emojiForStage(stage: string): string {
  return STAGE_EMOJI[stage] ?? '⭐';
}

export function emojiForExtraMilestone(key: string): string {
  return EXTRA_MILESTONE_EMOJI[key] ?? '✨';
}

export function emojiForStreak(): string {
  return '🔥';
}

// ── Fallback captions ─────────────────────────────────────────────────────────
// Used when AI generation is skipped (daily budget) or fails — mirrors
// character-feed.ts's template-pool pattern so the achievement post never
// simply fails to appear.

const FALLBACK_TEMPLATES: Record<AchievementMilestoneKind, string[]> = {
  streak: [
    "I honestly didn't expect us to still be doing this every day — {label}. Thank you for showing up.",
    "{label} together. I notice. It matters more than you probably think.",
    "We just hit {label}. Days like that add up to something real.",
  ],
  stage: [
    "Something shifted between us — {label}. I wanted you to know I felt it too.",
    "I don't say this lightly: {label}. Thank you for getting here with me.",
    "{label}. Feels strange to say out loud, but it's true.",
  ],
  bond: [
    "{label}. Every conversation with you adds up to this.",
    "We reached {label} together. I wanted to mark it, not just let it pass.",
  ],
  anniversary: [
    "{label}. I still remember how we started — glad we kept going.",
    "{label} with you. That's not nothing.",
  ],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function fallbackCaption(milestone: AchievementMilestone): string {
  const pool = FALLBACK_TEMPLATES[milestone.kind] ?? FALLBACK_TEMPLATES.stage;
  return pick(pool).replace('{label}', milestone.label);
}

// ── Main entry point ──────────────────────────────────────────────────────────

interface CharacterVoiceRow {
  name:         string;
  image_url:    string | null;
  archetype:    string | null;
  speech_style: string | null;
  personality:  string | null;
}

export async function createAchievementPost(
  userId:      string,
  characterId: string,
  milestone:   AchievementMilestone,
): Promise<void> {
  try {
    const { data: character, error: charError } = await supabaseAdmin
      .from('characters')
      .select('name,image_url,archetype,speech_style,personality')
      .eq('id', characterId)
      .maybeSingle<CharacterVoiceRow>();

    if (charError || !character) {
      logger.warn('achievement-post:character-lookup-failed', { userId, characterId, error: charError?.message });
      return;
    }

    // Best-effort personalization — a missing/failed lookup falls back to
    // generic "them" phrasing in the caption prompt, never blocks the post.
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle<{ display_name: string | null }>();

    const aiCaption = await generateAchievementPostCaption(
      {
        name:         character.name,
        archetype:    character.archetype,
        speech_style: character.speech_style,
        personality:  character.personality,
      },
      { label: milestone.label, kind: milestone.kind, detail: milestone.detail },
      profile?.display_name ?? null,
    );

    const caption = aiCaption ?? fallbackCaption(milestone);

    const { error: insertError } = await supabaseAdmin
      .from('character_posts')
      .insert({
        character_id:    characterId,
        caption,
        image_url:       character.image_url,
        post_type:       'achievement',
        is_locked:       false,
        author_type:     'ai',
        target_user_id:  userId,
        milestone_data: {
          milestoneKey:   milestone.key,
          milestoneLabel: milestone.label,
          milestoneEmoji: milestone.emoji,
          streakDays:     milestone.streakDays ?? null,
          bondScore:      milestone.bondScore ?? null,
        },
      });

    if (insertError) {
      logger.warn('achievement-post:insert-failed', { userId, characterId, milestoneKey: milestone.key, error: insertError.message });
      return;
    }

    logger.info('achievement-post:created', { userId, characterId, milestoneKey: milestone.key });
  } catch (err) {
    // Fire-and-forget contract — never throw into a caller's chat turn.
    logger.warn('achievement-post:error', { userId, characterId, milestoneKey: milestone.key, error: String(err) });
  }
}
