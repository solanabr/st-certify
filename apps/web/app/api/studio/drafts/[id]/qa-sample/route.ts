export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { getDraft, listInvites } from "@/lib/db/draft-queries";
import { autoSignatureBoxes } from "@/lib/editions/create";
import { layoutSchema } from "@/lib/render/layout";
import { renderQaSamplePng } from "@/lib/render/qa-sample";
import rawDefaultLayout from "@/assets/templates/default-layout.json";

/**
 * Wizard step 5's preview, rendered straight from the draft — the whole point
 * of the draft-first flow is that reviewing a sample costs nothing and creates
 * nothing. Previously this render was only reachable *after* `create_edition`
 * had already run, which made "let me see it first" a chain write.
 *
 * The seats supply the printed names and roles even before they have wallets,
 * so a preview works from the moment step 2 has anyone on it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireSysadmin();
    const { id } = await params;

    const draft = await getDraft(id);
    if (!draft) {
      fail("NOT_FOUND", "Rascunho não encontrado.");
    }

    const seats = await listInvites(id);
    const signers = seats.map((seat) => ({
      name: seat.name,
      role: seat.role,
    }));

    // A stored layout is the designer's output; without one the draft is on
    // the default-template path, whose signature boxes are laid out for the
    // seat count the same way the real create does it.
    const layout = draft.layout
      ? layoutSchema.parse(draft.layout)
      : layoutSchema.parse({
          ...rawDefaultLayout,
          signatures: autoSignatureBoxes(signers.length),
        });

    const png = await renderQaSamplePng(layout, signers);

    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return apiError(err);
  }
}
