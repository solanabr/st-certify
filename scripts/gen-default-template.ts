// Generates the committed default Superteam BR certificate template:
// apps/web/assets/templates/default-superteam-br.png + a matching
// pre-positioned default-layout.json beside it. Run with tsx from the repo
// root: `tsx scripts/gen-default-template.ts`.
//
// Standalone by design (does not import lib/render/render.ts, which is
// `server-only` and throws when loaded outside a bundler that understands
// that marker — see apps/web/vitest.config.ts for the same issue on the
// test side). Reuses the exact satori -> resvg pipeline proven in
// spikes/render/index.ts and used by lib/render/render.ts, and validates
// its own output against the shared layoutSchema.

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { layoutSchema, type Layout } from "../apps/web/lib/render/layout";

const WIDTH = 1600;
const HEIGHT = 1131;

const NAVY = "#0B0F1A";
const GRADIENT_START = "#9945FF";
const GRADIENT_END = "#14F195";
const HAIRLINE = "#1E2633";

const FONTS_DIR = path.join(
  import.meta.dirname,
  "..",
  "apps",
  "web",
  "assets",
  "fonts",
);
const OUT_DIR = path.join(
  import.meta.dirname,
  "..",
  "apps",
  "web",
  "assets",
  "templates",
);

type SatoriNode = {
  type: string;
  props: Record<string, unknown> & {
    children?: SatoriNode | SatoriNode[] | string;
  };
};

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Flat/vector background art (navy field, gradient frame, hairline, gradient bars) — resvg alone, no satori (spike-C gotcha #6). */
function renderBackgroundArtPng(): Buffer {
  const frameInset = 8;
  const frameStroke = 3;
  const hairlineInset = 28;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="solana" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${GRADIENT_START}"/>
      <stop offset="100%" stop-color="${GRADIENT_END}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${NAVY}"/>
  <rect x="${frameInset}" y="${frameInset}" width="${WIDTH - frameInset * 2}" height="${HEIGHT - frameInset * 2}" fill="none" stroke="url(#solana)" stroke-width="${frameStroke}"/>
  <rect x="${hairlineInset}" y="${hairlineInset}" width="${WIDTH - hairlineInset * 2}" height="${HEIGHT - hairlineInset * 2}" fill="none" stroke="${HAIRLINE}" stroke-width="1"/>
  <rect x="700" y="205" width="200" height="4" fill="url(#solana)"/>
  <rect x="0" y="${HEIGHT - 6}" width="${WIDTH}" height="6" fill="url(#solana)"/>
</svg>`;
  return Buffer.from(new Resvg(svg).render().asPng());
}

interface SatoriFontSpec {
  name: string;
  data: Buffer;
  weight: 400 | 600;
  style: "normal";
}

function loadFonts(): SatoriFontSpec[] {
  return [
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
  ];
}

/** Static text layers only — no dynamic per-certificate fields baked in. */
function buildTemplateTree(bgDataUri: string): SatoriNode {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        position: "relative",
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        fontFamily: "Inter",
      },
      children: [
        {
          type: "img",
          props: {
            src: bgDataUri,
            width: WIDTH,
            height: HEIGHT,
            style: {
              position: "absolute",
              top: "0px",
              left: "0px",
              width: `${WIDTH}px`,
              height: `${HEIGHT}px`,
            },
          },
        },
        // "SB" monogram, right-of-center, very subtle
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: "280px",
              left: "820px",
              width: "700px",
              height: "700px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              fontSize: "560px",
              fontWeight: 600,
              color: "#FFFFFF",
              opacity: 0.03,
              fontFamily: "Inter",
            },
            children: "SB",
          },
        },
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: "120px",
              left: "0px",
              width: `${WIDTH}px`,
              height: "60px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              fontSize: "40px",
              fontWeight: 600,
              letterSpacing: "10px",
              color: "#FFFFFF",
              fontFamily: "Inter",
            },
            children: "SUPERTEAM BRASIL",
          },
        },
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: "232px",
              left: "0px",
              width: `${WIDTH}px`,
              height: "40px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              fontSize: "22px",
              fontWeight: 400,
              letterSpacing: "3px",
              color: "#94A3B8",
              fontFamily: "Inter",
            },
            children: "CERTIFICADO DE CONCLUSÃO",
          },
        },
      ],
    },
  };
}

async function renderTemplatePng(): Promise<Buffer> {
  const bgPng = renderBackgroundArtPng();
  const bgDataUri = `data:image/png;base64,${bgPng.toString("base64")}`;
  const svg = await satori(buildTemplateTree(bgDataUri) as never, {
    width: WIDTH,
    height: HEIGHT,
    fonts: loadFonts(),
  });
  return Buffer.from(new Resvg(svg).render().asPng());
}

// Field positions sensible for this design: title/subtitle/monogram are
// baked into the PNG above; these are the dynamic fields rendered on top at
// claim time. signers/signatures ship empty — bound per edition at
// creation (M6's designer keeps signatures in sync with the signer list).
function buildDefaultLayout(templateSha256: string): Layout {
  return {
    version: 1,
    canvas: { width: WIDTH, height: HEIGHT },
    template: { sha256: templateSha256 },
    signers: [],
    fields: {
      student_name: {
        x: 0,
        y: 460 / HEIGHT,
        w: 1,
        h: 110 / HEIGHT,
        size: 68 / HEIGHT,
        color: "#FFFFFF",
        align: "center",
        font: "inter",
        weight: 600,
      },
      date: {
        x: 0,
        y: 592 / HEIGHT,
        w: 1,
        h: 44 / HEIGHT,
        size: 24 / HEIGHT,
        color: "#94A3B8",
        align: "center",
        font: "inter",
        weight: 400,
      },
      cert_id: {
        x: 0,
        y: 1044 / HEIGHT,
        w: 1,
        h: 32 / HEIGHT,
        size: 16 / HEIGHT,
        color: "#94A3B8",
        align: "center",
        font: "inter",
        weight: 400,
      },
      qr: {
        x: 1410 / WIDTH,
        y: 760 / HEIGHT,
        size: 130 / HEIGHT,
      },
    },
    signatures: [],
  };
}

function roundTo4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function round4Fields(layout: Layout): Layout {
  return JSON.parse(JSON.stringify(layout), (_key, value) =>
    typeof value === "number" ? roundTo4(value) : value,
  ) as Layout;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const png = await renderTemplatePng();
  const templateSha256 = sha256Hex(png);

  const layout = layoutSchema.parse(
    round4Fields(buildDefaultLayout(templateSha256)),
  );

  writeFileSync(path.join(OUT_DIR, "default-superteam-br.png"), png);
  writeFileSync(
    path.join(OUT_DIR, "default-layout.json"),
    JSON.stringify(layout, null, 2) + "\n",
  );

  console.log(`Template PNG: ${png.length} bytes`);
  console.log(`Template sha256: ${templateSha256}`);
  console.log(`Written: apps/web/assets/templates/default-superteam-br.png`);
  console.log(`Written: apps/web/assets/templates/default-layout.json`);
}

main().catch((error: unknown) => {
  console.error("gen-default-template falhou:", error);
  process.exitCode = 1;
});
