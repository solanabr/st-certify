import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { fail } from "@/lib/errors";
import { dbConfigured, getEditionBySlug } from "@/lib/db/queries";
import type { EditionWithSigners } from "@/lib/db/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  return apiRoute(async (): Promise<EditionWithSigners> => {
    const { slug } = await params;
    if (!dbConfigured) {
      fail("NOT_FOUND", "Edição não encontrada.");
    }
    const edition = await getEditionBySlug(slug);
    if (!edition) {
      fail("NOT_FOUND", "Edição não encontrada.");
    }
    return edition;
  });
}
