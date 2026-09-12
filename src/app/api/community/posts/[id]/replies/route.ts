/**
 * GET  /api/community/posts/[id]/replies — fetch replies for a post (oldest first)
 * POST /api/community/posts/[id]/replies — add a reply to a post
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { supabaseAdmin }             from "@/lib/supabase/admin";
import { logger }                    from "@/lib/logger";
import { bg }                        from "@/lib/logger";
import { checkActionLimit } from "@/lib/rate-limit";
import { sanitizeField } from "@/lib/sanitize";
import { moderateCharacter } from "@/lib/moderation";
import { emitNotification } from "@/lib/notifications/emit";
import { getRepliesForPost } from "@/lib/community/get-posts";

export const dynamic = "force-dynamic";

// ── GET ───────────────────────────────────────────────────────────────────────

// ROOT-CAUSE FIX (2026-09-12): logic moved to lib/community/get-posts.ts so
// Server Components can call it in-process instead of self-fetching this
// route (see that file's header comment). This is now a thin wrapper for
// any client-side/external caller.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const replies = await getRepliesForPost(params.id, user.id);
    return NextResponse.json({ replies });
  } catch (err) {
    logger.error("community:replies-get-error", { error: String(err), postId: params.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // HARDEN-FIX: same gap as community/posts/route.ts, same fix.
    const actionLimit = await checkActionLimit(user.id, 'community_reply');
    if (!actionLimit.allowed) {
      return NextResponse.json(
        { error: "Too many replies recently. Try again later.", retryAt: actionLimit.reset },
        { status: 429 },
      );
    }

    const body = await req.json() as { body: string };
    if (!body.body?.trim()) {
      return NextResponse.json({ error: "Reply body is required" }, { status: 422 });
    }
    if (body.body.length > 4_000) {
      return NextResponse.json({ error: "Reply must be 4,000 characters or less" }, { status: 422 });
    }

    // SEC/CONTENT FIX (Phase B audit, 2026-08-06): same gap as
    // community/posts/route.ts — reply body was inserted completely raw,
    // with no sanitization or moderation. Brought into parity.
    const safeBody = sanitizeField(body.body, 4_000);
    if (!safeBody) {
      return NextResponse.json({ error: "Reply cannot be empty after sanitization" }, { status: 422 });
    }

    const modResult = await moderateCharacter({ name: "reply", description: safeBody });
    if (!modResult.allowed) {
      return NextResponse.json({
        error: modResult.reason ?? "Reply rejected by content policy",
        code: "CONTENT_POLICY_VIOLATION",
      }, { status: 422 });
    }

    // Insert reply
    const { data: reply, error: insertErr } = await supabaseAdmin
      .from("community_replies")
      .insert({ post_id: params.id, author_id: user.id, body: safeBody })
      .select("id, created_at")
      .single();

    if (insertErr) {
      logger.error("community:reply-create-error", { error: insertErr.message });
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Increment reply_count on post atomically
    try {
      await supabaseAdmin.rpc("increment_community_reply_count", { p_post_id: params.id });
    } catch {
      // RPC might not exist — fall back to manual increment
      const { data: post } = await supabaseAdmin
        .from("community_posts")
        .select("reply_count")
        .eq("id", params.id)
        .single();
      if (post) {
        await supabaseAdmin
          .from("community_posts")
          .update({ reply_count: (post.reply_count ?? 0) + 1 })
          .eq("id", params.id);
      }
    }

    // Notify the post's author (not the replier, and not on self-replies).
    (async () => {
      const { data: post } = await supabaseAdmin
        .from("community_posts")
        .select("author_id,title")
        .eq("id", params.id)
        .single();
      if (!post?.author_id || post.author_id === user.id) return;
      return emitNotification({
        userId: post.author_id,
        type: "community_reply",
        title: "New reply",
        body: `Someone replied to "${post.title}".`,
        ctaUrl: `/community/posts/${params.id}`,
        urgency: "low",
        metadata: { postId: params.id, replyId: reply.id },
      });
    })().catch(bg("emitNotification.communityReply"));

    return NextResponse.json({ reply }, { status: 201 });
  } catch (err) {
    logger.error("community:reply-create-error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}