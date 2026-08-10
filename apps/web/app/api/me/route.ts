import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { getSessionUser, type Role } from "@/lib/auth";

export interface MeResponse {
  authenticated: boolean;
  did: string | null;
  email: string | null;
  wallets: string[];
  role: Role;
  isCertifier: boolean;
}

/** Never throws for an anonymous visitor — that's an expected state for the nav, not an error. */
export async function GET(): Promise<NextResponse> {
  return apiRoute(async (): Promise<MeResponse> => {
    const session = await getSessionUser();
    if (!session) {
      return {
        authenticated: false,
        did: null,
        email: null,
        wallets: [],
        role: "student",
        isCertifier: false,
      };
    }
    return { authenticated: true, ...session };
  });
}
