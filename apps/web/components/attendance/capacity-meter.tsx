"use client";

import { Progress } from "@/components/ui/progress";
import {
  ATTENDANCE_TREE_CAPACITY,
  capacityLevel,
  type CapacityLevel,
} from "@/lib/attendance/constants";
import { cn } from "@/lib/utils";

// Recolor the Progress fill by severity band via a descendant utility targeting
// the indicator's data-slot — the descendant selector out-specifies the
// component's default `bg-primary`. All three are brand theme tokens.
const INDICATOR_BY_LEVEL: Record<CapacityLevel, string> = {
  ok: "[&_[data-slot=progress-indicator]]:bg-success",
  warn: "[&_[data-slot=progress-indicator]]:bg-warning",
  critical: "[&_[data-slot=progress-indicator]]:bg-destructive",
};

/**
 * Tree/supply usage meter (P1-5). Pass a raw count and a max (defaults to the
 * shared tree capacity); the fill color crosses to amber at the WARN threshold
 * and red at CRITICAL. Caller supplies the label so this stays i18n-agnostic —
 * omit it for the compact per-row variant, which shows only the count.
 */
export function CapacityMeter({
  value,
  max = ATTENDANCE_TREE_CAPACITY,
  label,
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  className?: string;
}) {
  const level = capacityLevel(max > 0 ? value / max : 0);

  return (
    <div className={cn("space-y-1", className)}>
      <div
        className={cn(
          "flex items-center gap-2 text-sm",
          label ? "justify-between" : "justify-end",
        )}
      >
        {label && <span className="text-muted-foreground">{label}</span>}
        <span className="font-medium tabular-nums">
          {value.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <Progress
        value={value}
        max={max}
        aria-label={label ?? `${value} / ${max}`}
        className={INDICATOR_BY_LEVEL[level]}
      />
    </div>
  );
}
