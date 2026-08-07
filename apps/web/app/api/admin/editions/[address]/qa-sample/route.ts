export const runtime = "nodejs";

import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { dbConfigured, getEditionByAddress } from "@/lib/db/queries";
import { renderCertificate } from "@/lib/render/render";
import { layoutSchema } from "@/lib/render/layout";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "assets",
  "templates",
  "default-superteam-br.png",
);

/**
 * Wizard step 5 (QA): renders the edition's actual stored layout with dummy
 * student data so the admin can eyeball it before opening. Returns the PNG
 * inline — the one route that can't use `apiRoute`'s JSON-only envelope, so
 * errors go through `apiError` directly instead.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
): Promise<Response> {
  try {
    await requireSysadmin();
    const { address } = await params;

    if (!dbConfigured) {
      fail("INTERNAL", "Supabase não configurado.");
    }

    const edition = await getEditionByAddress(address);
    if (!edition || !edition.layout) {
      fail("NOT_FOUND", "Edição não encontrada.");
    }

    const layout = layoutSchema.parse(edition.layout);
    const templatePng = readFileSync(TEMPLATE_PATH);

    const dateText = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const { png } = await renderCertificate({
      templatePng,
      layout,
      values: {
        studentName: "Maria da Silva (exemplo)",
        dateText,
        certId: "CERT-QA-SAMPLE",
        verifyUrl: `${appUrl}/verify/qa-sample`,
      },
      signers: layout.signers.map((s) => ({ name: s.name, role: s.role })),
    });

    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return apiError(err);
  }
}
