import "server-only";

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import QRCode from "qrcode";
import { fail } from "../errors";
import type {
  Layout,
  TextField,
  QrField,
  SignatureBox,
  Align,
  FieldFont,
} from "./layout";

// satori has no bundled type matching its runtime plain-object ReactNode
// shape; this minimal type mirrors what it actually inspects (type/props),
// cast with `as never` at the satori() call boundary (see spike-C gotcha #5).
type SatoriNode = {
  type: string;
  props: Record<string, unknown> & {
    children?: SatoriNode | SatoriNode[] | string;
  };
};

const FONTS_DIR = path.join(process.cwd(), "assets", "fonts");

interface SatoriFontSpec {
  name: string;
  data: Buffer;
  weight: 400 | 600;
  style: "normal";
}

let fontsCache: SatoriFontSpec[] | null = null;

/** Loads the 3 committed TTFs once per process (module-level cache). */
function loadFonts(): SatoriFontSpec[] {
  if (fontsCache) {
    return fontsCache;
  }
  fontsCache = [
    {
      name: "Inter",
      data: readFileSync(path.join(FONTS_DIR, "Inter-Regular.ttf")),
      weight: 400,
      style: "normal",
    },
    {
      name: "Inter",
      data: readFileSync(path.join(FONTS_DIR, "Inter-SemiBold.ttf")),
      weight: 600,
      style: "normal",
    },
    {
      name: "Great Vibes",
      data: readFileSync(path.join(FONTS_DIR, "GreatVibes-Regular.ttf")),
      weight: 400,
      style: "normal",
    },
  ];
  return fontsCache;
}

function px(unitValue: number, dimensionPx: number): number {
  return unitValue * dimensionPx;
}

function justifyContentFor(align: Align): "flex-start" | "center" | "flex-end" {
  if (align === "left") return "flex-start";
  if (align === "right") return "flex-end";
  return "center";
}

function fontFamilyFor(font: FieldFont): string {
  return font === "great-vibes" ? "Great Vibes" : "Inter";
}

// Every div gets display:flex, including leaf/empty ones (spike-C gotcha #3
// — satori's Yoga layout is unreliable for non-flex divs, even single-child
// or childless ones).

function textFieldNode(
  field: TextField,
  canvas: { width: number; height: number },
  text: string,
): SatoriNode {
  return {
    type: "div",
    props: {
      style: {
        position: "absolute",
        left: `${px(field.x, canvas.width)}px`,
        top: `${px(field.y, canvas.height)}px`,
        width: `${px(field.w, canvas.width)}px`,
        height: `${px(field.h, canvas.height)}px`,
        display: "flex",
        justifyContent: justifyContentFor(field.align),
        alignItems: "center",
        fontSize: `${px(field.size, canvas.height)}px`,
        fontWeight: field.weight,
        color: field.color,
        fontFamily: fontFamilyFor(field.font),
      },
      children: text,
    },
  };
}

function qrNode(
  field: QrField,
  canvas: { width: number; height: number },
  qrDataUri: string,
): SatoriNode {
  const sizePx = px(field.size, canvas.height);
  return {
    type: "img",
    props: {
      src: qrDataUri,
      width: sizePx,
      height: sizePx,
      style: {
        position: "absolute",
        left: `${px(field.x, canvas.width)}px`,
        top: `${px(field.y, canvas.height)}px`,
        width: `${sizePx}px`,
        height: `${sizePx}px`,
      },
    },
  };
}

// Auto-shrink heuristic (no text-measurement API available synchronously):
// estimate width from an average per-glyph advance ratio for Great Vibes,
// biased high (over-estimate width) so the guaranteed outcome is "fits or
// smaller", never overflow. Pure function of text + box — deterministic.
const SIGNATURE_MAX_FONT_RATIO = 0.3; // matches spike-C's proven 48px-in-160px-box
const SIGNATURE_MIN_FONT_PX = 18;
const GREAT_VIBES_AVG_ADVANCE_EM = 0.55;

function fitSignatureNameFontPx(
  name: string,
  boxWidthPx: number,
  boxHeightPx: number,
): number {
  const maxFontPx = boxHeightPx * SIGNATURE_MAX_FONT_RATIO;
  const estimatedWidthAtMax =
    name.length * GREAT_VIBES_AVG_ADVANCE_EM * maxFontPx;
  if (estimatedWidthAtMax <= boxWidthPx) {
    return maxFontPx;
  }
  const scaledFontPx = boxWidthPx / (name.length * GREAT_VIBES_AVG_ADVANCE_EM);
  return Math.max(SIGNATURE_MIN_FONT_PX, Math.min(maxFontPx, scaledFontPx));
}

function signatureBlockNode(
  box: SignatureBox,
  canvas: { width: number; height: number },
  signer: RenderSigner,
): SatoriNode {
  const boxWidthPx = px(box.w, canvas.width);
  const boxHeightPx = px(box.h, canvas.height);
  const nameFontPx = fitSignatureNameFontPx(
    signer.name,
    boxWidthPx,
    boxHeightPx,
  );

  return {
    type: "div",
    props: {
      style: {
        position: "absolute",
        left: `${px(box.x, canvas.width)}px`,
        top: `${px(box.y, canvas.height)}px`,
        width: `${boxWidthPx}px`,
        height: `${boxHeightPx}px`,
        display: "flex",
        flexDirection: "column",
        alignItems: justifyContentFor(box.align),
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              fontFamily: "Great Vibes",
              fontSize: `${nameFontPx}px`,
              fontWeight: 400,
              color: "#FFFFFF",
            },
            children: signer.name,
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              width: `${boxWidthPx}px`,
              height: "1px",
              marginTop: "8px",
              backgroundColor: "#7C879E",
            },
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              marginTop: "12px",
              fontFamily: "Inter",
              fontSize: "20px",
              fontWeight: 400,
              color: "#B7C0D8",
            },
            children: signer.role,
          },
        },
      ],
    },
  };
}

function buildCertificateTree(params: {
  canvas: { width: number; height: number };
  templateDataUri: string;
  qrDataUri: string;
  layout: Layout;
  values: RenderValues;
  signers: RenderSigner[];
}): SatoriNode {
  const { canvas, templateDataUri, qrDataUri, layout, values, signers } =
    params;

  const signatureNodes = layout.signatures.map((box, i) =>
    signatureBlockNode(box, canvas, signers[i]),
  );

  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        position: "relative",
        width: `${canvas.width}px`,
        height: `${canvas.height}px`,
        fontFamily: "Inter",
      },
      children: [
        // full-bleed template background (data URI — satori can't fetch bare paths)
        {
          type: "img",
          props: {
            src: templateDataUri,
            width: canvas.width,
            height: canvas.height,
            style: {
              position: "absolute",
              top: "0px",
              left: "0px",
              width: `${canvas.width}px`,
              height: `${canvas.height}px`,
            },
          },
        },
        textFieldNode(layout.fields.student_name, canvas, values.studentName),
        textFieldNode(layout.fields.date, canvas, values.dateText),
        textFieldNode(layout.fields.cert_id, canvas, values.certId),
        qrNode(layout.fields.qr, canvas, qrDataUri),
        ...signatureNodes,
      ],
    },
  };
}

export interface RenderValues {
  studentName: string;
  dateText: string;
  certId: string;
  verifyUrl: string;
}

export interface RenderSigner {
  name: string;
  role: string;
}

export interface RenderCertificateInput {
  templatePng: Buffer;
  layout: Layout;
  values: RenderValues;
  signers: RenderSigner[];
  /**
   * Raster multiplier. The layout math is untouched — satori still lays out at
   * `layout.canvas` — only the rasterizer's output resolution changes, so a
   * scaled render is the same picture with more pixels. Defaults to 1, which is
   * the canonical artifact: its sha256 is what goes on-chain. Anything above 1
   * is a print variant (the PDF's 300 dpi page) and its hash is NOT the
   * commitment.
   */
  scale?: number;
}

export interface RenderCertificateResult {
  png: Buffer;
  sha256hex: string;
}

/**
 * Renders a certificate PNG deterministically: no clock reads, no
 * randomness — every value comes from `input`. Same input ⇒ byte-identical
 * output (the M2 determinism gate).
 */
export async function renderCertificate(
  input: RenderCertificateInput,
): Promise<RenderCertificateResult> {
  const { templatePng, layout, values, signers, scale = 1 } = input;

  if (signers.length !== layout.signatures.length) {
    fail(
      "RENDER_FAILED",
      "Número de signatários não corresponde às caixas de assinatura do layout.",
    );
  }

  const canvas = layout.canvas;
  const fonts = loadFonts();
  const templateDataUri = `data:image/png;base64,${templatePng.toString("base64")}`;

  const qrSizePx = Math.round(px(layout.fields.qr.size, canvas.height));
  const qrDataUri = await QRCode.toDataURL(values.verifyUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    // The QR's box in the tree stays `qrSizePx`; only its source bitmap grows,
    // so a scaled render upsamples nothing and the modules stay crisp in print.
    width: Math.round(qrSizePx * scale),
  });

  const tree = buildCertificateTree({
    canvas,
    templateDataUri,
    qrDataUri,
    layout,
    values,
    signers,
  });

  const svg = await satori(tree as never, {
    width: canvas.width,
    height: canvas.height,
    fonts,
  });

  const resvg = new Resvg(
    svg,
    scale === 1
      ? undefined
      : {
          fitTo: { mode: "width", value: Math.round(canvas.width * scale) },
        },
  );
  const png = Buffer.from(resvg.render().asPng());
  const sha256hex = createHash("sha256").update(png).digest("hex");

  return { png, sha256hex };
}
