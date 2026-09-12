"use client";

import { memo, useEffect, useState } from "react";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { Heart, MessageCircle, Lock, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeed } from "@/hooks/use-feed";
import { resolveImageSrc, cn } from "@/lib/utils";
import { CharacterPostViewerModal } from "./character-post-viewer-modal";
import type { FeedPost } from "@/types/feed";

/**
 * KINDROID-PARITY: Kindroid Social's whole premise is that a companion
 * has a public profile with its own post history — the character-feed
 * cron (character-feed.ts) and the character-social cron
 * (character-social-engine.ts) already produce exactly that content, but
 * until now it only ever surfaced woven into the global /feed, never on
 * the character's own page. This is the "public profile" half of that
 * parity: the character page's Posts tab, an Instagram-profile-style
 * grid of just this companion's posts.
 *
 * Reuses getFeedPostsPage's character-scoped query (already built for
 * FeedStoriesRail's tap-to-filter) for the initial server-rendered page,
 * and useFeed's existing character-scoped fetchPosts for "load more" —
 * no new backend, this is purely the missing frontend consumer.
 *
 * USER-AUTHORED POSTS: when `isOwner` is true (the viewer created this
 * character — see creator_id on CharacterDetail), a "New Post" composer
 * is available. Posts made this way go through POST /api/characters/:id/posts,
 * which stamps author_type: 'user' + created_by: the caller — never
 * presented as autonomous character output. See that route and
 * 20261228_character_posts_user_authorship.sql for the attribution model.
 */
export function CharacterPostsGrid({
  characterId,
  characterName,
  mainImageUrl,
  galleryImageUrls,
  initialPosts,
  initialNextCursor,
  isOwner = false,
}: {
  characterId: string;
  characterName: string;
  mainImageUrl: string | null;
  galleryImageUrls: string[];
  initialPosts: FeedPost[];
  initialNextCursor: string | null;
  isOwner?: boolean;
}) {
  const { fetchPosts } = useFeed();
  const [posts, setPosts] = useState(initialPosts);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [openPost, setOpenPost] = useState<FeedPost | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  async function loadMore() {
    // `disabled={loading}` on the button below doesn't take effect until
    // the next render, so a fast double-click/tap can otherwise fire this
    // twice before React re-renders — this guard closes that window
    // without waiting on a render to prevent the duplicate fetch.
    if (!nextCursor || loading) return;
    setLoading(true);
    const page = await fetchPosts("new", nextCursor, characterId);
    if (page) {
      setPosts((prev) => [...prev, ...page.posts]);
      setNextCursor(page.nextCursor);
    }
    setLoading(false);
  }

  function handleCreated(post: FeedPost) {
    setPosts((prev) => [post, ...prev]);
    setComposerOpen(false);
  }

  const ownerControls = isOwner && (
    <div className="mb-3 flex justify-end">
      <Button variant="secondary" size="sm" onClick={() => setComposerOpen((v) => !v)}>
        {composerOpen ? (
          <>
            <X className="mr-1 h-3.5 w-3.5" /> Cancel
          </>
        ) : (
          <>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Post
          </>
        )}
      </Button>
    </div>
  );

  if (posts.length === 0) {
    return (
      <div>
        {ownerControls}
        {composerOpen && (
          <PostComposer
            characterId={characterId}
            mainImageUrl={mainImageUrl}
            galleryImageUrls={galleryImageUrls}
            onCreated={handleCreated}
            onCancel={() => setComposerOpen(false)}
          />
        )}
        <p className="py-12 text-center text-sm text-text-tertiary">
          {characterName} hasn&apos;t posted yet
          {isOwner ? " — share the first one." : " — check back soon."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {ownerControls}
      {composerOpen && (
        <PostComposer
          characterId={characterId}
          mainImageUrl={mainImageUrl}
          galleryImageUrls={galleryImageUrls}
          onCreated={handleCreated}
          onCancel={() => setComposerOpen(false)}
        />
      )}

      <p className="mb-3 text-xs uppercase tracking-wider text-text-tertiary">
        {posts.length}
        {nextCursor ? "+" : ""} posts
      </p>

      <div className="grid grid-cols-3 gap-1">
        {posts.map((post) => (
          <PostTile key={post.id} post={post} onOpen={setOpenPost} />
        ))}
      </div>

      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
          </Button>
        </div>
      )}

      <CharacterPostViewerModal post={openPost} onClose={() => setOpenPost(null)} />
    </div>
  );
}

/**
 * Inline composer for a character's owner to post as that character.
 *
 * IMAGE-PICKER FIX: previously caption-only (post_type: 'text' always) —
 * "no upload widget exists yet on this surface" per the original comment
 * here. Rather than building new upload infra, this offers the character's
 * own already-approved portrait + gallery images (same images the studio
 * pipeline generated and moderated at creation time) as photo options —
 * zero new attack surface, and it's already exactly what
 * ALLOWED_IMAGE_HOSTS in the API route expects (R2/cdn.vantrix.ink URLs).
 */
function PostComposer({
  characterId,
  mainImageUrl,
  galleryImageUrls,
  onCreated,
  onCancel,
}: {
  characterId: string;
  mainImageUrl: string | null;
  galleryImageUrls: string[];
  onCreated: (post: FeedPost) => void;
  onCancel: () => void;
}) {
  const { createCharacterPost } = useFeed();
  const [caption, setCaption] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const images = [mainImageUrl, ...galleryImageUrls].filter(
    (url, i, arr): url is string => !!url && arr.indexOf(url) === i,
  );

  async function handleSubmit() {
    if ((!caption.trim() && !selectedImage) || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const post = await createCharacterPost(characterId, {
        caption: caption.trim() || undefined,
        image_url: selectedImage ?? undefined,
        post_type: selectedImage ? "photo" : "text",
      });
      setCaption("");
      setSelectedImage(null);
      onCreated(post);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create post.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-4 rounded-md border border-white/10 bg-white/[0.03] p-3">
      {images.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => setSelectedImage((cur) => (cur === url ? null : url))}
              className={cn(
                "relative h-14 w-14 shrink-0 overflow-hidden rounded-sm border",
                selectedImage === url ? "border-gold-500" : "border-white/10",
              )}
            >
              <Image src={resolveImageSrc(url)} alt="" fill sizes="56px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder={selectedImage ? "Add a caption (optional)…" : "Write a post as your character…"}
        rows={3}
        maxLength={2000}
        className="w-full resize-none rounded-sm border border-white/10 bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-gold-500"
      />
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={submitting || (!caption.trim() && !selectedImage)}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
        </Button>
      </div>
    </div>
  );
}

/**
 * PERF: wrapped in memo(). `posts` grows via setPosts((prev) => [...prev,
 * ...page.posts]) on "Load more" — a shallow copy that keeps every
 * already-loaded post object's identity — and `onOpen` is the setOpenPost
 * setter itself (referentially stable from useState), not a fresh closure
 * per tile. Both props a tile receives are therefore stable across
 * `loading`/`openPost` state changes elsewhere in the grid, so memo's
 * default shallow compare skips re-rendering every earlier tile each time
 * one more page loads or the viewer opens/closes — same rationale
 * feed-post-card.tsx's own PERF comment documents for FeedPostCardImpl.
 */
const PostTile = memo(function PostTile({
  post,
  onOpen,
}: {
  post: FeedPost;
  onOpen: (post: FeedPost) => void;
}) {
  // GALLERY-PLACEHOLDER FIX: a post can have a non-null image_url that
  // still 404s (stale asset path, renamed file, row that was never
  // backfilled with real art — see SafeImage's own IMAGES-NOT-RENDERING
  // FIX comment). SafeImage's job there is to swap in
  // CHARACTER_IMAGE_FALLBACK — a generic silhouette avatar — so the app
  // never shows a raw broken-image icon. That's the right call for a
  // profile portrait, where *something* on-brand belongs in that slot.
  // It's the wrong call for this grid: a silhouette sitting in a post
  // tile reads as "here's a post" when there's no real content behind
  // it, which is exactly the placeholder-post problem this grid needs to
  // not have. So here, an image error demotes the tile to the same
  // caption/lock tile already used for image-less posts, instead of
  // ever rendering the shared avatar fallback in a content slot.
  const [imgError, setImgError] = useState(false);
  useEffect(() => setImgError(false), [post.image_url]);

  const hasImage = !!post.image_url && !imgError;

  return (
    <button
      type="button"
      onClick={() => onOpen(post)}
      className="group relative aspect-square overflow-hidden rounded-xs bg-white/[0.03]"
    >
      {hasImage ? (
        <Image
          src={resolveImageSrc(post.image_url)}
          alt={post.caption ?? "Post"}
          fill
          sizes="(max-width: 640px) 33vw, 220px"
          className="object-cover transition-transform duration-300 ease-premium group-hover:scale-105"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gold-edge px-3 text-center">
          {post.is_locked && <Lock className="h-4 w-4 text-gold-500" strokeWidth={1.75} />}
          <p className="line-clamp-4 text-[11px] leading-snug text-text-secondary">
            {post.caption ?? "···"}
          </p>
        </div>
      )}

      {/* Hover/press overlay — same info Instagram's profile grid surfaces,
          just gold-monochrome per Badge's own §9.4 resolution rather than
          a borrowed white-icon convention. */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center gap-4 bg-black/0 opacity-0 transition-all duration-150 ease-premium",
          "group-hover:bg-black/40 group-hover:opacity-100"
        )}
      >
        <span className="flex items-center gap-1 text-xs font-semibold text-white">
          <Heart className="h-4 w-4" fill="white" strokeWidth={0} />
          {post.likes_count.toLocaleString()}
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-white">
          <MessageCircle className="h-4 w-4" fill="white" strokeWidth={0} />
          {post.comments_count.toLocaleString()}
        </span>
      </div>
    </button>
  );
});
