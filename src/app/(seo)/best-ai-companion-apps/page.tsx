import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import {
  BEST_COMPANION_APPS,
  BEST_COMPANION_APPS_FAQS,
} from "@/lib/seo/best-companion-apps";
import {
  generateFAQSchema,
  generateItemListSchema,
  safeJsonLd,
} from "@/lib/seo/structured";
import { generateSEOMeta } from "@/lib/seo/meta";
import { PublicHeader } from "@/components/public/public-header";
import { Footer } from "@/components/home/footer";
import { Button } from "@/components/ui/button";

/**
 * Standalone roundup page ranking Vantrix against the AI companion apps
 * it's most often searched/compared against. Not part of LANDING_PAGES /
 * app/(seo)/[landing]/page.tsx ? see best-companion-apps.ts's own comment
 * for why a ranked-list-of-products page needs its own shape rather than
 * being forced into that single-product schema.
 *
 * force-dynamic for the same reason as [landing]/page.tsx and sitemap.ts/
 * robots.ts: everything here is static config, but the site-wide convention
 * (see those files' own comments) is to avoid a route silently serving a
 * stale build after config changes, and this page has no per-request data
 * that would otherwise justify static rendering anyway.
 */
export const dynamic = "force-dynamic";

const PATH = "/best-ai-companion-apps";

export function generateMetadata(): Metadata {
  return generateSEOMeta({
    title: "Best AI Companion Apps in 2026 ? Compared | Vantrix",
    description:
      "The AI companion apps people compare most, ranked: memory, roster depth, pricing, and what each one is actually best for.",
    keywords: [
      "best ai companion apps",
      "best ai girlfriend app",
      "best ai chat app",
      "ai companion apps compared",
      "ai girlfriend apps 2026",
    ],
    path: PATH,
  });
}

export default async function BestCompanionAppsPage() {
  const nonce = (await headers()).get("x-nonce");

  const faqSchema = generateFAQSchema(BEST_COMPANION_APPS_FAQS);
  const itemListSchema = generateItemListSchema(
    BEST_COMPANION_APPS.map((app) => ({
      name: app.name,
      url: app.isVantrix ? "/" : app.altPageSlug ? `/${app.altPageSlug}` : undefined,
    })),
  );

  return (
    <div className="min-h-screen bg-base">
      {/* eslint-disable-next-line @next/next/no-sync-scripts -- static JSON-LD, escaped via safeJsonLd */}
      <script
        type="application/ld+json"
        nonce={nonce ?? undefined}
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqSchema) }}
      />
      {/* eslint-disable-next-line @next/next/no-sync-scripts -- static JSON-LD, escaped via safeJsonLd */}
      <script
        type="application/ld+json"
        nonce={nonce ?? undefined}
        dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListSchema) }}
      />

      <PublicHeader />

      {/* Hero */}
      <section className="px-4 md:px-8 pt-14 pb-10 text-center max-w-3xl mx-auto">
        <span className="inline-block text-xs font-bold tracking-[0.2em] uppercase text-gold-500 mb-4">
          Comparison
        </span>
        <h1 className="font-display text-3xl md:text-5xl leading-[1.1] text-text-primary">
          Best AI Companion Apps,{" "}
          <span className="whitespace-nowrap">Compared</span>
        </h1>
        <p className="mt-4 text-gold-400 font-semibold text-lg">
          What each one is actually best for ? not just a list of names.
        </p>
        <p className="mt-5 text-text-secondary text-[15px] leading-relaxed max-w-2xl mx-auto">
          There are a lot of AI companion apps, and most roundups just list
          logos. Here&rsquo;s what each of the apps people compare most
          actually does well, starting with what Vantrix was built around:
          persistent memory and a world that keeps evolving.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/login?mode=sign-up">Try Vantrix Free</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/discover">Browse companions</Link>
          </Button>
        </div>
      </section>

      {/* Ranked list */}
      <section className="px-4 md:px-8 pb-16 max-w-3xl mx-auto space-y-6">
        {BEST_COMPANION_APPS.map((app) => (
          <div
            key={app.name}
            className={`rounded-lg border p-6 ${
              app.isVantrix ? "border-gold-500/50" : "border-border-hairline"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs font-bold tracking-widest uppercase text-text-secondary">
                  #{app.rank}
                </span>
                <h2 className="font-display text-xl text-text-primary mt-1">
                  {app.name}
                </h2>
                <p className="text-gold-400 text-sm font-medium mt-0.5">
                  {app.tagline}
                </p>
              </div>
              {app.isVantrix && (
                <span className="shrink-0 rounded-full bg-gold-500 text-[#160F02] text-xs font-bold px-3 py-1">
                  Our pick
                </span>
              )}
            </div>

            <dl className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-text-secondary font-semibold">
                  Known for
                </dt>
                <dd className="text-text-primary mt-0.5">{app.knownFor}</dd>
              </div>
              <div>
                <dt className="text-text-secondary font-semibold">
                  Best for
                </dt>
                <dd className="text-text-primary mt-0.5">{app.bestFor}</dd>
              </div>
            </dl>

            <ul className="mt-4 space-y-1.5">
              {app.highlights.map((h) => (
                <li
                  key={h}
                  className="text-text-secondary text-sm leading-relaxed pl-4 relative before:content-['?'] before:absolute before:left-0 before:text-gold-500"
                >
                  {h}
                </li>
              ))}
            </ul>

            {app.isVantrix ? (
              <div className="mt-5">
                <Button asChild size="sm">
                  <Link href="/login?mode=sign-up">Start free</Link>
                </Button>
              </div>
            ) : app.altPageSlug ? (
              <div className="mt-5">
                <Link
                  href={`/${app.altPageSlug}`}
                  className="text-sm font-medium text-gold-500 hover:text-gold-400"
                >
                  See how Vantrix compares to {app.name} &rarr;
                </Link>
              </div>
            ) : null}
          </div>
        ))}
      </section>

      {/* FAQ */}
      <section className="px-4 md:px-8 py-14 border-t border-border-hairline max-w-3xl mx-auto">
        <h2 className="font-display text-2xl text-text-primary text-center mb-10">
          Frequently asked questions
        </h2>
        <div className="space-y-7">
          {BEST_COMPANION_APPS_FAQS.map((f) => (
            <div key={f.question}>
              <h3 className="text-text-primary font-semibold text-[15px] mb-1.5">
                {f.question}
              </h3>
              <p className="text-text-secondary text-sm leading-relaxed">
                {f.answer}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 md:px-8 py-16 border-t border-border-hairline text-center">
        <h2 className="font-display text-2xl md:text-3xl text-text-primary mb-2">
          See why Vantrix comes out on top.
        </h2>
        <p className="text-text-secondary mb-7">
          Free to start &mdash; no card needed.
        </p>
        <Button asChild size="lg">
          <Link href="/login?mode=sign-up">Start Free</Link>
        </Button>
      </section>

      <Footer />
    </div>
  );
}
