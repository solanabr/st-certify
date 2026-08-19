"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, type TranslationKey } from "@/lib/i18n";

const STEPS: ReadonlyArray<{ n: number; labelKey: TranslationKey }> = [
  { n: 1, labelKey: "admin.step.details" },
  { n: 2, labelKey: "admin.step.signers" },
  { n: 3, labelKey: "admin.step.template" },
  { n: 4, labelKey: "admin.step.designer" },
  { n: 5, labelKey: "admin.step.review" },
];

interface Props {
  current: number;
  /** Steps not part of the current path render dimmed/unreachable, not hidden — e.g. step 4 (designer) only applies to the custom-template path; the default one-click path goes 3 -> 5 and passes `skip={[4]}`. */
  skip?: readonly number[];
}

export function WizardStepper({ current, skip = [] }: Props) {
  const { t } = useT();

  return (
    <ol className="flex items-center" aria-label={t("admin.stepper.ariaLabel")}>
      {STEPS.map((step, i) => (
        <li key={step.n} className="flex flex-1 items-center last:flex-none">
          <div
            className={cn(
              "flex flex-col items-center gap-1.5",
              skip.includes(step.n) && "opacity-40",
            )}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                step.n < current &&
                  "border-success bg-success text-success-foreground",
                step.n === current && "border-primary text-primary",
                step.n > current && "border-border text-muted-foreground",
              )}
              aria-current={step.n === current ? "step" : undefined}
            >
              {step.n < current ? <Check className="size-3.5" /> : step.n}
            </span>
            <span className="hidden text-[11px] text-muted-foreground sm:block">
              {t(step.labelKey)}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                "mx-2 h-px flex-1",
                step.n < current ? "bg-success" : "bg-border",
              )}
              aria-hidden="true"
            />
          )}
        </li>
      ))}
    </ol>
  );
}
