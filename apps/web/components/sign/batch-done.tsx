"use client";

import Link from "next/link";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { BatchSummary } from "./ceremony";

/**
 * What a finished batch accomplished (spec §6.4), rendered above the queue the
 * signer just worked through.
 *
 * It states the failures as plainly as the successes: a partial run leaves rows
 * still waiting in the table below, and a signer who reads only "assinados" and
 * closes the tab would leave students stranded.
 *
 * `showEditionLinks` gates the per-edition pipeline links, which live under
 * `/studio` — a signer who isn't an admin has no access there, and offering
 * them a link into a 404 is worse than offering none.
 */
export function BatchDone({
  summary,
  showEditionLinks,
  onDismiss,
}: {
  summary: BatchSummary;
  showEditionLinks: boolean;
  onDismiss: () => void;
}) {
  const { t } = useT();
  const failed = summary.failed > 0;
  const none = summary.signed === 0;

  const title = none
    ? t("sign.done.noneTitle")
    : failed
      ? t("sign.done.partialTitle", {
          signed: summary.signed,
          failed: summary.failed,
        })
      : t(summary.signed === 1 ? "sign.done.title" : "sign.done.titleMany", {
          count: summary.signed,
        });

  const body = none
    ? t("sign.done.noneBody")
    : failed
      ? t("sign.done.partialBody")
      : t("sign.done.body");

  return (
    <section
      aria-live="polite"
      className="elevate relative mt-6 rounded-xl border border-border bg-card p-5"
    >
      <div className="flex items-start gap-3 pr-8">
        {none || failed ? (
          <CircleAlert
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0 text-primary"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-medium tabular-nums">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>

          {summary.signed > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {summary.editions
                .filter((edition) => edition.signed > 0)
                .map((edition) => (
                  <li
                    key={edition.editionAddress}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                  >
                    <span className="tabular-nums">
                      {t("sign.done.perEdition", {
                        count: edition.signed,
                        edition: edition.editionName,
                      })}
                    </span>
                    {showEditionLinks && (
                      <Button
                        asChild
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                      >
                        <Link
                          href={`/studio/editions/${edition.editionAddress}`}
                        >
                          {t("sign.done.openEdition", {
                            edition: edition.editionName,
                          })}
                        </Link>
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="absolute right-3 top-3"
        onClick={onDismiss}
      >
        <X className="size-4" aria-hidden="true" />
        <span className="sr-only">{t("sign.done.dismiss")}</span>
      </Button>
    </section>
  );
}
