export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { dbConfigured, getEditionByAddress } from "@/lib/db/queries";
import { renderQaSamplePng } from "@/lib/render/qa-sample";
import { layoutSchema } from "@/lib/render/layout";

/**
 * Renders a created edition's stored layout with dummy student data. Returns
 * the PNG inline — the one route shape that can't use `apiRoute`'s JSON-only
 * envelope, so errors go through `apiError` directly instead.
 *
 * The draft-first wizard previews from `/api/studio/drafts/[id]/qa-sample`
 * instead; this stays for editions that already exist on-chain.
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
    const png = await renderQaSamplePng(
      layout,
      layout.signers.map((s) => ({ name: s.name, role: s.role })),
    );

    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return apiError(err);
  }
}
