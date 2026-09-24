import { Crown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function PremiumLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 py-10">
      <div className="text-center max-w-lg mx-auto">
        <div className="h-14 w-14 mx-auto rounded-full border border-gold-500/50 flex items-center justify-center">
          <Crown className="h-6 w-6 text-gold-500" strokeWidth={1.75} />
        </div>
        {/* DUPLICATE-H1-FIX: this skeleton previously used a real <h1>
            ("Go Premium"). Next's App Router streams a Suspense fallback
            like this one into the actual server-rendered HTML alongside
            the real page content that replaces it — a browser only ever
            shows one, but a plain HTTP fetch (any crawler that doesn't
            execute JS) sees both literally present in the response body,
            which is exactly why a real crawl flagged this page with two
            <h1> tags. A skeleton is placeholder chrome, not real page
            content, so it shouldn't carry a heading role at all — same
            visual weight, now a plain <div>. */}
        <div className="font-display text-3xl text-text-primary mt-4" aria-hidden="true">Go Premium</div>
        <div className="mt-3 flex flex-col items-center gap-2">
          <Skeleton className="h-4 w-full max-w-sm" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>

      <div
        className="grid gap-5 mt-10"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))` }}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-80 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
