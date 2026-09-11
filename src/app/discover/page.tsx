import Link from "next/link";
import { getDiscoverHome } from "@/lib/frontend/discover";
import { resolveImageSrc } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/public/public-header";
import { generateSEOMeta } from "@/lib/seo/meta";
import { DiscoverAudienceGrid } from "@/components/home/discover-audience-grid";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { getPublicTags } from "@/lib/seo/public-tag";

/**
 * ROUTING-FIX (0.1/0.3.2/1.1): vercel /home, the SEO landing CTA, the
 * registration reminder, and structured-data search URLs all pointed at
 * "/discover" — which was never an actual App Router page, only
 * /api/discover. This page closes that gap using the existing
 * getDiscoverHome() Server Component helper (@/lib/frontend/discover),
 * which already wraps GET /api/discover/featured and fails soft to an
 * empty-but-valid shape.
 *
 * Works for logged-out visitors: /api/discover/featured never requires a
 * session (its NSFW gate already excludes is_nsfw content for anyone who
 * isn't age-verified + opted in — see resolveNsfwDiscoveryAccess()), so
 * this is safe as the top of the public acquisition funnel
 * (landing /discover character signup) described in the audit.
 *
 * PERF FIX (2026-09-03): was `force-dynamic`, meaning every visitor —
 * including every crawler/bot hit on this SEO landing page, per its own
 * purpose above — paid a full fresh server render + getDiscoverHome()
 * round-trip with zero caching. Nothing on this page is session- or
 * cookie-scoped (DiscoverCharacter has no per-user fields — like_count/
 * follower_count are global stats, not "did I like this"; confirmed via
 * lib/frontend/discover.ts), and this route sits outside the (app) route
 * group, so — unlike /world, /chats, etc. — it doesn't inherit a
 * session-checking parent layout that would force dynamic rendering
 * regardless of this export. Switched to ISR: same content served from
 * cache for up to 2 minutes instead of hitting the DB/API on every
 * request, then revalidated in the background. 2 minutes balances real
 * cache benefit against the "New"/featured-rotation badges and `is_live`
 * status not being instantaneous — acceptable staleness for a discovery
 * landing page, not for anything session-scoped.
 */
export const revalidate = 120;

export const metadata = generateSEOMeta({
  title: "Discover AI Companions | Vantrix",
  description:
    "Browse Vantrix's AI companions — each with their own personality, memory, and story. Start a conversation free, no card required.",
  path: "/discover",
  keywords: ["discover AI companions", "browse AI characters"],
});

/**
 * Static FAQ copy for this page. Deliberately plain text, no
 * generateFAQSchema()/safeJsonLd() <script> tag: that helper needs a
 * per-request CSP nonce (see src/middleware.ts's buildCsp()), but this
 * page is intentionally ISR-cached (`revalidate = 120`, no headers()/
 * cookies() calls — see the PERF FIX comment above). A nonce baked into
 * cached HTML would go stale the moment middleware issues a new nonce on
 * the next request, and the browser would block the mismatched script —
 * silently losing the rich-snippet markup, not a security bug, but not
 * worth it for FAQ schema specifically. The visible copy below still
 * carries the SEO/conversion value; only the structured-data markup is
 * skipped here. (companions/[id] and (seo)/[landing] are both
 * force-dynamic, so they don't have this conflict.)
 */
const FAQS = [
  {
    question: "Is Vantrix free to use?",
    answer:
      "Yes. Every companion on Vantrix is free to start chatting with — no card required. Premium tiers unlock unlimited messages, calls, and image generation once you're ready to go deeper.",
  },
  {
    question: "Do I need to sign up before I can talk to a character?",
    answer:
      "No. Tap any companion below to start a real conversation right away. You'll only be asked to create an account once you want to continue past the free preview.",
  },
  {
    question: "What makes Vantrix companions different from a regular chatbot?",
    answer:
      "Each companion has a persistent personality, memory of your past conversations, and relationships that evolve over time — not a fresh, forgetful chat every session.",
  },
  {
    question: "Can I choose a companion based on gender or style?",
    answer:
      "Yes — use the Girls, Guys, and Anime filters above the grid to browse companions suited to what you're looking for, or leave it on All to see everyone.",
  },
];

export default async function DiscoverPage() {
 const [{ featured, allCharacters }, tags] = await Promise.all([
   getDiscoverHome(),
   getPublicTags(),
 ]);
 const hero = featured[0];

 return (
 <div className="min-h-screen bg-base">
 <PublicHeader />

 <section className="px-4 md:px-8 pt-14 pb-10 text-center max-w-2xl mx-auto">
 <h1 className="font-display text-3xl md:text-4xl tracking-tight text-text-primary">
 Meet your next companion.
 </h1>
 <p className="mt-4 text-text-secondary text-[15px] leading-relaxed">
 Every character on Vantrix remembers your conversations and grows
 with you. Pick someone who fits your mood — chatting is free to
 start.
 </p>
 <Button asChild size="md" className="mt-7">
 <Link href="/login?mode=sign-up">Start free</Link>
 </Button>
 </section>

 {hero && (
 <section className="px-4 md:px-8 pb-10">
 <div className="max-w-5xl mx-auto rounded-lg overflow-hidden border border-border-hairline relative aspect-[16/7] hidden md:block">
 <Image
 src={resolveImageSrc(hero.image)}
 alt={hero.title}
 fill
 sizes="1024px"
 className="object-cover"
 priority
 />
 <div className="absolute inset-0 flex flex-col justify-end p-8">
 <span className="text-xs uppercase tracking-wide text-gold-400 font-semibold">
 {hero.badge}
 </span>
 <h2 className="font-display text-2xl text-white mt-1">
 {hero.title}
 </h2>
 <p className="text-white/70 text-sm mt-1 max-w-md">
 {hero.subtitle}
 </p>
 </div>
 </div>
 </section>
 )}

 <DiscoverAudienceGrid initial={allCharacters} />

 {tags.length > 0 && (
   <section className="px-4 md:px-8 pb-16 max-w-5xl mx-auto">
     <h2 className="font-display text-lg text-text-primary mb-4">
       Browse by personality
     </h2>
     {/* Real in-app discovery surface for character.tags, not just a
         crawl-only page — before this, /tags/[tag] existed for search
         engines but no logged-out UI ever linked to it. Top 20 by
         count (getPublicTags() is already sorted that way) keeps this
         to genuinely populated tags rather than a wall of one-character
         labels. */}
     <div className="flex flex-wrap gap-2">
       {tags.slice(0, 20).map((tag) => (
         <Link
           key={tag.slug}
           href={`/tags/${tag.slug}`}
           className="px-3 py-1.5 rounded-full border border-border-hairline text-sm text-text-secondary hover:text-text-primary hover:border-gold-500 transition-colors"
         >
           {tag.label}
         </Link>
       ))}
     </div>
   </section>
 )}

 <section className="px-4 md:px-8 py-14 border-t border-border-hairline max-w-3xl mx-auto">
 <h2 className="font-display text-2xl text-text-primary text-center mb-10">
 Frequently asked questions
 </h2>
 <div className="space-y-7">
 {FAQS.map((f) => (
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
 </div>
 );
}
