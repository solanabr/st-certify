import { Card, CardContent } from "@/components/ui/card";
import { SignerTable } from "@/components/verify/signer-table";
import { VerifyStatusBanner } from "@/components/verify/verify-status-banner";
import { VerifyMediaPanel } from "@/components/verify/verify-media-panel";
import type { VerifyCertView } from "@/lib/db/claim-verify-queries";
import { getT } from "@/lib/i18n/server";

type Translate = Awaited<ReturnType<typeof getT>>["t"];

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function certNumberLabel(view: VerifyCertView, t: Translate): string {
  if (view.certNumber === null) return "—";
  return view.maxSupply
    ? t("verify.detail.numberOf", {
        number: view.certNumber,
        max: view.maxSupply,
      })
    : `#${view.certNumber}`;
}

async function DetailGrid({ view }: { view: VerifyCertView }) {
  const { locale, t } = await getT();
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      <div className="col-span-2">
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("verify.detail.student")}
        </dt>
        {/* Loudest cell — the human trust anchor (plan §Security #2). */}
        <dd className="text-lg font-semibold">{view.studentName}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("verify.detail.number")}
        </dt>
        <dd className="tabular-nums">{certNumberLabel(view, t)}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("verify.detail.date")}
        </dt>
        <dd className="tabular-nums">
          {formatDate(view.completionDate ?? view.completedAt, locale)}
        </dd>
      </div>
      <div className="col-span-2 sm:col-span-4">
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("verify.detail.edition")}
        </dt>
        <dd>{view.editionName}</dd>
      </div>
    </dl>
  );
}

/**
 * The server-rendered verify verdict (RSC — instant paint + OG). Its states are
 * the page: REVOKED / valid (Claimed) / pending / rejected. The live
 * "verificado onchain" stamp + NFT link are added by the `VerifyChainStamp`
 * client island so the certificate's authoritative on-chain state is what the
 * viewer ultimately trusts.
 */
export async function VerifyResult({
  view,
  reencode = false,
}: {
  view: VerifyCertView;
  reencode?: boolean;
}) {
  const { t } = await getT();
  const isRejected = view.status === "Rejected";

  return (
    <div className="space-y-6">
      <VerifyStatusBanner
        certAddress={view.address}
        mirrorStatus={view.status}
        revokeReason={view.revokeReason}
        reencode={reencode}
      />

      <Card>
        <CardContent className="space-y-6">
          <DetailGrid view={view} />

          <VerifyMediaPanel
            certAddress={view.address}
            mirrorStatus={view.status}
            imageUrl={view.imageUrl}
            studentName={view.studentName}
            isRejected={isRejected}
          />
        </CardContent>
      </Card>

      {view.signers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("verify.detail.signatures")}
          </h2>
          <SignerTable signers={view.signers} />
        </div>
      )}
    </div>
  );
}
