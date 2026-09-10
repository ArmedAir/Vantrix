import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getFeedPostById } from "@/lib/feed/get-posts";
import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { Button } from "@/components/ui/button";
import { FeedPostCard } from "@/components/feed/feed-post-card";

/**
 * REAL-GAP FIX: feed-post-card.tsx's share button has always built a
 * `/feed?post=${id}` link — no page or component ever read that query
 * param, so every "Copy link" / native share from the feed pointed
 * somewhere that just showed the ordinary, unfiltered feed. This is the
 * page that link should have gone to all along: a real permalink for one
 * post, same card treatment as the list, framed on its own.
 *
 * Same auth posture as the main feed (/feed's own page.tsx): signed-out
 * visitors get a quiet sign-in prompt rather than the post itself,
 * consistent with the feed being a signed-in surface end to end.
 */
export default async function FeedPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getAuthedUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 md:px-8 py-16 text-center">
        <h1 className="font-display text-xl text-text-primary">
          Sign in to view this post
        </h1>
        <p className="mt-3 text-sm text-text-secondary">
          Someone shared a moment from the Vantrix feed with you — sign in
          to see it and join the conversation.
        </p>
        <Button asChild className="mt-6">
          <Link href={`/login?next=/feed/${id}`}>Sign In</Link>
        </Button>
      </div>
    );
  }

  const post = await getFeedPostById(user.id, id);
  if (!post) notFound();

  return (
    <div className="mx-auto max-w-[520px] py-4">
      <div className="px-4 md:px-0 mb-3">
        <Link
          href="/feed"
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors ease-premium"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
          Feed
        </Link>
      </div>
      <div className="px-4 md:px-0">
        <FeedPostCard post={post} />
      </div>
    </div>
  );
}
