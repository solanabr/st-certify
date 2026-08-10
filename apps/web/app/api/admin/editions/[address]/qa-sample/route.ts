export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Resvg } from "@resvg/resvg-js";
import { apiError } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail, toAppError } from "@/lib/errors";
import { dbConfigured, getEditionByAddress } from "@/lib/db/queries";
import { renderCertificate } from "@/lib/render/render";
import { getTemplateBytes } from "@/lib/render/storage";
import { layoutSchema, type Layout } from "@/lib/render/layout";

const UNAVAILABLE_MESSAGE =
  "Pré-visualização indisponível: template personalizado sem Supabase configurado.";

/**
 * A dark placeholder frame with a centered message, sized to the edition's
 * own canvas — degradation for a custom template whose bytes can't be
 * resolved (Supabase not configured). Returned as a real PNG (not JSON)
 * because the wizard embeds this route directly as an `<img src>` with no
 * response-body handling of its own.
 */
function renderUnavailablePlaceholder(canvas: Layout["canvas"]): Buffer {
  const fontSize = Math.round(canvas.height * 0.032);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
<rect width="100%" height="100%" fill="#11131A"/>
<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${fontSize}" fill="#B7C0D8">${UNAVAILABLE_MESSAGE}</text>
</svg>`;
  return Buffer.from(new Resvg(svg).render().asPng());
}

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

    let templatePng: Buffer;
    try {
      templatePng = await getTemplateBytes(layout.template.sha256);
    } catch (err) {
      if (toAppError(err).code === "STORAGE_FAILED") {
        return new NextResponse(
          new Uint8Array(renderUnavailablePlaceholder(layout.canvas)),
          {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "no-store",
            },
          },
        );
      }
      throw err;
    }

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
