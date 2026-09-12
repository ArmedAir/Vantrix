import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { getCharacterDetail } from "@/lib/frontend/characters";
import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { resolveMatureAccessStatus } from "@/lib/access/character-gate";
import { getFeedPostsPage } from "@/lib/feed/get-posts";
import { Button } from "@/components/ui/button";
import { StartChatButton } from "@/components/characters/start-chat-button";
import { StartRoleplayButton } from "@/components/roleplay/start-roleplay-button";
import { CharacterEngagement } from "@/components/characters/character-engagement";
import { CharacterNicknameEditor } from "@/components/characters/character-nickname-editor";
import { CharacterWorldProfileSection } from "@/components/characters/character-world-profile";
import { CharacterStorySection } from "@/components/characters/character-story";
import { CharacterGallery } from "@/components/characters/character-gallery";
import { CharacterRelationshipProgress } from "@/components/characters/character-relationship-progress";
import { ShareProfileButton } from "@/components/characters/share-profile-button";
import { Card } from "@/components/ui/card";
import { CharacterPostsGrid } from "@/components/characters/character-posts-grid";
import { MatureAccessGate } from "@/components/characters/mature-access-gate";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CharacterHero } from "@/components/immersive/character-hero";
import { CharacterReactionProvider } from "@/components/immersive/character-reaction-context";

const POSTS_PAGE_SIZE = 24;

/**
 * The detail page home's companion/experience cards already link to
 * (`/characters/${id}`) — was a 404 until now. Covers §3/§4's card-target
 * fields (image, name, tags, description, premium/new badges) plus the
 * Start Chat CTA, and — regression fix, Aug 2026 route-coverage audit —
 * like/follow/relationship-nickname/World Profile/Our Story, all of which
 * had working backend routes with zero frontend consumer.
 *
 * P0-AGE-GATE-FIX: previously rendered full character metadata/image for
 * ANY is_nsfw character to ANY signed-in user, with no age-verification
 * or nsfw_enabled check at all — a direct /characters/[id] URL bypassed
 * every gate that discovery, recommendations, and dating surfaces apply.
 * Now checks resolveMatureAccessStatus() (built on the same shared query
 * pair those surfaces use, via resolveNsfwDiscoveryAccess()) before
 * rendering; unauthorized viewers get MatureAccessGate's credential
 * screen instead of the character's content.
 *
 * VERIFICATION-UI: swapped the single-boolean resolveNsfwDiscoveryAccess()
 * for the granular resolveMatureAccessStatus() so MatureAccessGate can
 * show a visitor exactly which of the two steps (age verification vs.
 * the nsfw_enabled preference) they still need — see that component's
 * own comment.
 *
 * KINDROID-PARITY: getAuthedUser() is now hoisted above the NSFW branch
 * (previously only fetched inside it) since the Posts tab below needs the
 * same authed-user lookup regardless of whether this character is
 * NSFW-gated.
 */
export default async function CharacterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // PERF: getCharacterDetail(id) and getAuthedUser() don't depend on each
  // other — no reason to pay both round-trips back to back. Only the
  // NSFW-gate check right below genuinely needs both results.
  const [character, { user }] = await Promise.all([
    getCharacterDetail(id),
    getAuthedUser(),
  ]);
  if (!character) notFound();

  if (character.is_nsfw) {
    const status = await resolveMatureAccessStatus(user?.id ?? null);
    if (!status.allowed) {
      return (
        <MatureAccessGate
          characterName={character.name}
          ageVerified={status.ageVerified}
          nsfwEnabled={status.nsfwEnabled}
        />
      );
    }
  }

  // KINDROID-PARITY: the character's own post history — see
  // character-posts-grid.tsx. Fetched here (not inside the grid) so the
  // tab's first paint is server-rendered like every other tab, with the
  // same in-process getFeedPostsPage() call the /feed page itself uses
  // rather than a self-fetch. Signed-out visitors get an empty page here;
  // the tab itself shows a sign-in prompt for that case (feed content is a
  // signed-in surface end to end, same posture as /feed and /feed/[id]).
  //
  // TYPECHECK-ADJACENT FIX (this session): this call used to omit `filter`
  // entirely, which silently defaulted to 'trending' inside
  // getFeedPostsPage() — meaning this profile grid was actually showing
  // only this character's posts with >10 likes, sorted by like count, not
  // their real post history in order. Explicit `filter: 'new'` (restored
  // in this same session — see types/feed.ts) is the chronological/ungated
  // mode this view actually needs.
  const postsPage = user
    ? await getFeedPostsPage(user.id, { filter: 'new', character: character.id, limit: POSTS_PAGE_SIZE })
    : { posts: [], nextCursor: null };

  return (
    // CHARACTER-REACTIONS: wraps the whole page (not just Hero+Engagement)
    // since it's a cheap Context provider with no render cost of its own —
    // simpler than threading it around just the two consumers, and leaves
    // room for a future reaction source (gallery, gifts) anywhere on this
    // page without re-plumbing. See character-reaction-context.tsx.
    <CharacterReactionProvider>
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-6">
      {/* IMMERSIVE-UI-PHASE-1: cinematic hero replaces the plain framed
          portrait — atmosphere + deterministic presence state, same
          image/badge data as before, see character-hero.tsx. */}
      <CharacterHero character={character} />

      {/*
        PROFILE-LUXE: editorial "VIP profile" treatment for the identity
        block — kicker archetype above a display-serif name (magazine
        masthead convention, not the old inline archetype byline), a gold
        verified mark for premium companions (BadgeCheck — reads as a
        credential earned via is_premium, distinct from the Crown chip
        already on the hero image), and the like/follow row promoted from
        inline text buttons into a bordered stat strip matching
        stat-item.tsx's own value/label rhythm (font-display numerals,
        tracked-out uppercase labels) — see character-engagement.tsx.
        Every color/spacing/radius token here already exists in
        tailwind.config.ts; nothing new was added to the palette (gold
        stays confined to premium/interactive surfaces per
        FRONTEND_DIRECTIVE §1).
      */}
      <div className="mt-8 text-center">
        {character.archetype && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-500/80">
            {character.archetype}
          </p>
        )}
        <h1 className="mt-2 flex items-center justify-center gap-2 font-display text-3xl md:text-4xl text-text-primary">
          <span>{character.name}</span>
          {character.is_premium && (
            <BadgeCheck
              className="h-6 w-6 shrink-0 text-gold-400"
              strokeWidth={2}
              aria-label="Verified companion"
            />
          )}
          {character.age && (
            <span className="font-sans text-lg font-normal text-text-secondary">
              · {character.age}
            </span>
          )}
        </h1>
      </div>

      <div className="mt-6 border-y border-border-hairline">
        <CharacterEngagement
          characterId={character.id}
          initialLikeCount={character.like_count}
          initialFollowerCount={character.follower_count}
        />
      </div>

      {character.tags.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {character.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-gold-500/25 px-3 py-1 text-xs text-text-secondary transition-colors ease-premium hover:border-gold-500/50 hover:text-text-primary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {character.description && (
        <Card interactive={false} className="mx-auto mt-6 max-w-xl p-6">
          <div className="mx-auto mb-4 h-[2px] w-10 rounded-full bg-gold-500/60" />
          <p className="text-center text-[15px] leading-relaxed text-text-primary">
            {character.description}
          </p>
        </Card>
      )}

      {/* ENGAGEMENT-RETENTION: your standing with this specific character,
          right before the CTAs that grow it — see the component's own
          comment. Signed-out-only no-ops (401), so it costs nothing for
          an anonymous visitor. */}
      <CharacterRelationshipProgress characterId={character.id} />

      <div className="mt-8 flex flex-col items-center gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <StartChatButton characterId={character.id} />
          <StartRoleplayButton characterId={character.id} />
          <ShareProfileButton characterId={character.id} characterName={character.name} />
        </div>
        <CharacterNicknameEditor characterId={character.id} />
      </div>

      <div className="mt-10">
        <Tabs defaultValue="posts">
          <TabsList className="justify-center">
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="gallery">Gallery</TabsTrigger>
            <TabsTrigger value="world">World Profile</TabsTrigger>
            <TabsTrigger value="story">Our Story</TabsTrigger>
          </TabsList>
          <TabsContent value="posts" className="pt-5">
            {user ? (
              <CharacterPostsGrid
                characterId={character.id}
                characterName={character.name}
                mainImageUrl={character.image_url}
                galleryImageUrls={character.gallery_image_urls}
                initialPosts={postsPage.posts}
                initialNextCursor={postsPage.nextCursor}
                isOwner={user.id === character.creator_id}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <p className="text-sm text-text-secondary">
                  Sign in to see {character.name}&apos;s posts.
                </p>
                <Button asChild size="sm">
                  <Link href={`/login?next=/characters/${character.id}`}>Sign In</Link>
                </Button>
              </div>
            )}
          </TabsContent>
          <TabsContent value="gallery" className="pt-5">
            <CharacterGallery
              characterName={character.name}
              introVideoUrl={character.intro_video_url}
              galleryImageUrls={character.gallery_image_urls}
              galleryVideoUrls={character.gallery_video_urls}
            />
          </TabsContent>
          <TabsContent value="world" className="pt-5">
            <CharacterWorldProfileSection characterId={character.id} />
          </TabsContent>
          <TabsContent value="story" className="pt-5">
            <CharacterStorySection characterId={character.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
    </CharacterReactionProvider>
  );
}
