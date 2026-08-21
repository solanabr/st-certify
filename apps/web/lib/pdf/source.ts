import "server-only";

import { fail } from "@/lib/errors";
import { getCertificateByAddress, getEditionByAddress } from "@/lib/db/queries";
import { layoutSchema } from "@/lib/render/layout";
import { renderCertificate } from "@/lib/render/render";
import { getTemplateBytes } from "@/lib/render/storage";
import { configuredIssuer } from "@/lib/issuer";
import { verifyCode } from "@/lib/verify-code";
import type { Locale } from "@/lib/i18n/locales";
import { certificateRenderScale, type CertificatePdfInput } from "./build";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** The cluster the app is pointed at, from the same env the explorer links read. */
function cluster(): CertificatePdfInput["cluster"] {
  return (process.env.NEXT_PUBLIC_RPC_URL ?? "").includes("devnet")
    ? "devnet"
    : "mainnet-beta";
}

/**
 * Unlike the verify page's block, a printed document must attribute itself to
 * someone, so an unconfigured issuer falls back to the platform's own name.
 */
const PLATFORM_ISSUER = "Superteam Brasil";

/**
 * The printed date, which must read the same as the one baked into the
 * certificate image. The rule is defined by `certDateText` in lib/chain/claim.ts
 * — the edition's completion date if it has one, else the request date — and is
 * mirrored here because the export re-renders from the mirror instead of
 * re-running the claim pipeline.
 */
function certificateDateText(
  completionDate: string | null,
  createdAt: string,
): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(completionDate ?? createdAt));
}

export interface CertificatePdfSource {
  input: CertificatePdfInput;
  /** The on-chain-committed artifact hash — also the cache key. */
  artifactSha256Hex: string;
  editionSlug: string;
  /** `/Reason` for the seal, and the evidence page's explorer link. */
  issuanceTime: Date;
}

/**
 * Gathers everything the builder needs for a claimed certificate and re-renders
 * its artwork at print resolution.
 *
 * Returns null for anything that is not a claimed certificate: an export only
 * exists once the holder has claimed, so a pending, rejected or unknown address
 * is indistinguishable from a miss to the caller.
 *
 * Reads the mirror under the service role for one reason — `claim_tx` is not in
 * the anon-readable public projection — and copies out only fields that
 * `/verify/[addr]` already shows in public. Nothing owner-scoped
 * (`name_salt`, `owner_did`, `owner_wallet`) leaves this function.
 */
export async function loadCertificatePdfSource(
  certificateAddress: string,
  locale: Locale,
): Promise<CertificatePdfSource | null> {
  const cert = await getCertificateByAddress(certificateAddress);
  if (!cert || cert.status !== "Claimed") return null;

  const edition = await getEditionByAddress(cert.edition_address);
  if (!edition?.layout) {
    fail("RENDER_FAILED", "Layout da edição ausente.");
  }
  if (!cert.sha256) {
    fail("RENDER_FAILED", "Certificado sem hash de artefato registrado.");
  }

  const layout = layoutSchema.parse(edition.layout);
  const orderedSigners = [...edition.signers].sort(
    (a, b) => a.position - b.position,
  );
  if (orderedSigners.length !== layout.signatures.length) {
    fail(
      "RENDER_FAILED",
      "Número de signatários não corresponde ao layout da edição.",
    );
  }

  const verifyUrl = `${appUrl()}/verify/${certificateAddress}`;
  const templatePng = await getTemplateBytes(layout.template.sha256);
  const { png } = await renderCertificate({
    templatePng,
    layout,
    values: {
      studentName: cert.student_name,
      dateText: certificateDateText(edition.completionDate, cert.created_at),
      certId: certificateAddress,
      verifyUrl,
    },
    signers: orderedSigners.map((s) => ({ name: s.name, role: s.role ?? "" })),
    scale: certificateRenderScale(layout.canvas),
  });

  const txByWallet = new Map(cert.signer_txs.map((t) => [t.wallet, t]));
  const issuedAtIso = cert.completed_at ?? cert.created_at;

  return {
    artifactSha256Hex: cert.sha256,
    editionSlug: edition.slug,
    issuanceTime: new Date(issuedAtIso),
    input: {
      png: new Uint8Array(png),
      artifactSha256Hex: cert.sha256,
      verifyUrl,
      verifyCode: verifyCode(certificateAddress),
      txSig: cert.claim_tx,
      assetId: cert.asset,
      cluster: cluster(),
      issuedAtIso,
      issuer: configuredIssuer() ?? { name: PLATFORM_ISSUER },
      holder: { name: cert.student_name },
      editionName: edition.name,
      signers: orderedSigners.map((s) => {
        const tx = txByWallet.get(s.wallet);
        return {
          name: s.name,
          role: s.role ?? "",
          wallet: s.wallet,
          signedAtIso: tx?.signedAt ?? null,
          txSig: tx?.tx ?? null,
        };
      }),
      locale,
    },
  };
}
