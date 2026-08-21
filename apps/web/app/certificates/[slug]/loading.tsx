import { Skeleton } from "@/components/ui/skeleton";

export default function EditionDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Skeleton className="mb-8 aspect-[21/9] w-full rounded-xl" />
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-1/3" />
      <div className="mt-8 space-y-2">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
      <Skeleton className="mt-10 h-56 w-full rounded-xl" />
    </div>
  );
}
