import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { dbConfigured, listOpenEditions } from "@/lib/db/queries";
import type { EditionWithSigners } from "@/lib/db/types";

export async function GET(): Promise<NextResponse> {
  return apiRoute(async (): Promise<EditionWithSigners[]> => {
    if (!dbConfigured) {
      return [];
    }
    return listOpenEditions();
  });
}
