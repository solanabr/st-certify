"use client";

import {
  BadgeCheck,
  Ban,
  FileSignature,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT, type TranslationKey } from "@/lib/i18n";
import type { AdminStats } from "@/lib/db/types";

/** Emerald→yellow icon chip — the studio echo of the landing's ICON_CHIP. */
const STAT_CHIP =
  "flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/20";

const STAT_DEFS: Array<{
  key: keyof AdminStats;
  labelKey: TranslationKey;
  icon: LucideIcon;
}> = [
  { key: "editionsCount", labelKey: "admin.editions", icon: Layers },
  {
    key: "pendingSignaturesCount",
    labelKey: "admin.stat.pendingSignatures",
    icon: FileSignature,
  },
  { key: "claimedCount", labelKey: "admin.stat.claimed", icon: BadgeCheck },
  { key: "revokedCount", labelKey: "admin.stat.revoked", icon: Ban },
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
      {STAT_DEFS.map((def) => {
        const Icon = def.icon;
        return (
          <Card key={def.key}>
            <CardContent className="flex items-center gap-3">
              <span className={STAT_CHIP}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  {t(def.labelKey)}
                </p>
                {isLoading || !stats ? (
                  <Skeleton className="mt-1 h-7 w-12" />
                ) : (
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                    {stats[def.key]}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
