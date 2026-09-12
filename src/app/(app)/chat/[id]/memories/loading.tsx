import { Skeleton } from "@/components/ui/skeleton";

export default function ChatMemoriesLoading() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-border-hairline px-4 py-3 sticky top-0 bg-base z-10">
        <Skeleton className="h-5 w-5 rounded-xs" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex flex-col gap-3 px-4 py-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-md border border-border-hairline p-3.5">
            <Skeleton className="h-3.5 w-4/5 mb-2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
