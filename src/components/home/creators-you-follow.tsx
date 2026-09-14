import { SafeImage as Image } from "@/components/ui/safe-image";
import Link from "next/link";
import { resolveImageSrc } from "@/lib/utils";

export interface CreatorSummary {
  id: string;
  handle: string;
  avatar_url: string | null;
  /** A character this creator was followed through — see FOLLOW-LINK-FIX
   *  below for why this is what the card actually links to. */
  characterId: string;
}

/**
 * Reference-image parity: "Creators You Follow" circular-avatar row
 * (mirrors the same visual language as the sidebar's account menu
 * avatar). Renders nothing for signed-out visitors — there is no
 * "creators you follow" concept without an account, same guard
 * WhileYouWereAway uses for its own empty state.
 *
 * FOLLOW-DATA-FIX: `creators` now comes from real character_follows rows
 * grouped by creator (see lib/frontend/creators-followed.ts) instead of
 * page.tsx's old placeholder, which relabeled the first 6 characters in
 * the general discover pool as fake "creators".
 *
 * FOLLOW-LINK-FIX (superseded by CREATORS-ROUTES FIX below): each avatar
 * used to link to `/studio/${creator.id}` — the *owner-only* Creator
 * Studio edit page. With `creator.id` a real creator's profile id rather
 * than one of the viewer's own character ids, every one of these links
 * 404'd/failed for every viewer except a creator following their own alt.
 *
 * CREATORS-ROUTES FIX: this app now has a standalone public
 * creator-profile route (/creators/[id], see lib/creators/profile.ts) and
 * a full list page (/creators/following) — both avatars and "See all"
 * point at the real thing instead of the character-page/`/studio`
 * workarounds.
 */
export function CreatorsYouFollow({ creators }: { creators: CreatorSummary[] }) {
  if (creators.length === 0) return null;

  return (
    <section className="px-4 md:px-8 py-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg md:text-xl text-text-primary">
            Creators You Follow
          </h2>
          <Link href="/creators/following" className="text-xs text-gold-400 hover:underline">
            See all
          </Link>
        </div>
        <div className="flex gap-6 overflow-x-auto no-scrollbar">
          {creators.map((creator) => (
            <Link
              key={creator.id}
              href={`/creators/${creator.id}`}
              className="flex flex-col items-center gap-2 shrink-0 group"
            >
              <div className="relative h-16 w-16 rounded-full overflow-hidden border border-border-hairline group-hover:border-gold-500/50 transition-colors ease-premium">
                <Image
                  src={resolveImageSrc(creator.avatar_url)}
                  alt={creator.handle}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </div>
              <span className="text-xs text-text-secondary truncate max-w-[76px]">
                @{creator.handle}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
