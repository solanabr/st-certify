import { Skeleton } from "@/components/ui/skeleton";

/** Loading state — mirrors the grouped-table layout (webapp-polish: skeletons match final shape). */
export function InboxSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      {[0, 1].map((group) => (
        <div key={group} className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="space-y-2 rounded-xl border border-border p-4">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-4">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-5 w-40" />
                <Skeleton className="ml-auto h-5 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
