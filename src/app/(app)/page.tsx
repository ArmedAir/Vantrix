import { generateSEOMeta } from "@/lib/seo/meta";
import { getDiscoverHome } from "@/lib/frontend/discover";
import { getHeroAds } from "@/lib/frontend/ads";
import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { getUserFeed } from "@/lib/universe/feed-builder";
import { getHomeContext } from "@/lib/frontend/home-context";
import { getHomeHeroContext } from "@/lib/frontend/home-hero";
import { getFeaturedScenes } from "@/lib/frontend/world";
import { listHomeScenarios } from "@/lib/roleplay/scenarios";
import { LandingPage } from "@/components/home/landing-page";
import { FeaturedShowcase } from "@/components/home/featured-showcase";
import { FeaturedCompanions } from "@/components/home/featured-companions";
import { CharacterStatusRing } from "@/components/home/character-status-ring";
import { WhileYouWereAway, type FeedEntry } from "@/components/home/while-you-were-away";
import { PopularScenarios } from "@/components/home/popular-scenarios";
import { FeaturedScenes } from "@/components/home/featured-scenes";
import { CreatorsYouFollow } from "@/components/home/creators-you-follow";
import { getCreatorsFollowed, type FollowedCreator } from "@/lib/frontend/creators-followed";
import { HeroAdsCarousel } from "@/components/home/hero-ads-carousel";
import { ExploreCharacters } from "@/components/home/explore-characters";
import { Greeting } from "@/components/home/greeting";
import { HeroSplit } from "@/components/home/hero-split";
import { CharacterFeatures } from "@/components/home/character-features";
import { Footer } from "@/components/home/footer";
import { MotionWrapper } from "@/components/immersive/motion-wrapper";

/**
 * Home — full rebuild (2026-09-09), not an incremental patch on the
 * prior file. Every section component and every data-fetching call
 * below is the same real, already-shipped, DB-backed functionality the
 * prior page used (Greeting, CharacterStatusRing, HeroSplit,
 * WhileYouWereAway, FeaturedShowcase, FeaturedCompanions,
 * HeroAdsCarousel, PopularScenarios, FeaturedScenes,
 * ExploreCharacters, CreatorsYouFollow, CharacterFeatures,
 * Footer, LandingPage; getDiscoverHome/getHeroAds/getAuthedUser/
 * getUserFeed/getHomeContext/getHomeHeroContext/getFeaturedScenes/
 * listHomeScenarios/getCreatorsFollowed) — none of
 * that real functionality was discarded or reinvented. What changed is
 * the composition: this file is written fresh rather than edited, and
 * the character-pool duplication described below is fixed at the root
 * instead of patched around.
 *
 * HOMEPAGE TRIM (2026-09-10): "Explore Experiences" and "Your world is
 * waiting" (YourWorld) were removed from this signed-in homepage per
 * product request. ExploreExperiences' own `experiences` data is kept —
 * LandingPage (the signed-out homepage, below) still uses it for its
 * "Start with a moment" strip — but getHomeWorldTeaser() is no longer
 * called here since nothing on this page consumes it anymore. Popular
 * Scenarios stays, now rendered as a horizontal slide carousel
 * (HorizontalScrollRow + MediaCard) instead of a static grid, matching
 * Featured Scenes' pattern further down this same page.
 *
 * CHARACTER-POOL DEDUP (root fix, not a patch): FeaturedCompanions,
 * ExploreCharacters, and CharacterFeatures previously all either sliced
 * `allCharacters` from index 0 directly, or (CharacterFeatures) received
 * the entire unsliced array and sliced it again internally — three
 * independent consumers of the same ordered pool, all starting from the
 * same top items, with nothing excluding what FeaturedShowcase's
 * separate `featured` pool had already shown either. The visible result
 * was the same handful of characters rendering two or three times before
 * a page load finished scrolling. Fixed once, here, for the whole page:
 * `featuredIds` excludes anything FeaturedShowcase already used,
 * `nonFeaturedCharacters` is that filtered pool, and each consumer below
 * gets its own disjoint slice of it (0:12 / 12:36 / 36:48) instead of
 * all three starting from zero. CharacterFeatures itself is untouched —
 * it still does its own internal slice(0,6)/slice(0,12) for its grid and
 * circle viewer — but because it's now handed an already-disjoint 36:48
 * chunk instead of the full pool, those internal slices land on
 * characters nothing else on the page has shown yet.
 *
 * Order: Greeting + status rail + hero split (personalised pickup) ->
 * While You Were Away + Featured Showcase + Featured Companions + hero
 * ad/premium carousel (curated + algorithmic + upsell, kept together so
 * the one CTA carousel on this page isn't buried past a long scroll) ->
 * Popular Scenarios / Featured Scenes / Explore Characters (discovery)
 * -> Creators You Follow -> platform features -> Footer.
 *
 * PERF: getDiscoverHome/getHeroAds/getAuthedUser/getFeaturedScenes/
 * listHomeScenarios have no data dependency on each
 * other and run concurrently via Promise.all. The user-gated
 * getUserFeed/getHomeContext/getHomeHeroContext/getCreatorsFollowed
 * quartet waits on getAuthedUser() resolving first (all four need
 * `user`), then also runs concurrently with each other.
 */
export const metadata = generateSEOMeta({
  title: "Vantrix — A Living Universe of AI Companions Who Remember You, Always",
  description:
    "Vantrix is a living universe of AI companions who remember you, always. They change with you, and their world keeps going — persistent memory and evolving personalities, not a chatbot that resets every session.",
  path: "/",
  type: "website",
});

export default async function HomePage() {
  const [
    { featured, experiences, allCharacters, avatars },
    heroAds,
    { user },
    featuredScenes,
    popularScenarios,
  ] = await Promise.all([
    getDiscoverHome(),
    getHeroAds(16),
    getAuthedUser(),
    getFeaturedScenes(10),
    listHomeScenarios(12),
  ]);

  const [feedEntries, homeContext, heroContext, creators] = user
    ? await Promise.all([
        getUserFeed(user.id, 8, true) as unknown as Promise<FeedEntry[]>,
        getHomeContext(),
        getHomeHeroContext(user.id),
        getCreatorsFollowed(),
      ])
    : [[] as FeedEntry[], null, null, [] as FollowedCreator[]];

  const recentChats = homeContext?.recentChats ?? [];
  const pendingInitiatives = homeContext?.pendingInitiatives ?? [];
  const topInitiative = pendingInitiatives[0] ?? null;

  if (!user) {
    return <LandingPage characters={allCharacters} experiences={experiences} />;
  }

  // CHARACTER-POOL DEDUP — see header comment. One filtered pool, three
  // disjoint slices, nothing shown twice.
  const featuredIds = new Set(featured.map((f) => f.characterId));
  const nonFeaturedCharacters = allCharacters.filter((c) => !featuredIds.has(c.id));
  const companionCharacters = nonFeaturedCharacters.slice(0, 12);
  const exploreCharacters = nonFeaturedCharacters.slice(12, 36);
  const featureCharacters = nonFeaturedCharacters.slice(36, 48);

  return (
    <div className="relative pb-2 md:pb-8">
      {/* AMBIENT-GLOW: a fixed, very low-opacity radial gold wash behind
          the whole page — the same --gold-500 token every other gold
          accent in this app draws from, not a new color. Sits behind
          all content (z-index default stacking, no positive z-index
          needed since every section below has an opaque background),
          fixed so it doesn't scroll/repeat oddly, and pointer-events-none
          so it never intercepts a tap/click meant for real content. */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04]"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgb(var(--gold-500)), transparent 70%)",
        }}
        aria-hidden
      />
      <Greeting
        name={heroContext?.displayName ?? null}
        pendingInitiative={topInitiative}
        recentChatsCount={recentChats.length}
      />

      <CharacterStatusRing avatars={avatars} />

      <HeroSplit
        initiative={topInitiative}
        chats={recentChats}
        topMatch={heroContext?.topMatch ?? null}
        streak={heroContext?.streak ?? null}
      />

      {feedEntries.length > 0 && <WhileYouWereAway initialEntries={feedEntries} />}

      <FeaturedShowcase items={featured} />

      <section className="px-4 md:px-8 py-8">
        <div className="max-w-7xl mx-auto">
          <FeaturedCompanions characters={companionCharacters} />
        </div>
      </section>

      <HeroAdsCarousel ads={heroAds} />

      <MotionWrapper><PopularScenarios scenarios={popularScenarios} /></MotionWrapper>
      <MotionWrapper><FeaturedScenes scenes={featuredScenes} /></MotionWrapper>
      <MotionWrapper><ExploreCharacters initial={exploreCharacters} /></MotionWrapper>
      <MotionWrapper><CreatorsYouFollow creators={creators} /></MotionWrapper>
      <MotionWrapper><CharacterFeatures characters={featureCharacters} /></MotionWrapper>
      <Footer />
    </div>
  );
}
