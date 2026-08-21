import "server-only";

import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { P12Signer } from "@signpdf/signer-p12";
import { SignPdf, Signer } from "@signpdf/signpdf";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { fail } from "@/lib/errors";
import { asciiFold, ellipsize } from "./text";

/**
 * Where the seal's private key comes from. The interface exists because the key
 * source is the part of this that will change: today it is a `.p12` file the
 * organization manages itself, which Adobe reports as a valid signature from an
 * *unverified* identity ("validity unknown") because the issuer is not in the
 * AATL trust list — honest, and enough for the tamper-evidence the export is
 * for.
 *
 * The upgrade path is a PSC-hosted ICP-Brasil **cloud A3** certificate, which
 * would implement this same interface by calling the provider's signing API
 * with the document digest. It is deliberately NOT built here. An A1 (file)
 * ICP-Brasil certificate is not an option: Adobe treats an A1 used this way as
 * invalid, so it would make the export look worse than shipping unsealed.
 */
export interface CertificateSource {
  /** Returns the detached CMS/PKCS#7 signature (DER) over `pdf`. */
  sign(pdf: Buffer, signingTime?: Date): Promise<Buffer>;
}

export interface SealOptions {
  /** Goes into `/Reason` — the explorer URL for the issuance transaction. */
  reason: string;
  /** Pinned to the on-chain issuance time, never `new Date()`. */
  signingTime: Date;
  /** Visible widget, `[x1, y1, x2, y2]`. Defaults to the last page's footer. */
  rect?: [number, number, number, number];
  /** Identity shown in the signature panel. */
  name?: string;
  contactInfo?: string;
}

const PLACEHOLDER_BYTES = 16384;
const SUBFILTER_ETSI_CADES_DETACHED = "ETSI.CAdES.detached";
const WIDGET_W = 190;
const WIDGET_H = 46;

/** True when a signing certificate is configured; false means "export unsealed". */
export function sealConfigured(): boolean {
  return Boolean(process.env.SEAL_P12_BASE64);
}

/** The self-managed `.p12` source, from `SEAL_P12_BASE64` + `SEAL_P12_PASSPHRASE`. */
export function envP12Source(): CertificateSource {
  const encoded = process.env.SEAL_P12_BASE64;
  if (!encoded) {
    fail("INTERNAL", "Certificado de selo não configurado (SEAL_P12_BASE64).");
  }
  return new P12Signer(Buffer.from(encoded, "base64"), {
    passphrase: process.env.SEAL_P12_PASSPHRASE ?? "",
  });
}

/**
 * @signpdf rejects anything that is not one of its own `Signer`s, so a
 * `CertificateSource` that is not already one gets wrapped rather than the
 * interface being widened to match a third-party base class.
 */
class SourceSigner extends Signer {
  constructor(private readonly source: CertificateSource) {
    super();
  }

  async sign(pdf: Buffer, signingTime?: Date): Promise<Buffer> {
    return this.source.sign(pdf, signingTime);
  }
}

/** Bottom-right of the audit-trail page — the certificate artwork stays untouched. */
function defaultRect(pageWidth: number): [number, number, number, number] {
  return [pageWidth - 24 - WIDGET_W, 24, pageWidth - 24, 24 + WIDGET_H];
}

/**
 * Cryptographically seals a built certificate PDF: draws the visible seal
 * widget, splices in a signature placeholder, then replaces the placeholder
 * with a detached CMS signature over everything else in the file.
 *
 * Deterministic for a pinned `signingTime` and a fixed key — the RSA signature
 * is over a digest of bytes that are themselves deterministic — so a sealed
 * export can be content-addressed exactly like an unsealed one.
 *
 * `updateMetadata: false` on load is load-bearing: pdf-lib otherwise stamps a
 * fresh `/ModDate` on the way in and undoes the builder's pinned dates.
 */
export async function sealPdf(
  pdf: Uint8Array,
  source: CertificateSource,
  opts: SealOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const pages = doc.getPages();
  const page = pages[pages.length - 1];
  const rect = opts.rect ?? defaultRect(page.getWidth());
  const name = asciiFold(opts.name ?? "st-certify");
  const reason = asciiFold(opts.reason);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const boxWidth = rect[2] - rect[0];

  page.drawRectangle({
    x: rect[0],
    y: rect[1],
    width: boxWidth,
    height: rect[3] - rect[1],
    borderColor: rgb(0.42, 0.45, 0.52),
    borderWidth: 0.75,
    color: rgb(1, 1, 1),
  });
  page.drawText(ellipsize(name, bold, 7.5, boxWidth - 12), {
    x: rect[0] + 6,
    y: rect[3] - 13,
    size: 7.5,
    font: bold,
    color: rgb(0.09, 0.1, 0.13),
  });
  page.drawText(opts.signingTime.toISOString().replace(".000Z", "Z"), {
    x: rect[0] + 6,
    y: rect[3] - 24,
    size: 6.5,
    font,
    color: rgb(0.42, 0.45, 0.52),
  });
  page.drawText(ellipsize(reason, font, 6, boxWidth - 12), {
    x: rect[0] + 6,
    y: rect[3] - 34,
    size: 6,
    font,
    color: rgb(0.42, 0.45, 0.52),
  });

  pdflibAddPlaceholder({
    pdfDoc: doc,
    reason,
    contactInfo: asciiFold(opts.contactInfo ?? ""),
    name,
    location: "",
    signingTime: opts.signingTime,
    signatureLength: PLACEHOLDER_BYTES,
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
    widgetRect: rect,
    appName: "st-certify",
  });

  const withPlaceholder = await doc.save({
    useObjectStreams: false,
    updateFieldAppearances: false,
  });

  const signer = source instanceof Signer ? source : new SourceSigner(source);
  const signed = await new SignPdf().sign(
    Buffer.from(withPlaceholder),
    signer,
    opts.signingTime,
  );
  return new Uint8Array(signed);
}
