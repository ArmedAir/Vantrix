import Link from "next/link";
import { redirect } from "next/navigation";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { fetchFollowedCreators } from "@/lib/creators/followed";
import { resolveImageSrc } from "@/lib/utils";
import { generateSEOMeta } from "@/lib/seo/meta";

/**
 * CREATORS-ROUTES FIX: the actual "See all" destination for the homepage
 * "Creators You Follow" rail. That link previously pointed at /studio —
 * the owner-only Creator Studio edit page — which 404'd/failed for every
 * viewer except a creator following their own alt (see
 * creators-you-follow.tsx's FOLLOW-LINK-FIX comment). This is the real,
 * viewer-facing full list: every creator the signed-in user follows,
 * fetched directly (fetchFollowedCreators, no self-fetch) with a much
 * higher cap than the homepage rail's 12.
 */
export const metadata = generateSEOMeta({
  title: "Creators You Follow | Vantrix",
  description: "Every creator you follow on Vantrix, in one place.",
  path: "/creators/following",
});

const FULL_LIST_MAX = 60;

export default async function CreatorsFollowingPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect("/login?redirect=/creators/following");

  const creators = await fetchFollowedCreators(user.id, { max: FULL_LIST_MAX });

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-8">
      <h1 className="font-display text-xl text-text-primary mb-6">Creators You Follow</h1>

      {creators.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-border-hairline py-16 text-center">
          <p className="text-text-secondary">
            You haven&apos;t followed any creators yet.
          </p>
          <Link href="/discover" className="text-sm font-medium text-gold-400 hover:underline">
            Discover characters
          </Link>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border-hairline">
          {creators.map((creator) => (
            <Link
              key={creator.id}
              href={`/creators/${creator.id}`}
              className="flex items-center gap-3 py-3 group"
            >
              <div className="relative h-12 w-12 shrink-0 rounded-full overflow-hidden border border-border-hairline group-hover:border-gold-500/50 transition-colors ease-premium">
                <Image
                  src={resolveImageSrc(creator.avatar_url)}
                  alt={creator.handle}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">
                  @{creator.handle}
                </div>
                {creator.bio && (
                  <div className="text-xs text-text-secondary truncate max-w-sm">
                    {creator.bio}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
