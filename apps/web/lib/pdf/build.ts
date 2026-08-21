import "server-only";

import QRCode from "qrcode";
import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Locale } from "@/lib/i18n/locales";
import { fail } from "@/lib/errors";
import { PDF_LABELS, type PdfLabelKey } from "./labels";
import { ellipsize, winAnsi } from "./text";

export interface CertificatePdfInput {
  png: Uint8Array;
  artifactSha256Hex: string;
  verifyUrl: string;
  verifyCode: string;
  txSig: string | null;
  assetId: string | null;
  cluster: "devnet" | "mainnet-beta";
  issuedAtIso: string;
  issuer: { name: string; contactUrl?: string; cnpj?: string };
  holder: { name: string };
  editionName: string;
  signers: Array<{
    name: string;
    role: string;
    wallet: string;
    signedAtIso: string | null;
    txSig: string | null;
  }>;
  locale: Locale;
}

// A4 landscape, in PDF points.
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 24;
const FOOTER_H = 58;
const FOOTER_GAP = 8;
const QR_SIDE = 52;

const INK = rgb(0.09, 0.1, 0.13);
const MUTED = rgb(0.42, 0.45, 0.52);
const RULE = rgb(0.85, 0.86, 0.89);

/** The whole document's clock. Nothing in the builder may read the real one. */
const PINNED_EPOCH = new Date(0);

const PRODUCER = "st-certify";

interface Fonts {
  body: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

/**
 * The raster multiplier that makes the certificate land on the page at 300 dpi.
 * The image is drawn at whatever size fits the page box, so "1:1" is a property
 * of that box, not a constant — this is the only place the two agree.
 */
export function certificateRenderScale(canvas: {
  width: number;
  height: number;
}): number {
  const box = imageBox(canvas.width / canvas.height);
  return ((box.width / 72) * 300) / canvas.width;
}

/** Aspect-preserving fit of the certificate into page 1's image area. */
function imageBox(aspect: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const maxWidth = PAGE_W - MARGIN * 2;
  const maxHeight = PAGE_H - MARGIN * 2 - FOOTER_H - FOOTER_GAP;

  const width = Math.min(maxWidth, maxHeight * aspect);
  const height = width / aspect;
  return {
    x: (PAGE_W - width) / 2,
    y: MARGIN + FOOTER_H + FOOTER_GAP + (maxHeight - height) / 2,
    width,
    height,
  };
}

// Built from the input's own cluster rather than lib/chain/explorer-url.ts,
// which reads the environment — the document must say where it was recorded,
// not where the process that reprints it happens to be pointed.
function explorerTxUrl(
  txSig: string,
  cluster: CertificatePdfInput["cluster"],
): string {
  const suffix = cluster === "devnet" ? "?cluster=devnet" : "";
  return `https://explorer.solana.com/tx/${txSig}${suffix}`;
}

function formatIssuedAt(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

/**
 * The QR as vector art. `qrcode`'s SVG mode draws the dark modules as a single
 * stroked path of horizontal runs, one unit wide — which is exactly what
 * `drawSvgPath` wants, since it applies the line width inside the scaled
 * transform. pdf-lib flips the y axis for SVG paths, so `y` is the box's top.
 */
async function drawVectorQr(
  page: PDFPage,
  url: string,
  box: { x: number; top: number; side: number },
): Promise<void> {
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
  });

  const viewBox = svg.match(/viewBox="0 0 (\d+) \d+"/);
  const modules = svg.match(/<path stroke="[^"]*" d="([^"]+)"/);
  if (!viewBox || !modules) {
    fail("RENDER_FAILED", "Não foi possível gerar o QR code do PDF.");
  }

  const units = Number(viewBox[1]);
  const scale = box.side / units;

  page.drawRectangle({
    x: box.x,
    y: box.top - box.side,
    width: box.side,
    height: box.side,
    color: rgb(1, 1, 1),
  });
  page.drawSvgPath(modules[1], {
    x: box.x,
    y: box.top,
    scale,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });
}

function drawFooter(
  page: PDFPage,
  fonts: Fonts,
  input: CertificatePdfInput,
  label: (key: PdfLabelKey) => string,
): void {
  const textWidth = PAGE_W - MARGIN * 2 - QR_SIDE - 16;

  page.drawLine({
    start: { x: MARGIN, y: MARGIN + FOOTER_H },
    end: { x: PAGE_W - MARGIN, y: MARGIN + FOOTER_H },
    thickness: 0.5,
    color: RULE,
  });

  page.drawText(label("verifyPrompt"), {
    x: MARGIN,
    y: MARGIN + 44,
    size: 7.5,
    font: fonts.body,
    color: MUTED,
  });
  page.drawText(ellipsize(input.verifyUrl, fonts.bold, 10, textWidth), {
    x: MARGIN,
    y: MARGIN + 30,
    size: 10,
    font: fonts.bold,
    color: INK,
  });
  page.drawText(`${label("code")}: ${input.verifyCode}`, {
    x: MARGIN,
    y: MARGIN + 17,
    size: 8,
    font: fonts.body,
    color: INK,
  });
  page.drawText(`${label("fileHash")}: ${input.artifactSha256Hex}`, {
    x: MARGIN,
    y: MARGIN + 5,
    size: 6.5,
    font: fonts.mono,
    color: MUTED,
  });
}

interface Row {
  label: string;
  value: string;
  mono?: boolean;
}

function drawRows(
  page: PDFPage,
  fonts: Fonts,
  rows: Row[],
  box: { x: number; top: number; width: number },
): number {
  let y = box.top;
  for (const row of rows) {
    page.drawText(winAnsi(row.label).toUpperCase(), {
      x: box.x,
      y,
      size: 6.5,
      font: fonts.body,
      color: MUTED,
    });
    const font = row.mono ? fonts.mono : fonts.body;
    const size = row.mono ? 7.5 : 9;
    page.drawText(ellipsize(row.value, font, size, box.width), {
      x: box.x,
      y: y - 11,
      size,
      font,
      color: INK,
    });
    y -= 28;
  }
  return y;
}

function drawSignerTable(
  page: PDFPage,
  fonts: Fonts,
  input: CertificatePdfInput,
  label: (key: PdfLabelKey) => string,
  top: number,
): void {
  const columns = [
    { key: "signerName" as const, x: MARGIN, width: 150 },
    { key: "signerRole" as const, x: MARGIN + 158, width: 110 },
    { key: "signerWallet" as const, x: MARGIN + 276, width: 190, mono: true },
    { key: "signerSignedAt" as const, x: MARGIN + 474, width: 150 },
    { key: "signerTx" as const, x: MARGIN + 632, width: 162, mono: true },
  ];

  page.drawText(label("signers"), {
    x: MARGIN,
    y: top,
    size: 10,
    font: fonts.bold,
    color: INK,
  });

  let y = top - 18;
  for (const column of columns) {
    page.drawText(winAnsi(label(column.key)).toUpperCase(), {
      x: column.x,
      y,
      size: 6.5,
      font: fonts.body,
      color: MUTED,
    });
  }

  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5,
    color: RULE,
  });

  for (const signer of input.signers) {
    y -= 14;
    const values: Record<(typeof columns)[number]["key"], string> = {
      signerName: signer.name,
      signerRole: signer.role,
      signerWallet: signer.wallet,
      signerSignedAt: signer.signedAtIso
        ? formatIssuedAt(signer.signedAtIso, input.locale)
        : label("pending"),
      signerTx: signer.txSig ?? label("none"),
    };
    for (const column of columns) {
      const font = column.mono ? fonts.mono : fonts.body;
      const size = column.mono ? 7 : 8;
      page.drawText(ellipsize(values[column.key], font, size, column.width), {
        x: column.x,
        y,
        size,
        font,
        color: signer.signedAtIso ? INK : MUTED,
      });
    }
  }
}

function drawEvidencePage(
  page: PDFPage,
  fonts: Fonts,
  input: CertificatePdfInput,
  label: (key: PdfLabelKey) => string,
): void {
  const columnWidth = (PAGE_W - MARGIN * 2 - 40) / 2;
  const rightX = MARGIN + columnWidth + 40;

  page.drawText(label("auditTitle"), {
    x: MARGIN,
    y: PAGE_H - MARGIN - 16,
    size: 16,
    font: fonts.bold,
    color: INK,
  });
  page.drawText(
    ellipsize(label("auditIntro"), fonts.body, 8, PAGE_W - MARGIN * 2),
    {
      x: MARGIN,
      y: PAGE_H - MARGIN - 32,
      size: 8,
      font: fonts.body,
      color: MUTED,
    },
  );

  const top = PAGE_H - MARGIN - 58;

  const left: Row[] = [
    { label: label("issuer"), value: input.issuer.name },
    ...(input.issuer.contactUrl
      ? [{ label: label("issuerContact"), value: input.issuer.contactUrl }]
      : []),
    ...(input.issuer.cnpj
      ? [{ label: label("issuerCnpj"), value: input.issuer.cnpj }]
      : []),
    { label: label("holder"), value: input.holder.name },
    { label: label("edition"), value: input.editionName },
    {
      label: label("issuedAt"),
      value: formatIssuedAt(input.issuedAtIso, input.locale),
    },
  ];

  const right: Row[] = [
    { label: label("fileHash"), value: input.artifactSha256Hex, mono: true },
    {
      label: label("transaction"),
      value: input.txSig ?? label("none"),
      mono: true,
    },
    {
      label: label("explorer"),
      value: input.txSig
        ? explorerTxUrl(input.txSig, input.cluster)
        : label("none"),
    },
    {
      label: label("asset"),
      value: input.assetId ?? label("none"),
      mono: true,
    },
    { label: label("network"), value: input.cluster },
    {
      label: label("verifyUrl"),
      value: `${input.verifyUrl}  ·  ${input.verifyCode}`,
    },
  ];

  const leftBottom = drawRows(page, fonts, left, {
    x: MARGIN,
    top,
    width: columnWidth,
  });
  const rightBottom = drawRows(page, fonts, right, {
    x: rightX,
    top,
    width: columnWidth,
  });

  drawSignerTable(
    page,
    fonts,
    input,
    label,
    Math.min(leftBottom, rightBottom) - 6,
  );

  page.drawText(
    ellipsize(label("legalNote"), fonts.body, 7, PAGE_W - MARGIN * 2),
    {
      x: MARGIN,
      y: MARGIN,
      size: 7,
      font: fonts.body,
      color: MUTED,
    },
  );
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The machine-readable layer the verify dropzone reads back: a plain,
 * UNCOMPRESSED XMP packet, so `certify:artifactSha256="…"` is findable by a
 * regex over the raw file bytes without a PDF parser in the browser.
 */
function xmpPacket(input: CertificatePdfInput, title: string): Uint8Array {
  const packet = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="${PRODUCER}">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(title)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${xmlEscape(input.issuer.name)}</rdf:li></rdf:Seq></dc:creator>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreatorTool>${PRODUCER}</xmp:CreatorTool>
   <xmp:CreateDate>${xmlEscape(input.issuedAtIso)}</xmp:CreateDate>
   <xmp:ModifyDate>${xmlEscape(input.issuedAtIso)}</xmp:ModifyDate>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:certify="https://certify.superteam.fun/ns/1.0/"
   certify:artifactSha256="${input.artifactSha256Hex}"
   certify:verifyCode="${xmlEscape(input.verifyCode)}"
   certify:verifyUrl="${xmlEscape(input.verifyUrl)}"
   certify:cluster="${input.cluster}"
   certify:solanaTx="${xmlEscape(input.txSig ?? "")}"
   certify:assetId="${xmlEscape(input.assetId ?? "")}"/>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  return new Uint8Array(Buffer.from(packet, "utf8"));
}

/**
 * Custom Info entries, written as hex strings. `PDFString.fromText` would
 * encode each character as a single byte, so anything above U+00FF is
 * silently truncated to its low byte — an em dash (U+2014) becomes 0x14.
 * `PDFHexString.fromText` writes UTF-16BE and survives.
 */
function setInfo(pdf: PDFDocument, key: string, value: string): void {
  // The document's own `getInfoDict()` is private; the dictionary it returns is
  // the one the trailer points at, which `PDFDocument.create` always registers.
  const info = pdf.context.lookup(pdf.context.trailerInfo.Info, PDFDict);
  info.set(PDFName.of(key), PDFHexString.fromText(value));
}

/**
 * Builds the exportable certificate: page 1 is the rendered artifact at 300 dpi
 * with a verification footer, page 2 is the audit trail.
 *
 * Byte-deterministic by construction — same input, same bytes — which is what
 * lets the route content-address the result next to the PNG it was rendered
 * from. Every clock the format would otherwise read (Info dates, attachment
 * dates, XMP dates) is pinned to a constant or to the issuance time carried in
 * the input; nothing here calls `new Date()`.
 */
export async function buildCertificatePdf(
  input: CertificatePdfInput,
): Promise<Uint8Array> {
  const labels = PDF_LABELS[input.locale];
  const label = (key: PdfLabelKey): string => labels[key];
  const title = `${input.holder.name} — ${input.editionName}`;

  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    body: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };

  const image = await pdf.embedPng(input.png);
  const page1 = pdf.addPage([PAGE_W, PAGE_H]);
  const box = imageBox(image.width / image.height);
  page1.drawImage(image, box);

  drawFooter(page1, fonts, input, label);
  await drawVectorQr(page1, input.verifyUrl, {
    x: PAGE_W - MARGIN - QR_SIDE,
    top: MARGIN + FOOTER_H - 3,
    side: QR_SIDE,
  });

  drawEvidencePage(pdf.addPage([PAGE_W, PAGE_H]), fonts, input, label);

  pdf.setTitle(title);
  pdf.setAuthor(input.issuer.name);
  pdf.setSubject(`${label("docTitle")} · ${input.verifyCode}`);
  pdf.setKeywords([input.verifyCode, input.artifactSha256Hex, "st-certify"]);
  pdf.setProducer(PRODUCER);
  pdf.setCreator(PRODUCER);
  pdf.setCreationDate(PINNED_EPOCH);
  pdf.setModificationDate(PINNED_EPOCH);

  setInfo(pdf, "CertifyArtifactSha256", input.artifactSha256Hex);
  setInfo(pdf, "CertifyVerifyCode", input.verifyCode);
  setInfo(pdf, "CertifyVerifyUrl", input.verifyUrl);
  setInfo(pdf, "CertifyCluster", input.cluster);
  setInfo(pdf, "CertifyIssuedAt", input.issuedAtIso);
  if (input.txSig) setInfo(pdf, "CertifySolanaTx", input.txSig);
  if (input.assetId) setInfo(pdf, "CertifyAssetId", input.assetId);

  const metadataRef = pdf.context.register(
    pdf.context.stream(xmpPacket(input, title), {
      Type: "Metadata",
      Subtype: "XML",
    }),
  );
  pdf.catalog.set(PDFName.of("Metadata"), metadataRef);

  await pdf.attach(
    new Uint8Array(
      Buffer.from(
        `${JSON.stringify(
          {
            artifactSha256: input.artifactSha256Hex,
            verifyCode: input.verifyCode,
            verifyUrl: input.verifyUrl,
            cluster: input.cluster,
            solanaTx: input.txSig,
            assetId: input.assetId,
            issuedAt: input.issuedAtIso,
            issuer: input.issuer,
            holder: input.holder,
            edition: input.editionName,
            signers: input.signers,
          },
          null,
          2,
        )}\n`,
        "utf8",
      ),
    ),
    "certify-metadata.json",
    {
      mimeType: "application/json",
      description: label("auditTitle"),
      creationDate: PINNED_EPOCH,
      modificationDate: PINNED_EPOCH,
    },
  );

  // The trailer /ID is a file identifier, and pdf-lib leaves it unset. Deriving
  // it from the artifact hash keeps it stable across builds (a random one would
  // break byte-equality) and ties the file to the bytes it certifies.
  const fileId = PDFHexString.of(input.artifactSha256Hex.toUpperCase());
  pdf.context.trailerInfo.ID = pdf.context.obj([fileId, fileId]);

  // Object streams stay off so the XMP packet is greppable in the raw bytes and
  // @signpdf can splice a signature in without rewriting compressed sections.
  // Appearance regeneration stays off because it is the one part of `save()`
  // that rewrites content the caller never asked for.
  return pdf.save({ useObjectStreams: false, updateFieldAppearances: false });
}
