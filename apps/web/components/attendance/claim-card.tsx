"use client";

import { useState } from "react";
import { BadgeCheck, ExternalLink, Loader2, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletPicker } from "@/components/attendance/wallet-picker";
import { useClaimInfo, useMintAttendance } from "@/hooks/useAttendanceClaim";
import { useWalletProof } from "@/hooks/useWalletProof";
import { toAppError } from "@/lib/errors";
import { useT, type TranslationKey } from "@/lib/i18n";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function formatEventDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

const GATE_COPY: Record<
  "paused" | "ended" | "exhausted",
  { title: TranslationKey; body: TranslationKey }
> = {
  paused: {
    title: "attendance.claim.paused.title",
    body: "attendance.claim.paused.body",
  },
  ended: {
    title: "attendance.claim.ended.title",
    body: "attendance.claim.ended.body",
  },
  exhausted: {
    title: "attendance.claim.exhausted.title",
    body: "attendance.claim.exhausted.body",
  },
};

/** The "you have an NFT" terminal state — shared by the just-minted and the already-claimed-on-load paths. */
function MintedNotice({
  title,
  body,
  txSig,
  viewTxLabel,
}: {
  title: string;
  body?: string;
  txSig: string | null;
  viewTxLabel: string;
}) {
  return (
    <div className="space-y-3">
      <Alert className="border-success text-success [&>svg]:text-success">
        <BadgeCheck />
        <AlertTitle>{title}</AlertTitle>
        {body && (
          <AlertDescription className="text-foreground">
            {body}
          </AlertDescription>
        )}
      </Alert>
      {txSig && (
        <a
          href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          {viewTxLabel}
        </a>
      )}
    </div>
  );
}

/**
 * Public claim page (`/attend/[token]`). Info loads via `useClaimInfo`
 * (chain-truthful: driven entirely by the GET endpoint, refetched whenever
 * the connected wallet changes so `callerClaim` reflects that wallet). Once
 * a mutation succeeds in this session, `mint.data` takes priority over the
 * background-refetched `callerClaim` so the celebratory copy sticks instead
 * of flipping to the terser "already claimed" line mid-session.
 */
export function ClaimCard({ token }: { token: string }) {
  const { t, locale } = useT();
  const proof = useWalletProof();
  const [pickerOpen, setPickerOpen] = useState(false);
  const wallet = proof.selected?.account.address ?? null;
  const info = useClaimInfo(token, wallet);
  const mint = useMintAttendance(token, proof.prove);

  if (info.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="aspect-video w-full rounded-lg" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    );
  }

  if (info.isError) {
    const appError = toAppError(info.error);
    if (appError.code === "ATTENDANCE_LINK_INVALID") {
      return (
        <Alert>
          <TriangleAlert />
          <AlertTitle>{t("attendance.claim.invalid.title")}</AlertTitle>
          <AlertDescription>
            {t("attendance.claim.invalid.body")}
          </AlertDescription>
        </Alert>
      );
    }
    // Transient failure (network, INTERNAL, …) — retryable, not a dead link.
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm font-medium">{t("system.error.title")}</p>
        <p className="text-sm text-muted-foreground">
          {t("system.error.body")}
        </p>
        <Button size="sm" variant="outline" onClick={() => void info.refetch()}>
          {t("system.error.retry")}
        </Button>
      </div>
    );
  }

  const data = info.data;
  // Unreachable in practice: TanStack Query guarantees `data` once
  // `isLoading`/`isError` are both false, but the type stays optional.
  if (!data) return null;

  const alreadyMinted = data.callerClaim?.status === "minted";

  return (
    <Card>
      <CardHeader>
        <p className="text-sm text-muted-foreground">
          {t("attendance.claim.title")}
        </p>
        <h3 className="text-lg font-semibold">{data.name}</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- content-addressed external artwork, not a local/Next-optimizable image */}
        <img
          src={data.imageUrl}
          alt={data.name}
          className="max-w-full rounded-lg"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {formatEventDate(data.eventDate, locale)}
          </span>
          <span className="tabular-nums">
            {data.maxSupply !== null
              ? t("attendance.claim.claimedOf", {
                  count: data.mintedCount,
                  max: data.maxSupply,
                })
              : t("attendance.claim.claimed", { count: data.mintedCount })}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("attendance.claim.free")}
        </p>

        <div className="pt-2">
          {mint.data ? (
            <MintedNotice
              title={t("attendance.claim.success")}
              body={t("attendance.claim.successBody")}
              txSig={mint.data.txSig}
              viewTxLabel={t("attendance.claim.viewTx")}
            />
          ) : alreadyMinted ? (
            <MintedNotice
              title={t("attendance.claim.already")}
              txSig={data.callerClaim?.txSig ?? null}
              viewTxLabel={t("attendance.claim.viewTx")}
            />
          ) : data.state !== "open" ? (
            <Alert className="border-warning text-warning [&>svg]:text-warning">
              <TriangleAlert />
              <AlertTitle>{t(GATE_COPY[data.state].title)}</AlertTitle>
              <AlertDescription className="text-foreground">
                {t(GATE_COPY[data.state].body)}
              </AlertDescription>
            </Alert>
          ) : !proof.selected ? (
            <Button className="w-full" onClick={() => setPickerOpen(true)}>
              {t("attendance.picker.title")}
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {t("attendance.picker.connected", {
                  address: truncateAddress(proof.selected.account.address),
                })}
              </p>
              <Button
                className="w-full"
                disabled={mint.isPending}
                aria-busy={mint.isPending}
                onClick={() => mint.mutate()}
              >
                {mint.isPending && (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                )}
                {mint.stage === "confirming"
                  ? t("attendance.claim.confirming")
                  : t("attendance.claim.mint")}
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <WalletPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        proof={proof}
      />
    </Card>
  );
}
