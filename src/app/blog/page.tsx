import Link from "next/link";
import { PublicHeader } from "@/components/public/public-header";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { generateSEOMeta } from "@/lib/seo/meta";

export const metadata = generateSEOMeta({
  title: "Blog | Vantrix",
  description:
    "Writing on AI companion memory, persistent characters, and how Vantrix's living universe works — from the Vantrix team.",
  path: "/blog",
  keywords: ["AI companion memory", "AI companion blog", "persistent AI characters"],
});

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-base">
      <PublicHeader />
      <main className="max-w-2xl mx-auto px-4 md:px-8 py-16">
        <h1 className="font-display text-3xl text-text-primary">Blog</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
          Notes on AI companion memory, persistent characters, and how the
          Vantrix universe works.
        </p>

        <div className="mt-10 space-y-8">
          {BLOG_POSTS.map((post) => (
            <article
              key={post.slug}
              className="border-b border-border-hairline pb-8 last:border-none"
            >
              <Link href={`/blog/${post.slug}`} className="group">
                <h2 className="font-display text-xl text-text-primary group-hover:text-gold-400 transition-colors">
                  {post.title}
                </h2>
              </Link>
              <p className="mt-2 text-sm text-text-tertiary">
                {new Date(post.datePublished).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}{" "}
                · {post.readingTime}
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
                {post.description}
              </p>
              <Link
                href={`/blog/${post.slug}`}
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
