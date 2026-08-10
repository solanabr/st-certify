import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireSysadmin } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { slugSchema } from "@/lib/schemas";
import { dbConfigured, isSlugAvailable } from "@/lib/db/queries";

export interface SlugAvailableResponse {
  available: boolean;
}

/** Wizard step-1 blur check. */
export async function GET(request: Request): Promise<NextResponse> {
  return apiRoute(async (): Promise<SlugAvailableResponse> => {
    await requireSysadmin();

    const url = new URL(request.url);
    const parsed = slugSchema.safeParse(url.searchParams.get("slug") ?? "");
    if (!parsed.success) {
      fail("VALIDATION", parsed.error.issues[0]?.message ?? "Slug inválido.");
    }

    if (!dbConfigured) {
      return { available: true };
    }
    return { available: await isSlugAvailable(parsed.data) };
  });
}
