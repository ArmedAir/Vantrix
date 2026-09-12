/**
 * notifyFollowersOfNewPost — the missing link between three systems that
 * already existed in isolation:
 *
 *   character_follows  (a user can follow a character — follow/route.ts)
 *   character_posts     (AI cron posts + now user-authored posts)
 *   notifications        (the inbox + push fan-out — emit.ts)
 *
 * Until now, following a character had exactly one visible effect: a
 * follower_count increment and a one-time "you got a follower" ping to the
 * *creator*. A follower themselves got nothing — no signal ever told them
 * the character they follow actually posted, so "follow" was a dead-end
 * action with no reason to matter again. This closes that loop: every new
 * post (AI-generated or user-authored) notifies the character's followers,
 * turning Follow into a real subscription and giving people an everyday
 * reason to come back — the same retention mechanic Instagram/Kindroid
 * both depend on for their follow graphs to be worth building at all.
 *
 * Capped and backgrounded like every other fan-out in this codebase
 * (character-social-engine.ts's MAX_REACTORS_PER_POST /
 * MAX_INTERACTIONS_PER_TICK are the same shape of guard): a single post
 * from a character with a huge follower base must never turn into an
 * unbounded burst of inserts+pushes on the request/cron path.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { emitNotification } from "@/lib/notifications/emit";
import { logger } from "@/lib/logger";

// Generous for any real character today, tight enough that a single post
// can't fan out into thousands of writes+pushes in one tick.
const MAX_NOTIFIED_FOLLOWERS_PER_POST = 300;

export async function notifyFollowersOfNewPost(params: {
  characterId: string;
  characterName: string;
  postId: string;
  caption: string | null;
  /** Never notify this user even if they follow their own character (e.g.
   *  the creator posting as their own character shouldn't ping themselves). */
  excludeUserId?: string;
}): Promise<{ notified: number }> {
  const { characterId, characterName, postId, caption, excludeUserId } = params;

  try {
    let query = supabaseAdmin
      .from("character_follows")
      .select("user_id")
      .eq("character_id", characterId)
      .limit(MAX_NOTIFIED_FOLLOWERS_PER_POST);

    const { data: followers, error } = await query;
    if (error) {
      logger.warn("notifications:post-fanout-fetch-failed", { characterId, error: error.message });
      return { notified: 0 };
    }

    const followerIds = (followers ?? [])
      .map((f) => f.user_id)
      .filter((id) => id !== excludeUserId);

    if (followerIds.length === 0) return { notified: 0 };

    const snippet = caption?.trim()
      ? caption.trim().slice(0, 100) + (caption.length > 100 ? "…" : "")
      : `${characterName} shared something new.`;

    // Sequential, not Promise.all — emitNotification does its own DB write
    // (+ conditional push) per user; a few hundred of these firing in one
    // burst is exactly the DB/push-provider load spike the cron engines'
    // own comments already flag as worth avoiding, so this trades a bit of
    // wall-clock time (this runs in the background either way) for a
    // gentler load profile.
    let notified = 0;
    for (const userId of followerIds) {
      try {
        await emitNotification({
          userId,
          type: "character_new_post",
          title: `${characterName} posted`,
          body: snippet,
          ctaUrl: `/characters/${characterId}`,
          urgency: "low",
          metadata: { characterId, postId },
        });
        notified++;
      } catch (err) {
        // One follower's failed notification (bad push token, etc.) must
        // never abort the whole fan-out.
        logger.warn("notifications:post-fanout-single-failed", { characterId, userId, error: String(err) });
      }
    }

    return { notified };
  } catch (err) {
    logger.warn("notifications:post-fanout-error", { characterId, error: String(err) });
    return { notified: 0 };
  }
}
