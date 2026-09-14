import { Skeleton } from "@/components/ui/skeleton";

// PERF/POLISH: this route does a Supabase fetch (character lookup) before
// ScenarioPicker's own client-side catalog fetch even starts — two
// sequential round-trips with nothing on screen for either, previously.
// Mirrors ScenarioPicker's actual grid shape so the skeleton-to-content
// swap doesn't visibly jump.
export default function NewRoleplayLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Skeleton className="h-7 w-48 mb-2" />
      <Skeleton className="h-4 w-64 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-md border border-border-hairline p-4">
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-3.5 w-full mb-1.5" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
