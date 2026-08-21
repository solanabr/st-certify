import { NextResponse, type NextRequest } from "next/server";

// UX-only: avoids flashing protected pages before the client-side auth check
// kicks in. This is NOT the security boundary — every protected route/action
// must still enforce authorization server-side. lib/auth.ts's real check
// reads `privy-id-token` specifically; check both cookie names here so this
// redirect doesn't misfire if Privy lands one before the other.
export function middleware(request: NextRequest): NextResponse {
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
