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

  if (!view) {
    return {
      title: "Verificar certificado · Superteam Certify",
      description: "Verificação de certificado onchain da Superteam Brasil.",
    };
  }

  const revoked = view.status === "Revoked";
  const title = `${view.studentName} · ${view.editionName} — Superteam Certify`;
  const description = revoked
    ? `Certificado de ${view.studentName} — REVOGADO.`
    : `Certificado de ${view.studentName} para "${view.editionName}", verificável onchain.`;

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
function ChainOnlyFallback({ id }: { id: string }) {
  const looksLikeAddress = BASE58.test(id);
  return (
    <div className="space-y-6">
      <Alert>
        <AlertTitle>Detalhes indisponíveis</AlertTitle>
        <AlertDescription>
          Não foi possível carregar os detalhes deste certificado. A verificação
          on-chain abaixo é a fonte da verdade.
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
  searchParams: Promise<{ reencode?: string }>;
}) {
  const { id } = await params;
  const { reencode } = await searchParams;
  const view = await resolveView(id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link
        href="/verify"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Verificar outro
      </Link>

      {view ? (
        <VerifyResult view={view} reencode={reencode === "1"} />
      ) : (
        <ChainOnlyFallback id={id} />
      )}
    </div>
  );
}
