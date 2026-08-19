import type { Metadata } from "next";
import Link from "next/link";
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
import { getT } from "@/lib/i18n/server";

// Verify is inherently dynamic (chain-truthful; a cert can be claimed/revoked
// between visits) — never serve a stale cached verdict.
export const dynamic = "force-dynamic";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Resolve an id (cert PDA first, then asset) to its mirror verdict. */
async function resolveView(id: string): Promise<VerifyCertView | null> {
  if (!dbConfigured) return null;
  const byCert = await getVerifyView(id);
  if (byCert) return byCert;
  return getVerifyViewByAsset(id);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const view = await resolveView(id);
  const { t } = await getT();

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
async function ChainOnlyFallback({ id }: { id: string }) {
  const { t } = await getT();
  const looksLikeAddress = BASE58.test(id);
  return (
    <div className="space-y-6">
      <Alert>
        <AlertTitle>{t("verify.fallback.title")}</AlertTitle>
        <AlertDescription>{t("verify.fallback.body")}</AlertDescription>
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
  searchParams: Promise<{ reencode?: string }>;
}) {
  const { id } = await params;
  const { reencode } = await searchParams;
  const view = await resolveView(id);
  const { t } = await getT();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link
        href="/verify"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("verify.verifyAnother")}
      </Link>

      {view ? (
        <VerifyResult view={view} reencode={reencode === "1"} />
      ) : (
        <ChainOnlyFallback id={id} />
      )}
    </div>
  );
}
