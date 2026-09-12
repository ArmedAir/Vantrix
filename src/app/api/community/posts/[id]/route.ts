/**
 * GET /api/community/posts/[id]
 *
 * Fetches a single community post by its ID.
 * Used by the DiscussionThread component for efficient single-post loading.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { supabaseAdmin }             from "@/lib/supabase/admin";
import { logger }                    from "@/lib/logger";
import { getPostById }               from "@/lib/community/get-posts";

export const dynamic = "force-dynamic";

// ROOT-CAUSE FIX (2026-09-12): logic moved to lib/community/get-posts.ts so
// Server Components can call it in-process instead of self-fetching this
// route (see that file's header comment). This is now a thin wrapper for
// any client-side/external caller.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const post = await getPostById(params.id, user.id);
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    return NextResponse.json({ post });
  } catch (err) {
    logger.error("community:post-get-error", { error: String(err), postId: params.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/community/posts/[id]
 *
 * Lets an author delete their own post. The RLS policy
 * `community_posts_delete_own` (20241000_community.sql) already scopes
 * deletes to `author_id = auth.uid()`, but this route uses supabaseAdmin
 * (service role, bypasses RLS) like every other route in this file — so
 * the ownership check below is the only thing actually enforcing it on
 * this path. Replies cascade via `on delete cascade` on community_replies.
 */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("community_posts")
      .select("id, author_id")
      .eq("id", params.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (existing.author_id !== user.id) {
      return NextResponse.json({ error: "You can only delete your own posts" }, { status: 403 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from("community_posts")
      .delete()
      .eq("id", params.id);

    if (deleteError) {
      logger.error("community:post-delete-error", { error: deleteError.message, postId: params.id, userId: user.id });
      return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("community:post-delete-error", { error: String(err), postId: params.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
