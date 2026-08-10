export const runtime = "nodejs";

import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { renderCertificate } from "@/lib/render/render";
import { layoutSchema, type Layout } from "@/lib/render/layout";
import rawDefaultLayout from "@/assets/templates/default-layout.json";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "assets",
  "templates",
  "default-superteam-br.png",
);

// Two signature boxes sized/positioned for a 2-signer sample — the
// committed default-layout.json ships with signatures: [] (bound per
// edition by the M6 designer), so this dev-only route adds sample boxes to
// actually exercise the signature-block + auto-shrink rendering path.
const SAMPLE_SIGNATURE_BOXES: Layout["signatures"] = [
  { x: 0.15, y: 0.725, w: 0.2875, h: 0.1415, align: "center" },
  { x: 0.5625, y: 0.725, w: 0.2875, h: 0.1415, align: "center" },
];

const SAMPLE_SIGNERS = [
  { name: "Ana Beatriz Souza", role: "Head de Comunidade" },
  { name: "Rafael Oliveira", role: "Diretor de Programas" },
];

/** Dev-only eyeball QA for the renderer. 404s outside development. */
export async function GET(): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const templatePng = readFileSync(TEMPLATE_PATH);
  const baseLayout = layoutSchema.parse(rawDefaultLayout);
  const sampleLayout: Layout = {
    ...baseLayout,
    signatures: SAMPLE_SIGNATURE_BOXES,
  };

  const dateText = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { png } = await renderCertificate({
    templatePng,
    layout: sampleLayout,
    values: {
      studentName: "Maria da Silva",
      dateText,
      certId: "CERT-DEV-SAMPLE-0001",
      verifyUrl: `${appUrl}/verify/dev-sample`,
    },
    signers: SAMPLE_SIGNERS,
  });

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
