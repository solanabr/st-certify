import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminStats } from "@/lib/db/types";

const STAT_DEFS: Array<{ key: keyof AdminStats; label: string }> = [
  { key: "editionsCount", label: "Edições" },
  { key: "pendingSignaturesCount", label: "Assinaturas pendentes" },
  { key: "claimedCount", label: "Certificados resgatados" },
  { key: "revokedCount", label: "Revogados" },
];

export function StatCards({
  stats,
  isLoading,
}: {
  stats: AdminStats | undefined;
  isLoading: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STAT_DEFS.map((def) => (
        <Card key={def.key}>
          <CardContent>
            <p className="text-sm text-muted-foreground">{def.label}</p>
            {isLoading || !stats ? (
              <Skeleton className="mt-1 h-8 w-16" />
            ) : (
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {stats[def.key]}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
