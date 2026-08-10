import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/** Mirrors the verdict card: banner bar, detail rows, image block. */
export default function VerifyIdLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Skeleton className="mb-6 h-5 w-32" />
      <div className="space-y-6">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Card>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Skeleton className="col-span-2 h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
            <Skeleton className="aspect-[1600/1131] w-full rounded-lg" />
            <Skeleton className="h-5 w-48" />
          </CardContent>
        </Card>
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
