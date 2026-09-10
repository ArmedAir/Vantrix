// ── Feed Types ──────────────────────────────────────────────────────────────
// Mirrors GET /api/feed/posts / .../like / .../comments response shapes
// exactly (see route.ts comments) — kept snake_case, unlike types/community.ts's
// camelCase, since these routes return raw table rows with a joined
// `character` object rather than a normalized DTO, and there's no
// intermediate mapping layer to rename fields through.

// FOR-YOU/FOLLOWING SIMPLIFICATION (2026-09-07): "new" and "all" ran the
// exact same query (created_at DESC, no distinct behavior — see
// lib/feed/get-posts.ts) as far as the GLOBAL feed's two user-facing tabs
// were concerned, so those collapsed to "trending" (labeled "For You" —
// the likes-ranked default) and "following" (personalized, followed
// characters only).
//
// TYPECHECK FIX (this session): that collapse missed a real third
// consumer — CharacterPostsGrid (components/characters/character-posts-grid.tsx),
// a single character's own profile "Posts" tab. That view needs every
// public post by ONE character, newest first, with no likes-count gate
// and no follow-status gate — "trending"'s `likes_count > 10` filter would
// silently hide most of a character's own post history from their own
// profile, and "following" would show nothing at all to a viewer who
// hasn't followed them. Restored "new" for exactly this — chronological,
// ungated — but it is NOT re-exposed as a global feed tab; every actual
// caller passes an explicit `character` id alongside it. See
// getFeedPostsPage()'s "new" branch.
export type FeedFilter = "trending" | "following" | "new";

export interface FeedCharacterSummary {
  id: string;
  name: string;
  image_url: string | null;
  gender: string | null;
  tags: string[] | null;
  is_live: boolean | null;
  /** Same fields /api/discover/featured selects — feeds FeedStoriesRail's story viewer. */
  intro_video_url: string | null;
  gallery_image_urls: string[] | null;
  gallery_video_urls: string[] | null;
}

/** Only present on post_type: "achievement" — see lib/feed/achievement-posts.ts. */
export interface FeedPostMilestone {
  key: string;
  label: string;
  emoji: string;
  streak_days: number | null;
  bond_score: number | null;
}

export interface FeedPost {
  id: string;
  caption: string | null;
  /** Redacted to null server-side when is_locked — see route.ts's SEC/MONETIZATION FIX. */
  image_url: string | null;
  post_type: "photo" | "text" | "teaser" | "achievement";
  is_locked: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  character: FeedCharacterSummary | null;
  user_liked: boolean;
  /** 'user' when the character's owner posted this themselves (see
   *  /api/characters/:id/posts); 'ai' for the autonomous cron-generated
   *  posts every row used to be before user authorship existed, and for
   *  achievement posts (the character is "speaking", not the user). */
  author_type: "ai" | "user";
  /** Set only when post_type is "achievement" — never present otherwise. */
  milestone: FeedPostMilestone | null;
}

export interface FeedPostsPage {
  posts: FeedPost[];
  nextCursor: string | null;
}

export interface FeedCommentAuthor {
  type: "user" | "character";
  id: string;
  name: string | null;
  image_url: string | null;
}

export interface FeedComment {
  id: string;
  content: string;
  created_at: string;
  author: FeedCommentAuthor;
}

export interface FeedCommentsPage {
  comments: FeedComment[];
  nextCursor: string | null;
}

export interface FeedLikeResult {
  liked: boolean;
  likes_count: number;
}
