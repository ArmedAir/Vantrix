/**
 * getPostById / getRepliesForPost / getPostsPage — the actual community
 * post-detail logic.
 *
 * ROOT-CAUSE FIX (2026-09-12): same self-fetch issue documented in
 * get-communities.ts and lib/dating/get-world-home.ts — this logic used to
 * live only inline in app/api/community/posts/**, reachable from the
 * community/[slug] and community/posts/[id] Server Components solely via
 * an HTTP self-fetch through fetchInternal(). That self-fetch is what was
 * producing the intermittent 404s: opening a post from the feed, or a
 * like/reply triggering router.refresh() (which re-runs the page's server
 * fetch), would occasionally hit a "responded 404" from fetchInternal and
 * fall through to notFound(). Moved here so the Server Components can call
 * this in-process instead. The route handlers are now thin wrappers around
 * these for any client-side/external caller (the browser-side like/reply
 * actions in use-community.ts are real same-origin fetches and were never
 * part of this bug — only the server-to-server hop was affected).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { CommunityPost, CommunityReply, DiscussionSort } from "@/types/community";

const POST_SELECT = `
  id,
  community_slug,
  author_id,
  title,
  body,
  tag,
  likes_count,
  liked_by,
  reply_count,
  is_pinned,
  created_at,
  profiles:author_id ( username )
`;

type PostRow = {
  id: string;
  community_slug: string;
  author_id: string;
  title: string;
  body: string;
  tag: string;
  likes_count: number;
  liked_by: unknown;
  reply_count: number;
  is_pinned: boolean;
  created_at: string;
  profiles: { username: string } | null;
};

function mapPost(p: PostRow, userId: string | null): CommunityPost {
  return {
    id: p.id,
    communitySlug: p.community_slug,
    authorId: p.author_id,
    authorName: p.profiles?.username ?? "Member",
    title: p.title,
    body: p.body,
    tag: p.tag,
    likesCount: p.likes_count,
    replyCount: p.reply_count,
    userLiked: Array.isArray(p.liked_by) && userId
      ? (p.liked_by as string[]).includes(userId)
      : false,
    isPinned: p.is_pinned,
    createdAt: p.created_at,
  };
}

export async function getPostById(id: string, userId: string | null): Promise<CommunityPost | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("community_posts")
      .select(POST_SELECT)
      .eq("id", id)
      .single();

    if (error) {
      // PGRST116: no row found, 42P01: table doesn't exist yet — both mean "no post"
      if (error.code === "PGRST116" || error.code === "42P01") return null;
      throw error;
    }

    return mapPost(data as unknown as PostRow, userId);
  } catch (err) {
    logger.error("community:post-get-error", { error: String(err), postId: id });
    return null;
  }
}

export async function getPostsPage(
  slug: string,
  userId: string | null,
  params?: { sort?: DiscussionSort; cursor?: string; limit?: number }
): Promise<{ posts: CommunityPost[]; nextCursor: string | null }> {
  const sort = params?.sort ?? "new";
  const cursor = params?.cursor ?? null;
  const limit = Math.min(params?.limit && params.limit > 0 ? params.limit : 20, 40);

  try {
    let query = supabaseAdmin
      .from("community_posts")
      .select(POST_SELECT)
      .eq("community_slug", slug)
      .limit(limit + 1);

    if (sort === "trending") {
      query = query.gt("likes_count", 0).order("likes_count", { ascending: false });
    } else if (sort === "top") {
      query = query.order("likes_count", { ascending: false });
    } else {
      if (cursor) query = query.lt("created_at", cursor);
      query = query.order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === "42P01") return { posts: [], nextCursor: null };
      throw error;
    }

    const rows = ((data ?? []) as unknown as PostRow[]).slice(0, limit);
    const hasMore = (data ?? []).length > limit;
    const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null;

    return { posts: rows.map((p) => mapPost(p, userId)), nextCursor };
  } catch (err) {
    logger.error("community:posts-get-error", { error: String(err), slug });
    return { posts: [], nextCursor: null };
  }
}

export async function getRepliesForPost(postId: string, userId: string | null): Promise<CommunityReply[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("community_replies")
      .select(`
        id,
        post_id,
        author_id,
        body,
        likes_count,
        liked_by,
        created_at,
        profiles:author_id ( username )
      `)
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      if (error.code === "42P01") return [];
      throw error;
    }

    return (data ?? []).map((r) => ({
      id: r.id,
      postId: r.post_id,
      authorId: r.author_id ?? "",
      authorName: (r.profiles as { username: string } | null)?.username ?? "Member",
      body: r.body,
      likesCount: r.likes_count,
      userLiked: Array.isArray(r.liked_by) && userId
        ? (r.liked_by as string[]).includes(userId)
        : false,
      createdAt: r.created_at,
    }));
  } catch (err) {
    logger.error("community:replies-get-error", { error: String(err), postId });
    return [];
  }
}
