import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { VerifyResult } from "@/components/verify/verify-result";
import { VerifyChainStamp } from "@/components/verify/verify-chain-stamp";
import {
  dbConfigured,
  getVerifyView,
  getVerifyViewByAsset,
  type VerifyCertView,
} from "@/lib/db/claim-verify-queries";
import { getClaimByAssetId } from "@/lib/db/attendance-queries";
import { translate } from "@/lib/i18n/dictionaries";
import { LocaleProvider } from "@/lib/i18n/provider";
import { getLocale } from "@/lib/i18n/server";
import { isLocale, type Locale } from "@/lib/i18n/locales";

// Verify is inherently dynamic (chain-truthful; a cert can be claimed/revoked
// between visits) — never serve a stale cached verdict.
export const dynamic = "force-dynamic";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * A verdict is shared far more often than it is browsed to, and the person it
 * is sent to may not read the sender's language — so `?lang=` beats the cookie
 * here, making a link that renders the same way for everyone who opens it.
 */
async function resolveLocale(lang: string | undefined): Promise<Locale> {
  return isLocale(lang) ? lang : await getLocale();
}

/**
 * Print rules for the verdict, scoped to this page instead of globals.css: the
 * chrome and the interactive affordances go away, and what is left is the thing
 * a registrar files — the verdict, the identity, and the signatures.
 */
const PRINT_CSS = `@media print{
  nav,footer{display:none!important}
  body{background:#fff!important;color:#000!important}
  main{padding:0!important}
  a[href]::after{content:""}
  .verify-print-root{max-width:none;padding:0}
}`;

/** Resolve an id (cert PDA first, then asset) to its mirror verdict. */
async function resolveView(id: string): Promise<VerifyCertView | null> {
  if (!dbConfigured) return null;
  const byCert = await getVerifyView(id);
  if (byCert) return byCert;
  return getVerifyViewByAsset(id);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const [{ id }, { lang }] = await Promise.all([params, searchParams]);
  const [view, locale] = await Promise.all([
    resolveView(id),
    resolveLocale(lang),
  ]);
  const t = (
    key: Parameters<typeof translate>[1],
    p?: Record<string, string>,
  ) => translate(locale, key, p);

  if (!view) {
    return {
      title: t("verify.meta.titleFallback"),
      description: t("verify.meta.descriptionFallback"),
    };
  }

  const revoked = view.status === "Revoked";
  const title = `${view.studentName} · ${view.editionName} — Superteam Certify`;
  const description = revoked
    ? t("verify.meta.descriptionRevoked", { student: view.studentName })
    : t("verify.meta.description", {
        student: view.studentName,
        edition: view.editionName,
      });

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: view.imageUrl && !revoked ? [{ url: view.imageUrl }] : undefined,
    },
  };
}

/** Fallback when the mirror can't resolve the id — still runs the live chain-check. */
function ChainOnlyFallback({ id, locale }: { id: string; locale: Locale }) {
  const looksLikeAddress = BASE58.test(id);
  return (
    <div className="space-y-6">
      <Alert>
        <AlertTitle>{translate(locale, "verify.fallback.title")}</AlertTitle>
        <AlertDescription>
          {translate(locale, "verify.fallback.body")}
        </AlertDescription>
      </Alert>
      {looksLikeAddress && (
        <Card>
          <CardContent>
            <VerifyChainStamp certAddress={id} mirrorStatus="Requested" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default async function VerifyIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reencode?: string; lang?: string }>;
}) {
  const { id } = await params;
  const { reencode, lang } = await searchParams;
  const [view, locale] = await Promise.all([
    resolveView(id),
    resolveLocale(lang),
  ]);

  // Certificate miss: the id may instead be an attendance NFT's asset id, whose
  // public surface is /nft/[assetId]. Only checked on the miss path so the
  // certificate lookups stay the fast path.
  if (!view && BASE58.test(id) && (await getClaimByAssetId(id))) {
    redirect(`/nft/${id}`);
  }

  return (
    // The nested provider is what makes `?lang=` hold for the client islands
    // too (chain stamp, action buttons); without it they would keep rendering
    // in the visitor's cookie language while the page around them switched.
    <LocaleProvider initialLocale={locale}>
      <style>{PRINT_CSS}</style>
      <div className="verify-print-root mx-auto max-w-3xl px-4 py-12">
        <Link
          href="/verify"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {translate(locale, "verify.verifyAnother")}
        </Link>

        {view ? (
          <VerifyResult
            view={view}
            locale={locale}
            reencode={reencode === "1"}
          />
        ) : (
          <ChainOnlyFallback id={id} locale={locale} />
        )}
      </div>
    </LocaleProvider>
  );
}
