/**
 * GET  /api/community/posts  — paginated discussion feed for a community
 * POST /api/community/posts  — create a new post
 *
 * GET query params:
 *   slug   — community slug (required)
 *   sort   — "new" | "trending" | "top"  (default: "new")
 *   cursor — ISO string for cursor pagination (new sort only)
 *   limit  — default 20, max 40
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { supabaseAdmin }             from "@/lib/supabase/admin";
import { logger }                    from "@/lib/logger";
import { checkActionLimit } from "@/lib/rate-limit";
import { sanitizeField } from "@/lib/sanitize";
import { moderateCharacter } from "@/lib/moderation";
import { getPostsPage } from "@/lib/community/get-posts";

const VALID_TAGS = new Set(["discussion", "question", "theory", "tips", "fan-art", "lore", "milestone"]);

export const dynamic = "force-dynamic";

// ── GET ───────────────────────────────────────────────────────────────────────

// ROOT-CAUSE FIX (2026-09-12): logic moved to lib/community/get-posts.ts so
// Server Components can call it in-process instead of self-fetching this
// route (see that file's header comment). This is now a thin wrapper for
// any client-side/external caller.
export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url    = new URL(req.url);
    const slug   = url.searchParams.get("slug");
    const sort   = (url.searchParams.get("sort") ?? "new") as "new" | "trending" | "top";
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
    const limit    = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20, 40);

    if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

    const { posts, nextCursor } = await getPostsPage(slug, user.id, { sort, cursor, limit });
    return NextResponse.json({ posts, nextCursor });
  } catch (err) {
    logger.error("community:posts-get-error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // HARDEN-FIX: post creation had no rate limit — an unmoderated-until-
    // reported feed with unlimited posting is a real spam surface.
    const actionLimit = await checkActionLimit(user.id, 'community_post');
    if (!actionLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many posts recently. Try again later.', retryAt: actionLimit.reset },
        { status: 429 },
      );
    }

    const body = await req.json() as {
      communitySlug: string;
      title:         string;
      body:          string;
      tag?:          string;
    };

    if (!body.communitySlug || !body.title?.trim() || !body.body?.trim()) {
      return NextResponse.json(
        { error: "communitySlug, title, and body are required" },
        { status: 422 },
      );
    }
    if (body.title.length > 200) {
      return NextResponse.json({ error: "Title must be 200 characters or less" }, { status: 422 });
    }
    if (body.body.length > 10_000) {
      return NextResponse.json({ error: "Body must be 10,000 characters or less" }, { status: 422 });
    }

    // SEC/CONTENT FIX (Phase B audit, 2026-08-06): title/body were inserted
    // completely raw — no sanitizeField (control-char/zero-width/homoglyph
    // stripping), and `tag` had no validation at all (any string accepted,
    // unbounded length). React's JSX text interpolation on the read side
    // means this was never exploitable as stored XSS, but it's still an
    // unmoderated, unsanitized public forum with zero content filtering —
    // inconsistent with every other free-text surface in the app
    // (characters, images, video prompts all go through sanitizeField/
    // moderateCharacter). Brought into parity here.
    const safeTitle = sanitizeField(body.title, 200);
    const safeBody  = sanitizeField(body.body, 10_000);
    if (!safeTitle || !safeBody) {
      return NextResponse.json({ error: "Title and body cannot be empty after sanitization" }, { status: 422 });
    }
    const safeTag = body.tag && VALID_TAGS.has(body.tag) ? body.tag : "discussion";

    const modResult = await moderateCharacter({ name: safeTitle, description: safeBody });
    if (!modResult.allowed) {
      return NextResponse.json({
        error: modResult.reason ?? "Post rejected by content policy",
        code: "CONTENT_POLICY_VIOLATION",
      }, { status: 422 });
    }

    const { data, error } = await supabaseAdmin
      .from("community_posts")
      .insert({
        community_slug: body.communitySlug,
        author_id:      user.id,
        title:          safeTitle,
        body:           safeBody,
        tag:            safeTag,
      })
      .select("id, created_at")
      .single();

    if (error) {
      logger.error("community:post-create-error", { error: error.message, userId: user.id });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ post: data }, { status: 201 });
  } catch (err) {
    logger.error("community:post-create-error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
