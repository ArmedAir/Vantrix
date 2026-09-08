import { generateSEOMeta } from "@/lib/seo/meta";
import { getDiscoverHome } from "@/lib/frontend/discover";
import { getHeroAds } from "@/lib/frontend/ads";
import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { getUserFeed } from "@/lib/universe/feed-builder";
import { getHomeContext } from "@/lib/frontend/home-context";
import { getHomeHeroContext } from "@/lib/frontend/home-hero";
import { getFeaturedScenes, getHomeWorldTeaser } from "@/lib/frontend/world";
import { listHomeScenarios } from "@/lib/roleplay/scenarios";
import { LandingPage } from "@/components/home/landing-page";
import { FeaturedShowcase } from "@/components/home/featured-showcase";
import { FeaturedCompanions } from "@/components/home/featured-companions";
import { CharacterStatusRing } from "@/components/home/character-status-ring";
import { WhileYouWereAway, type FeedEntry } from "@/components/home/while-you-were-away";
import { ExploreExperiences } from "@/components/home/explore-experiences";
import { PopularScenarios } from "@/components/home/popular-scenarios";
import { FeaturedScenes } from "@/components/home/featured-scenes";
import { CreatorsYouFollow } from "@/components/home/creators-you-follow";
import { getCreatorsFollowed, type FollowedCreator } from "@/lib/frontend/creators-followed";
import { HeroAdsCarousel } from "@/components/home/hero-ads-carousel";
import { ExploreCharacters } from "@/components/home/explore-characters";
import { Greeting } from "@/components/home/greeting";
import { HeroSplit } from "@/components/home/hero-split";
import { YourWorld } from "@/components/home/your-world";
import { PlatformFeatures } from "@/components/home/platform-features";
import { Footer } from "@/components/home/footer";
// LUXURY-SCROLL FIX: MotionWrapper (already proven on HeroSplit/CharacterHero
// — reduced-motion-safe fade+rise on scroll-into-view) was never applied
// past the hero band. Every discovery row below it rendered inert on first
// scroll despite the app-wide "premium" easing/motion system existing for
// exactly this. Scoped to the read-only discovery rows only — Greeting,
// CharacterStatusRing, HeroSplit, WhileYouWereAway, FeaturedShowcase, and
// HeroAdsCarousel are left untouched since they're above-the-fold, carry
// their own animation (carousel/ring), or are time-sensitive CTA content
// that shouldn't be delayed behind a scroll-reveal.
import { MotionWrapper } from "@/components/immersive/motion-wrapper";

/**
 * Home. Order is built around a returning, already-authenticated user
 * (this route redirects to /login before ever rendering — see the
 * HERO-REMOVED note below) rather than a first-time visitor:
 *   1. Greeting + Status Rail + Hero Split — personalised "here's where
 *      you left off" band (PREMIUM-HERO FIX, below)
 *   2. While You Were Away + Featured Showcase + Featured Companions +
 *      Hero Ads/Premium CTA carousel — pick up / platform-curated
 *      highlight / algorithmic discover / upsell, kept together (see
 *      CTA-POSITION-FIX below — this carousel had drifted to the very
 *      bottom, past a mobile scroll long enough that most sessions
 *      never reached it)
 *   3. Explore Experiences, Popular Scenarios, Legendary Scenes, Explore
 *      Characters, Your World — discovery
 *   4. Creators You Follow, Footer
 *
 * FEATURED-SHOWCASE FIX: `featured` (up to 5 is_featured=true characters)
 * came back from getDiscoverHome() on every request but was destructured
 * out and dropped — only the logged-out surfaces (AnonHero, LandingPage,
 * /discover) ever rendered it. FeaturedShowcase (below) is the first
 * consumer of it on the authenticated page: a large hero + landscape
 * grid sitting right after the personalized pickup band and ahead of the
 * "For You" algorithmic row, so the platform's own curated picks get the
 * first real discovery slot on the page. See featured-showcase.tsx.
 * Every section owns its own `px-4 md:px-8 py-N` wrapper (see e.g.
 * explore-experiences.tsx, popular-scenarios.tsx) — this file no longer
 * hand-manages section padding itself, so vertical rhythm stays
 * consistent instead of drifting between page-level and
 * component-level spacing choices.
 *
 * PREMIUM-HERO FIX: implements the premium Home redesign (greeting
 * header, cinematic hero-split, "Tonight's Match"/"Streak" side stack,
 * "Your World" teaser strip) against the same token system the rest of
 * the app already uses (bg-base/border-hairline/gold scale/shadow-card —
 * confirmed byte-identical to the design reference, see globals.css's
 * `:root` block), not a one-off style. Greeting/HeroSplit/YourWorld are
 * new; CharacterStatusRing, WhileYouWereAway, FeaturedCompanions,
 * ExploreExperiences, PopularScenarios, FeaturedScenes, ExploreCharacters
 * were already real, DB-driven, and already matched the reference
 * almost exactly (PopularScenarios/ExploreCharacters share the
 * reference's own section names) — those are untouched.
 *
 * HeroSplit replaces ContinueYourStories and HomeSideRail: both are left
 * on disk, unimported here, same precedent as Hero/HeroCarousel below —
 * HeroSplit's initiative-priority featured card already covers
 * HomeSideRail's "someone is thinking about you" widget with the
 * character's actual message as a quote (HomeSideRail only had a
 * name+reason string), and its Tonight's Match / Streak widgets replace
 * HomeSideRail's "Today's Moments" tri-avatar row, which was redundant
 * with the status rail directly above it once those widgets existed.
 * `initiative`/`chats` are the exact getHomeContext() rows those two
 * components already consumed — no new fetch added for HeroSplit itself.
 * getHomeHeroContext() (lib/frontend/home-hero.ts) is the one genuinely
 * new read this revision adds — see that file's own PERF note on why it
 * does NOT reuse getDatingWorldHome()'s recommendation-engine-backed
 * tonightsMatch.
 *
 * PERF: getDiscoverHome(), getHeroAds(), getAuthedUser(), getFeaturedScenes(),
 * listHomeScenarios(), and getHomeWorldTeaser() are six independent reads
 * with no data dependency between them, run concurrently via Promise.all.
 * getHomeWorldTeaser() sits in this batch rather than the user-gated one
 * below because it's public-read (same as the World hub itself) and has
 * no dependency on `user`. The user-gated getUserFeed/getHomeContext/
 * getHomeHeroContext trio still has to wait on `user` since none of them
 * can run until getAuthedUser() resolves, but run concurrently with each
 * other once it does.
 *
 * LEGENDARY-SCENES FIX: the Scene Builder (/world/locations/[slug], see
 * SceneStudio) generates a location's single most expensive artifact —
 * a rendered image, optionally with Kling video — but until now the
 * only way to see one was already knowing which city to visit. Home had
 * no cross-world surface for it at all. getFeaturedScenes() (a thin
 * wrapper over getFeaturedUniverseScenes in world-atlas.ts) pulls the
 * platform's most production-valuable scenes — video + faction tie-in +
 * capital-city setting + cast size, since there's no likes/views column
 * to rank by actual popularity yet — into a "Legendary Scenes" row that
 * links each tile straight into that location's page.
 *
 * EXPLORE-CHARACTERS FIX: FeatureStrip (the static "Persistent Memory /
 * Proactive Messages / ..." capability band) is replaced by
 * ExploreCharacters — filter-pill tabs (For You/Trending/New/gender/
 * tag) over real character data instead of marketing copy. See
 * explore-characters.tsx.
 * The persistent left sidebar (already documented in sidebar.tsx as a
 * deliberate replacement for a top nav) is untouched — this file only
 * concerns the scrollable Home content.
 *
 * 0.3.1 FIX (supersedes HERO-REMOVED below): (app)/layout.tsx no longer
 * redirects a signed-out visitor away from "/" — it renders this page
 * inside a PublicHeader shell instead (see the layout's own 0.3.1 FIX
 * comment). So this route now genuinely has two audiences, and the top
 * of the page needs to serve whichever one showed up: a returning user
 * with real data to surface, or a first-time visitor with none. `user`
 * below is the switch — AnonHero renders only when it's null, and every
 * data-driven section beneath it already degrades to an empty state on
 * its own (WhileYouWereAway/HeroSplit don't render at all with no
 * entries; FeaturedCompanions/ExploreExperiences pull from
 * allCharacters, which getDiscoverHome() already serves without
 * requiring a session — PopularScenarios pulls from listHomeScenarios(),
 * which requires no session either since the catalog is public-read).
 *
 * HERO-REMOVED (historical): the original Hero/HeroCarousel components
 * ("Create your AI Companion and never talk alone again," generic Create
 * Now / Explore Companions CTAs pointed at auth-only /studio and
 * /characters) were pulled from this page because it used to render only
 * for authenticated users. AnonHero is a new, small component rather than
 * reviving Hero/HeroCarousel as-is — it needed public-safe CTAs
 * (/login?mode=sign-up, /discover) instead of the auth-only routes Hero
 * still points at, and Hero's desktop grid + mobile carousel + portrait
 * image already serve a different purpose (showcasing one specific
 * featured character) that duplicates the FeaturedCompanions grid a few
 * sections down this same page. Hero/HeroCarousel are left in place
 * unmodified in case that fuller pitch is wanted elsewhere later.
 *
 * FAKE-DATA FIX: HomeSideRail's "thinking of you" widget and
 * ContinueYourStories previously both derived from `allCharacters` (the
 * generic discover pool) — an arbitrary character standing in for
 * "someone who reached out," and a hashed fake progress percentage
 * standing in for real conversation activity. getHomeContext() now
 * supplies both from real rows (character_initiatives, conversations),
 * consumed today by HeroSplit/Greeting (see PREMIUM-HERO FIX above).
 *
 * POPULAR-SCENARIOS-DB FIX: PopularScenarios used to render a hardcoded
 * 4-item array with no path from a new `roleplay_scenarios` row to this
 * page short of editing that component directly (see its own doc
 * comment). listHomeScenarios() (lib/roleplay/scenarios.ts) now supplies
 * the real, currently-active catalog — universal and faction/location-
 * scoped alike — so newly added scenarios (see
 * 20261210_expanded_romance_scenarios.sql) surface here automatically.
 */
// SEO-HOMEPAGE-FIX: "/" is the top of the acquisition funnel (see
// sitemap.ts/robots.ts's own comments on this) but was the one public
// page NOT going through generateSEOMeta() like every other page
// (/about, /blog, /discover, landing pages, companion pages) — it fell
// back to root layout.tsx's bare title/description with no per-page
// OpenGraph image, no Twitter card, and no canonical tag. That meant
// link previews on Twitter/Discord/Telegram (all three already listed
// in generateOrganizationSchema's sameAs) rendered blank for the site's
// single highest-traffic URL. Root layout's title/description are kept
// in sync here rather than duplicated ad hoc, so brand copy has one
// source of truth; only the OG/Twitter/canonical layer is new.
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
    worldTeaser,
  ] = await Promise.all([
    getDiscoverHome(),
    // Default limit (8) undercounts now that 7 code:* slides
    // (20261215/20261218_seed_code_promo_ads.sql) plus 5 baked-creative
    // rows (20261220_seed_baked_hero_ad_creatives.sql) are all active in
    // 'hero' — 8 would silently drop the oldest 4 out of rotation every
    // render (order is created_at desc). 16 comfortably covers today's
    // total with headroom for a few more before this needs revisiting.
    getHeroAds(16),
    getAuthedUser(),
    getFeaturedScenes(10),
    listHomeScenarios(12),
    getHomeWorldTeaser(),
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

  return (
    <div className="pb-2 md:pb-8">
      <Greeting
        name={heroContext?.displayName ?? null}
        pendingInitiative={topInitiative}
        recentChatsCount={recentChats.length}
      />

      {/* STATUS-RING FIX: `avatars` (image/gallery urls per character) has
          always come back from getDiscoverHome() — the API route builds
          it specifically to feed this ring + its full-screen story
          viewer — but nothing rendered it until now. See
          character-status-ring.tsx. */}
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
          <FeaturedCompanions characters={allCharacters.slice(0, 12)} />
        </div>
      </section>

      {/* CTA-POSITION-FIX (2026-09-05, item #13): this component's own
          header comment says it "replaces PremiumBanner in the homepage
          slot below Featured Companions" — it had drifted down to
          second-to-last, after Creators You Follow, twelve sections deep.
          On mobile that's a long scroll past Featured Showcase, Featured
          Companions, Explore Experiences, Popular Scenarios, Featured
          Scenes, Explore Characters, Your World, and Creators You Follow
          before the one CTA slide-carousel on this page ever enters view —
          the bottom-nav Premium tab is the only premium touchpoint most
          mobile sessions would ever scroll far enough to reach otherwise.
          Restored to the slot the comment already describes. */}
      <HeroAdsCarousel ads={heroAds} />

      <MotionWrapper><ExploreExperiences experiences={experiences} /></MotionWrapper>
      <MotionWrapper><PopularScenarios scenarios={popularScenarios} /></MotionWrapper>
      <MotionWrapper><FeaturedScenes scenes={featuredScenes} /></MotionWrapper>
      {/* PERF: capped at 24 rather than the full allCharacters pool —
          the grid only ever renders 10, and this array crosses the
          server/client boundary as serialized RSC payload, so there's
          no reason to ship rows it'll never use. Still enough headroom
          for the client-side New-tab filter (is_new) to usually find
          matches — Trending no longer draws from this pool at all, see
          explore-characters.tsx's own comment. */}
      <MotionWrapper><ExploreCharacters initial={allCharacters.slice(0, 24)} /></MotionWrapper>
      <MotionWrapper><YourWorld teaser={worldTeaser} /></MotionWrapper>
      <MotionWrapper><CreatorsYouFollow creators={creators} /></MotionWrapper>
      {/* FEATURES-ON-HOME FIX: PlatformFeatures ("Beyond the chat" —
          Dating, World, Community, Studio, Digital Twin) previously only
          rendered on the signed-out LandingPage. A returning,
          authenticated visitor never sees LandingPage at all (see the
          !user branch above), so this whole grid — and the empty gap it
          leaves — was missing from Home entirely, right above what used
          to be a bare Footer. Rendered here, in the same slot LandingPage
          uses it (just before Footer), with real in-app hrefs since this
          audience is already signed in. */}
      <MotionWrapper><PlatformFeatures /></MotionWrapper>
      <Footer />
    </div>
  );
}
