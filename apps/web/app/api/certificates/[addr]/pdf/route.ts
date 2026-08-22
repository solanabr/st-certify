export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { fail } from "@/lib/errors";
import { buildCertificatePdf } from "@/lib/pdf/build";
import { envP12Source, sealConfigured, sealPdf } from "@/lib/pdf/seal";
import { loadCertificatePdfSource } from "@/lib/pdf/source";
import { pdfCachePath, readCachedPdf, writeCachedPdf } from "@/lib/pdf/storage";
import { getLocale } from "@/lib/i18n/server";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/locales";

/**
 * Public, like the verify page it is linked from: every field the export prints
 * — holder, edition, signer roster, hashes, transactions — is already on
 * `/verify/[addr]` for anyone with the address. Gating it would only break the
 * link in the claim-receipt email, which is opened from an inbox with no
 * session.
 */
async function resolveLocale(request: Request): Promise<Locale> {
  const lang = new URL(request.url).searchParams.get("lang");
  if (isLocale(lang ?? undefined)) return lang as Locale;
  try {
    return await getLocale();
  } catch {
    return DEFAULT_LOCALE;
  }
}

function explorerTx(txSig: string, cluster: "devnet" | "mainnet-beta"): string {
  const suffix = cluster === "devnet" ? "?cluster=devnet" : "";
  return `https://explorer.solana.com/tx/${txSig}${suffix}`;
}

/**
 * The certificate as a printable, self-contained document. Claimed certificates
 * only — anything else is a 404, because an unclaimed request has no artifact to
 * export and saying more would confirm the address exists.
 *
 * Cache-first: the builder is deterministic, so a hit is byte-identical to what
 * a rebuild would produce and the expensive part (a 300 dpi render plus, when
 * configured, an RSA signature) is skipped entirely.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ addr: string }> },
): Promise<Response> {
  try {
    const { addr } = await params;
    const locale = await resolveLocale(request);
    const sealed = sealConfigured();

    const source = await loadCertificatePdfSource(addr, locale);
    if (!source) {
      fail("NOT_FOUND", "Certificado não encontrado ou ainda não resgatado.");
    }

    const filename = `certificado-${source.editionSlug || "certify"}-${source.input.verifyCode}.pdf`;
    const cachePath = pdfCachePath(source.artifactSha256Hex, locale, sealed);

    const cached = await readCachedPdf(cachePath);
    if (cached) return pdfResponse(cached, filename);

    let pdf = await buildCertificatePdf(source.input);
    if (sealed) {
      pdf = await sealPdf(pdf, envP12Source(), {
        reason: source.input.txSig
          ? explorerTx(source.input.txSig, source.input.cluster)
          : source.input.verifyUrl,
        signingTime: source.issuanceTime,
        name: source.input.issuer.name,
        contactInfo: source.input.issuer.contactUrl ?? "",
      });
    }

    await writeCachedPdf(cachePath, pdf);
    return pdfResponse(pdf, filename);
  } catch (err) {
    return apiError(err);
  }
}

function pdfResponse(pdf: Uint8Array, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Never cached at the HTTP layer: a revoked certificate must stop being
      // downloadable on the next request, and the storage cache above already
      // removes the cost of rebuilding.
      "Cache-Control": "no-store",
    },
  });
}
