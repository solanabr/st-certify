// M0-spikeC: prove satori + @resvg/resvg-js produce byte-identical PNGs
// for identical inputs, and different bytes for different inputs, on
// darwin-arm64 with the exact building blocks the product will use.
//
// Run: npm start   (== tsx index.ts)

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WIDTH = 1600;
const HEIGHT = 1131;

// Satori accepts plain objects shaped like React elements — no JSX/React
// dependency required. This is the minimal shape we need.
type SatoriNode = {
  type: string;
  props: Record<string, unknown> & {
    children?: SatoriNode | SatoriNode[] | string;
  };
};

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Step 1: background PNG via resvg rendering a hand-built SVG rect + border. */
function renderBackgroundPng(): Buffer {
  const inset = 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#0B0F1A" />
  <rect x="${inset}" y="${inset}" width="${WIDTH - inset * 2}" height="${HEIGHT - inset * 2}" fill="none" stroke="#3A4B7A" stroke-width="3" />
</svg>`;
  const resvg = new Resvg(svg);
  return resvg.render().asPng();
}

/** Step 2: fonts — satori wants { name, data, weight, style }. */
function loadFonts() {
  const fontsDir = path.join(__dirname, "fonts");
  return [
    {
      name: "Inter",
      data: readFileSync(path.join(fontsDir, "Inter-Regular.ttf")),
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: "Inter",
      data: readFileSync(path.join(fontsDir, "Inter-SemiBold.ttf")),
      weight: 600 as const,
      style: "normal" as const,
    },
    {
      name: "Great Vibes",
      data: readFileSync(path.join(fontsDir, "GreatVibes-Regular.ttf")),
      weight: 400 as const,
      style: "normal" as const,
    },
  ];
}

/** Step 3: element tree, plain objects, no JSX. */
function buildTree(
  studentName: string,
  certId: string,
  bgDataUri: string,
): SatoriNode {
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
        // full-bleed background image (data URI — satori can't fetch bare paths)
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
        // QR-sized placeholder (top-left) — real QR lib comes later
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: "80px",
              left: "80px",
              width: "140px",
              height: "140px",
              display: "flex",
              backgroundColor: "#0F1522",
            },
          },
        },
        // student name — centered, explicit box, needed for text wrap control
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: "420px",
              left: "0px",
              width: `${WIDTH}px`,
              height: "100px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              fontSize: "72px",
              fontWeight: 600,
              color: "#FFFFFF",
              fontFamily: "Inter",
            },
            children: studentName,
          },
        },
        // date
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: "560px",
              left: "0px",
              width: `${WIDTH}px`,
              height: "40px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              fontSize: "24px",
              fontWeight: 400,
              color: "#B7C0D8",
              fontFamily: "Inter",
            },
            children: "07/08/2026",
          },
        },
        // signature block: script name over a 1px rule + title
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: "820px",
              left: "520px",
              width: "560px",
              height: "160px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    fontFamily: "Great Vibes",
                    fontSize: "48px",
                    fontWeight: 400,
                    color: "#FFFFFF",
                  },
                  children: "Maria Santos",
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    width: "360px",
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
                  children: "Head of Community",
                },
              },
            ],
          },
        },
        // cert id line, monospace-ish (Inter + letter-spacing)
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: "1040px",
              left: "0px",
              width: `${WIDTH}px`,
              height: "30px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              fontSize: "18px",
              fontWeight: 400,
              letterSpacing: "2px",
              color: "#7C879E",
              fontFamily: "Inter",
            },
            children: certId,
          },
        },
      ],
    },
  };
}

async function renderCertificatePng(
  studentName: string,
  certId: string,
  bgDataUri: string,
  fonts: ReturnType<typeof loadFonts>,
): Promise<Buffer> {
  // satori's ReactNode type is a vendored minimal type; our plain-object
  // tree matches its runtime shape, hence the cast.
  const svg = await satori(buildTree(studentName, certId, bgDataUri) as never, {
    width: WIDTH,
    height: HEIGHT,
    fonts,
  });
  const resvg = new Resvg(svg);
  return resvg.render().asPng();
}

async function main() {
  const t0 = Date.now();
  const bgPng = renderBackgroundPng();
  writeFileSync(path.join(__dirname, "bg.png"), bgPng);
  const bgDataUri = `data:image/png;base64,${bgPng.toString("base64")}`;
  const tBg = Date.now();

  const fonts = loadFonts();
  const tFonts = Date.now();

  const nameA = "Maria da Silva Ünïçõdé";
  const nameB = "João Pereira";
  const certId = "CERT-ID: ST-2026-0000714-BR";

  const png1 = await renderCertificatePng(nameA, certId, bgDataUri, fonts);
  const tRender1 = Date.now();
  const png2 = await renderCertificatePng(nameA, certId, bgDataUri, fonts);
  const tRender2 = Date.now();
  const png3 = await renderCertificatePng(nameB, certId, bgDataUri, fonts);
  const tRender3 = Date.now();

  const hash1 = sha256(png1);
  const hash2 = sha256(png2);
  const hash3 = sha256(png3);

  writeFileSync(path.join(__dirname, "out-1.png"), png1);
  writeFileSync(path.join(__dirname, "out-2.png"), png2);
  writeFileSync(path.join(__dirname, "out-3-distinct.png"), png3);

  const deterministic = hash1 === hash2;
  const distinct = hash1 !== hash3;

  console.log("--- SPIKE_C timing (ms) ---");
  console.log(`bg render:        ${tBg - t0}`);
  console.log(`font load:        ${tFonts - tBg}`);
  console.log(`render 1 (cold):  ${tRender1 - tFonts}`);
  console.log(`render 2 (warm):  ${tRender2 - tRender1}`);
  console.log(`render 3 (diff):  ${tRender3 - tRender2}`);
  console.log(`hash1 (nameA #1): ${hash1}`);
  console.log(`hash2 (nameA #2): ${hash2}`);
  console.log(`hash3 (nameB):    ${hash3}`);
  console.log(`png1 bytes: ${png1.length}, png3 bytes: ${png3.length}`);

  if (deterministic && distinct) {
    console.log(`SPIKE_C: PASS hash=${hash1} deterministic=yes distinct=yes`);
    process.exitCode = 0;
  } else {
    console.log(
      `SPIKE_C: FAIL deterministic=${deterministic ? "yes" : "no"} distinct=${distinct ? "yes" : "no"} hash1=${hash1} hash2=${hash2} hash3=${hash3}`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("SPIKE_C: FAIL error=", err);
  process.exitCode = 1;
});
