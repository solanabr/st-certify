import { NextResponse, type NextRequest } from "next/server";
// flag.ts is the zero-server-import half of lib/mock (Edge-safe: reads only
// process.env, never next/headers) — safe to pull into the Edge middleware.
import { isUiMock } from "@/lib/mock/flag";

// UX-only: avoids flashing protected pages before the client-side auth check
// kicks in. This is NOT the security boundary — every protected route/action
// must still enforce authorization server-side. lib/auth.ts's real check
// reads `privy-id-token` specifically; check both cookie names here so this
// redirect doesn't misfire if Privy lands one before the other.
export function middleware(request: NextRequest): NextResponse {
  // UI-mock mode has no Privy cookie by design; without this the cookie-gate
  // would bounce every protected route to "/", making the authed screens
  // unreviewable. The per-page requireX helpers still resolve the mock role.
  if (isUiMock()) {
    return NextResponse.next();
  }

  const hasSession =
    request.cookies.has("privy-token") || request.cookies.has("privy-id-token");

  if (!hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/studio/:path*", "/sign", "/me"],
};
