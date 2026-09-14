import { Skeleton } from "@/components/ui/skeleton";

export default function StudioEarningsLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-6">
      <Skeleton className="h-5 w-20 mb-4" />
      <Skeleton className="h-8 w-40 mb-1" />
      <Skeleton className="h-4 w-72 mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-md" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
