"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { CertificateForOwner, EditionSignerSummary } from "@/lib/db/types";

type StepState = "done" | "current" | "pending";

type Step = { key: string; label: string; state: StepState };

function isSignerDone(
  cert: CertificateForOwner,
  signer: EditionSignerSummary,
): boolean {
  return (cert.signerBitmap & (1 << signer.position)) !== 0;
}

/** The numbered/checked node. Identical in both orientations. */
function StepMark({ step, index }: { step: Step; index: number }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
        step.state === "done" &&
          "border-success bg-success text-success-foreground",
        step.state === "current" && "border-primary text-primary",
        step.state === "pending" && "border-border text-muted-foreground",
      )}
      aria-hidden="true"
    >
      {step.state === "done" ? <Check className="size-3.5" /> : index + 1}
    </span>
  );
}

function connectorTone(state: StepState): string {
  return state === "done" ? "bg-success" : "bg-border";
}

/**
 * Solicitado -> Assinaturas -> Pronto -> Emissão -> Concluído, with the
 * Assinaturas node expanded into a per-signer checklist read straight from
 * signed_mask x edition signers — nothing here is a client-side guess, every
 * state is derived from the mirror (itself only ever written from confirmed
 * chain reads), so a reload always reconstructs the true progress.
 */
export function StatusTimeline({ cert }: { cert: CertificateForOwner }) {
  const { t } = useT();
  const allSigned =
    cert.editionSigners.length > 0 &&
    cert.editionSigners.every((s) => isSignerDone(cert, s));
  const isFullySigned =
    cert.status === "FullySigned" || cert.status === "Claimed";
  const isClaimed = cert.status === "Claimed";
  const isMinting = isClaimed && !cert.asset;
  const isDone = isClaimed && Boolean(cert.asset);

  const steps: Step[] = [
    { key: "requested", label: t("student.timeline.requested"), state: "done" },
    {
      key: "signatures",
      label: t("student.timeline.signatures"),
      state: allSigned || isFullySigned ? "done" : "current",
    },
    {
      key: "ready",
      label: t("student.timeline.ready"),
      state: isFullySigned ? "done" : "pending",
    },
    {
      key: "issuance",
      label: t("student.timeline.issuance"),
      state: isDone ? "done" : isMinting ? "current" : "pending",
    },
    {
      key: "complete",
      label: t("student.timeline.complete"),
      state: isDone ? "done" : "pending",
    },
  ];

  return (
    <div>
      {/* Phones: five 64px-wide labels plus their connectors do not fit a 393px
          viewport, so the same steps run top-to-bottom with the label beside
          each node instead of squeezed under it. */}
      <ol
        className="flex flex-col sm:hidden"
        aria-label={t("student.timeline.aria")}
      >
        {steps.map((step, i) => (
          <li key={step.key} className="flex gap-3">
            {/* Stretches to the row's full height so the connector reaches the
                next node — the label's padding is what sets that height. */}
            <div className="flex flex-col items-center self-stretch">
              <StepMark step={step} index={i} />
              {i < steps.length - 1 && (
                <div
                  className={cn("my-1 w-px flex-1", connectorTone(step.state))}
                  aria-hidden="true"
                />
              )}
            </div>
            <span
              className={cn(
                "text-sm text-muted-foreground",
                i < steps.length - 1 && "pb-4",
              )}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      <ol
        className="hidden items-start sm:flex"
        aria-label={t("student.timeline.aria")}
      >
        {steps.map((step, i) => (
          <li
            key={step.key}
            className="flex flex-1 items-center last:flex-none"
          >
            <div className="flex flex-col items-center gap-1.5">
              <StepMark step={step} index={i} />
              <span className="w-16 text-center text-[11px] text-muted-foreground">
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn("mx-1 h-px flex-1", connectorTone(step.state))}
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>

      {cert.editionSigners.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
          {cert.editionSigners.map((signer) => {
            const done = isSignerDone(cert, signer);
            return (
              <li
                key={signer.wallet}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    done
                      ? "border-success bg-success text-success-foreground"
                      : "border-border",
                  )}
                  aria-hidden="true"
                >
                  {done && <Check className="size-2.5" />}
                </span>
                <span
                  className={done ? "text-foreground" : "text-muted-foreground"}
                >
                  {signer.name}
                </span>
                <span className="sr-only">
                  {done
                    ? t("student.timeline.signed")
                    : t("student.timeline.awaitingSignature")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
