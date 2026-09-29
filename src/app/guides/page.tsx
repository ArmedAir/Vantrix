import Link from "next/link";
import { PublicHeader } from "@/components/public/public-header";
import { GUIDES } from "@/lib/guides/posts";
import { generateSEOMeta } from "@/lib/seo/meta";

export const metadata = generateSEOMeta({
  title: "Guides | Vantrix",
  description:
    "Practical guides on choosing an AI companion app: memory, character creation, and honest comparisons against Candy AI, Character.AI, Nomi, Kindroid, and Replika.",
  path: "/guides",
  keywords: [
    "AI companion guides",
    "AI companion comparison",
    "best AI companion apps",
  ],
});

export default function GuidesPage() {
  return (
    <div className="min-h-screen bg-base">
      <PublicHeader />
      <main className="max-w-2xl mx-auto px-4 md:px-8 py-16">
        <h1 className="font-display text-3xl text-text-primary">Guides</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
          How to actually evaluate an AI companion app — memory, character
          depth, and honest comparisons against the most-searched
          alternatives.
        </p>

        <div className="mt-10 space-y-8">
          {GUIDES.map((guide) => (
            <article
              key={guide.slug}
              className="border-b border-border-hairline pb-8 last:border-none"
            >
              <Link href={`/guides/${guide.slug}`} className="group">
                <h2 className="font-display text-xl text-text-primary group-hover:text-gold-400 transition-colors">
                  {guide.title}
                </h2>
              </Link>
              <p className="mt-2 text-sm text-text-tertiary">
                {new Date(guide.datePublished).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}{" "}
                · {guide.readingTime}
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
                {guide.description}
              </p>
              <Link
                href={`/guides/${guide.slug}`}
                className="mt-3 inline-block text-sm font-semibold text-gold-400 hover:text-gold-300"
              >
                Read more →
              </Link>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
