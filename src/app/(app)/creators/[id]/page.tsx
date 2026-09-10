import Link from "next/link";
import { notFound } from "next/navigation";
import { Heart, Users } from "lucide-react";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { getCreatorProfile, getCreatorCharacters } from "@/lib/creators/profile";
import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { MediaCard } from "@/components/ui/media-card";
import { Badge } from "@/components/ui/badge";
import { resolveImageSrc } from "@/lib/utils";
import { generateSEOMeta } from "@/lib/seo/meta";

/**
 * CREATORS-ROUTES FIX: the standalone public creator-profile route this
 * app never had — see creators-you-follow.tsx's own FOLLOW-LINK-FIX
 * comment for the gap this closes. Shows the creator's real profile info
 * (handle, avatar, bio) and their actual public character catalog,
 * rather than routing every "view this creator" tap through one of their
 * characters' pages.
 *
 * getCreatorProfile() returns null both for a genuinely unknown id AND
 * for an account with no public/active characters — the latter is a
 * deliberate privacy boundary (see that function's own comment), not a
 * bug: this page only exists for accounts that are actually, publicly,
 * creators.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const creator = await getCreatorProfile(id);
  if (!creator) {
    return generateSEOMeta({
      title: "Creator | Vantrix",
      description: "View this creator's characters on Vantrix.",
      path: `/creators/${id}`,
    });
  }

  return generateSEOMeta({
    title: `@${creator.handle} | Vantrix Creator`,
    description: creator.bio ?? `Characters by @${creator.handle} on Vantrix.`,
    path: `/creators/${id}`,
  });
}

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getAuthedUser();

  const creator = await getCreatorProfile(id);
  if (!creator) notFound();

  const characters = await getCreatorCharacters(id, user?.id ?? null);

  const totalFollowers = characters.reduce((sum, c) => sum + (c.follower_count ?? 0), 0);
  const totalLikes = characters.reduce((sum, c) => sum + (c.like_count ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="relative h-20 w-20 shrink-0 rounded-full overflow-hidden border border-border-hairline">
          <Image
            src={resolveImageSrc(creator.avatarUrl)}
            alt={creator.handle}
            fill
            sizes="80px"
            className="object-cover"
          />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-xl md:text-2xl text-text-primary truncate">
            @{creator.handle}
          </h1>
          {creator.bio && (
            <p className="mt-1 text-sm text-text-secondary line-clamp-2">{creator.bio}</p>
          )}
          <div className="mt-2 flex items-center gap-4 text-xs text-text-tertiary">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {totalFollowers.toLocaleString()} followers
            </span>
            <span className="flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" />
              {totalLikes.toLocaleString()} likes
            </span>
            <span>
              {characters.length} character{characters.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      {characters.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border-hairline py-16 text-center">
          <p className="text-text-secondary">No public characters right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {characters.map((c) => (
            <MediaCard
              key={c.id}
              href={`/characters/${c.id}`}
              image={resolveImageSrc(c.image_url)}
              alt={c.name}
              badge={c.is_new ? <Badge>New</Badge> : undefined}
              cornerBadge={c.is_premium ? <Badge variant="outline">Premium</Badge> : undefined}
            >
              <div className="truncate text-[15px] font-semibold leading-tight text-text-primary">
                {c.name}
              </div>
              {c.archetype && (
                <div className="mt-0.5 truncate text-xs text-text-secondary">{c.archetype}</div>
              )}
            </MediaCard>
          ))}
        </div>
      )}

      <div className="mt-8">
        <Link href="/creators/following" className="text-sm text-gold-400 hover:underline">
          ← Back to Creators You Follow
        </Link>
      </div>
    </div>
  );
}
