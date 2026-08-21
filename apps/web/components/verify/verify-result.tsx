import { Card, CardContent } from "@/components/ui/card";
import { SignerTable } from "@/components/verify/signer-table";
import { VerifyIssuer } from "@/components/verify/verify-issuer";
import { VerifyStatusBanner } from "@/components/verify/verify-status-banner";
import { VerifyMediaPanel } from "@/components/verify/verify-media-panel";
import { VerifyTechnicalDetails } from "@/components/verify/verify-technical-details";
import type { VerifyCertView } from "@/lib/db/claim-verify-queries";
import { translate, type TranslationKey } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

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

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      {children}
    </div>
  );
}

function DetailGrid({
  view,
  locale,
  t,
}: {
  view: VerifyCertView;
  locale: Locale;
  t: Translate;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      <Field label={t("verify.detail.student")} className="col-span-2">
        {/* Loudest cell — the human trust anchor (plan §Security #2). */}
        <dd className="text-lg font-semibold">{view.studentName}</dd>
      </Field>
      <Field label={t("verify.detail.number")}>
        <dd className="tabular-nums">{certNumberLabel(view, t)}</dd>
      </Field>
      <Field label={t("verify.detail.date")}>
        <dd className="tabular-nums">
          {formatDate(view.completionDate ?? view.completedAt, locale)}
        </dd>
      </Field>
      <Field
        label={t("verify.detail.edition")}
        className="col-span-2 sm:col-span-4"
      >
        <dd>{view.editionName}</dd>
      </Field>
      {view.verifyCode && (
        <Field
          label={t("verify.detail.code")}
          className="col-span-2 sm:col-span-4"
        >
          {/* The same code printed in the PDF footer — this is where someone
              holding a printout confirms they typed it into the right page. */}
          <dd className="font-mono text-base tracking-[0.2em]">
            {view.verifyCode}
          </dd>
        </Field>
      )}
    </dl>
  );
}

/**
 * The server-rendered verify verdict (RSC — instant paint + OG). Its states are
 * the page: REVOKED / valid (Claimed) / pending / rejected. The live
 * "verificado onchain" stamp + NFT link are added by the `VerifyChainStamp`
 * client island so the certificate's authoritative on-chain state is what the
 * viewer ultimately trusts.
 *
 * `locale` is passed in rather than read from the cookie here, because
 * `/verify/[id]` accepts a `?lang=` override and every part of the verdict has
 * to agree on which language won.
 */
export function VerifyResult({
  view,
  locale,
  reencode = false,
}: {
  view: VerifyCertView;
  locale: Locale;
  reencode?: boolean;
}) {
  const t: Translate = (key, params) => translate(locale, key, params);
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
          <DetailGrid view={view} locale={locale} t={t} />

          <VerifyMediaPanel
            certAddress={view.address}
            mirrorStatus={view.status}
            imageUrl={view.imageUrl}
            studentName={view.studentName}
            isRejected={isRejected}
          />
        </CardContent>
      </Card>

      <VerifyIssuer locale={locale} />

      {view.signers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("verify.detail.signatures")}
          </h2>
          <SignerTable signers={view.signers} locale={locale} />
        </div>
      )}

      <VerifyTechnicalDetails
        certAddress={view.address}
        editionAddress={view.editionAddress}
        asset={view.asset}
        sha256={view.sha256}
        signers={view.signers}
      />
    </div>
  );
}
