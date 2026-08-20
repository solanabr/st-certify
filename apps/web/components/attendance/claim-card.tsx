"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ExternalLink, Loader2, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletPicker } from "@/components/attendance/wallet-picker";
import { useClaimInfo, useMintAttendance } from "@/hooks/useAttendanceClaim";
import { useWalletProof } from "@/hooks/useWalletProof";
import { explorerTxUrl } from "@/lib/chain/explorer-url";
import { toAppError } from "@/lib/errors";
import { useT, type TranslationKey } from "@/lib/i18n";
import type { ClaimPageInfo } from "@/app/api/attendance/claim/[token]/route";

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
  assetId,
  viewTxLabel,
  viewNftLabel,
}: {
  title: string;
  body?: string;
  txSig: string | null;
  assetId: string | null;
  viewTxLabel: string;
  viewNftLabel: string;
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
      {/* Prefer the in-app share page once the asset id has backfilled; until
          then the mint tx is the only durable pointer to the fresh NFT. */}
      {assetId ? (
        <Button asChild className="w-full">
          <Link href={`/nft/${assetId}`}>{viewNftLabel}</Link>
        </Button>
      ) : txSig ? (
        <a
          href={explorerTxUrl(txSig)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          {viewTxLabel}
        </a>
      ) : null}
    </div>
  );
}

/**
 * Public claim page (`/attend/[token]`). Event info is seeded from the
 * server-rendered `initialEvent` (UI-C1) so a QR scan paints the card
 * immediately, then `useClaimInfo` refetches — and re-fetches on every wallet
 * change so `callerClaim` tracks the connected wallet. `useMintAttendance`'s
 * POST is idempotent (a retried claim resolves `status: "already"`), so the
 * mutation result is branched on that discriminant. A same-session `justMinted`
 * outranks the background-refetched `callerClaim` so celebratory copy doesn't
 * flip to the terser "already claimed" line mid-session. Mint errors surface
 * inline here (not as toasts) per P1-2d.
 */
export function ClaimCard({
  token,
  initialEvent,
}: {
  token: string;
  initialEvent?: ClaimPageInfo;
}) {
  const { t, locale } = useT();
  const proof = useWalletProof();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pollAsset, setPollAsset] = useState(false);
  const wallet = proof.selected?.account.address ?? null;
  const info = useClaimInfo(token, wallet, {
    // Seed only the anonymous query; a connected wallet's claim status is
    // always fetched live.
    initialData: wallet === null ? initialEvent : undefined,
    pollAsset,
  });
  const mint = useMintAttendance(token, proof.prove);
  const { refetch } = info;

  const data = info.data;
  const justMinted = mint.data?.status === "minted";
  const alreadyMinted =
    mint.data?.status === "already" || data?.callerClaim?.status === "minted";
  const assetId = data?.callerClaim?.assetId ?? null;
  const mintedNoAsset = (justMinted || alreadyMinted) && assetId == null;
  const supplyExhausted =
    mint.isError &&
    toAppError(mint.error).code === "ATTENDANCE_SUPPLY_EXHAUSTED";

  // Poll for the minted asset id until it backfills (P1-2a), capped at 20s so a
  // never-resolving asset doesn't poll forever.
  useEffect(() => {
    if (!mintedNoAsset) {
      setPollAsset(false);
      return;
    }
    setPollAsset(true);
    const timer = setTimeout(() => setPollAsset(false), 20_000);
    return () => clearTimeout(timer);
  }, [mintedNoAsset]);

  // A supply-exhausted mint means the count moved under us — refresh so the
  // card settles on the authoritative exhausted gate (P1-2d).
  useEffect(() => {
    if (supplyExhausted) void refetch();
  }, [supplyExhausted, refetch]);

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
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          {t("system.error.retry")}
        </Button>
      </div>
    );
  }

  // Unreachable in practice: TanStack Query guarantees `data` once
  // `isLoading`/`isError` are both false, but the type stays optional.
  if (!data) return null;

  const gateKey: "paused" | "ended" | "exhausted" | null = supplyExhausted
    ? "exhausted"
    : data.state !== "open"
      ? data.state
      : null;

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
          {justMinted ? (
            // key on the tx sig so the reveal animation replays per fresh mint (P0-4).
            <div
              key={mint.data?.txSig}
              className="animate-in fade-in zoom-in-95"
            >
              <MintedNotice
                title={t("attendance.claim.success")}
                body={t("attendance.claim.successBody")}
                txSig={mint.data?.txSig ?? null}
                assetId={assetId}
                viewTxLabel={t("attendance.claim.viewTx")}
                viewNftLabel={t("attendance.claim.viewNft")}
              />
            </div>
          ) : alreadyMinted ? (
            <MintedNotice
              title={t("attendance.claim.already")}
              txSig={mint.data?.txSig || data.callerClaim?.txSig || null}
              assetId={assetId}
              viewTxLabel={t("attendance.claim.viewTx")}
              viewNftLabel={t("attendance.claim.viewNft")}
            />
          ) : gateKey ? (
            <Alert className="border-warning text-warning [&>svg]:text-warning">
              <TriangleAlert />
              <AlertTitle>{t(GATE_COPY[gateKey].title)}</AlertTitle>
              <AlertDescription className="text-foreground">
                {t(GATE_COPY[gateKey].body)}
              </AlertDescription>
            </Alert>
          ) : !proof.selected ? (
            <Button className="w-full" onClick={() => setPickerOpen(true)}>
              {t("attendance.picker.title")}
            </Button>
          ) : (
            <div className="space-y-3">
              <p
                className="text-sm text-muted-foreground"
                title={proof.selected.account.address}
              >
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
                {mint.stage === "signing"
                  ? t("attendance.claim.signing")
                  : mint.stage === "confirming"
                    ? t("attendance.claim.confirming")
                    : t("attendance.claim.mint")}
              </Button>

              <div aria-live="polite" className="space-y-2">
                {mint.stage === "signing" && (
                  <p className="text-xs text-muted-foreground">
                    {t("attendance.claim.signingHint")}
                  </p>
                )}
                {mint.isError && !supplyExhausted && (
                  <Alert>
                    <TriangleAlert />
                    <AlertDescription className="text-foreground">
                      {toAppError(mint.error).code === "CHAIN_REJECTED_BY_USER"
                        ? t("attendance.signatureCancelled")
                        : t("attendance.claim.retryReserved")}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  proof.disconnect();
                  setPickerOpen(true);
                }}
              >
                {t("attendance.picker.change")}
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
