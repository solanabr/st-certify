"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT, type TranslationKey } from "@/lib/i18n";
import type { AdminStats } from "@/lib/db/types";

const STAT_DEFS: Array<{ key: keyof AdminStats; labelKey: TranslationKey }> = [
  { key: "editionsCount", labelKey: "admin.editions" },
  { key: "pendingSignaturesCount", labelKey: "admin.stat.pendingSignatures" },
  { key: "claimedCount", labelKey: "admin.stat.claimed" },
  { key: "revokedCount", labelKey: "admin.stat.revoked" },
];

export function StatCards({
  stats,
  isLoading,
}: {
  stats: AdminStats | undefined;
  isLoading: boolean;
}) {
  const { t } = useT();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STAT_DEFS.map((def) => (
        <Card key={def.key}>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t(def.labelKey)}</p>
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
