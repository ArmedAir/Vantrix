import Link from "next/link";
import { Bot, ChevronRight, Compass, Globe2, Store, Users } from "lucide-react";

/**
 * Real, shipped surfaces beyond 1:1 chat — not aspirational copy. Each
 * links straight into its actual route (gated the same way character
 * cards already are) so "beyond the chat" isn't a marketing claim with
 * nowhere to land.
 *
 * PLATFORM-FEATURES-EXTRACT FIX: this grid used to live only inside
 * landing-page.tsx (the signed-out marketing homepage), so a returning,
 * already-authenticated visitor — who never sees LandingPage at all,
 * see (app)/page.tsx's HomePage — had no surface on Home that pointed
 * at Dating, World, Community, Studio, or Digital Twin. Extracted here
 * so both LandingPage and the authenticated Home page render the same
 * feature grid from one source instead of the signed-in surface simply
 * missing it.
 */
export const PLATFORM_FEATURES = [
  {
    icon: Compass,
    title: "Dating & compatibility",
    body: "Chemistry reads, date-night forecasts, and milestones that track how a relationship is actually going — not just a match score.",
    cta: "See how matching works",
    href: "/dating",
  },
  {
    icon: Globe2,
    title: "A living world",
    body: "Factions, locations, and elections that keep moving on their own. Characters can carry titles and legends from it back into your story.",
    cta: "Step into the world",
    href: "/world",
  },
  {
    icon: Users,
    title: "Community",
    body: "A discussion space for every character, faction, and location, plus a general hub for everyone building and talking here.",
    cta: "Browse the community",
    href: "/community",
  },
  {
    icon: Store,
    title: "Character marketplace",
    body: "Publish what you build in the Studio. The market ranks the community's characters so the best ones don't stay hidden.",
    cta: "Open the Studio",
    href: "/studio",
  },
  {
    icon: Bot,
    title: "Digital Twin",
    body: "A private AI modeled on you instead of a character — trained on your own words and kept separate from every companion conversation.",
    cta: "Learn about Digital Twin",
    href: "/digital-twin",
    badge: "Premium",
  },
] as const;

export function PlatformFeatures({
  hrefFor = (href: string) => href,
}: {
  /** Lets a signed-out caller (LandingPage) route each card through its
   * own /login?mode=sign-up&redirect=... helper instead of the raw path. */
  hrefFor?: (href: string) => string;
}) {
  return (
    <section id="features" className="px-5 pb-24 md:px-8 md:pb-32">
      <div className="mx-auto max-w-[1320px]">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-500">Beyond the chat</p>
          <h2 className="mt-4 font-display text-4xl leading-tight tracking-[-0.03em] md:text-5xl">One character. A whole world around them.</h2>
          <p className="mt-5 text-base leading-7 text-text-secondary md:text-lg">Vantrix isn&apos;t only a conversation window. It&apos;s dating, a shared universe, a community, and a marketplace for what people build.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORM_FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.title}
                href={hrefFor(feature.href)}
                className="group flex flex-col rounded-lg border border-border-hairline bg-base shadow-card p-6 transition-colors ease-premium hover:border-gold-500/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-md border border-gold-500/20 bg-gold-500/[0.05] text-gold-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  {"badge" in feature && feature.badge && (
                    <span className="rounded-full border border-gold-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-gold-400">{feature.badge}</span>
                  )}
                </div>
                <h3 className="mt-5 font-display text-xl">{feature.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-text-secondary">{feature.body}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-400 transition-colors ease-premium group-hover:text-gold-300">
                  {feature.cta}
                  <ChevronRight className="h-4 w-4" />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
