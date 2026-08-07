import { NextResponse, type NextRequest } from "next/server";

// UX-only: avoids flashing protected pages before the client-side auth check
// kicks in. This is NOT the security boundary — every protected route/action
// must still enforce authorization server-side.
export function middleware(request: NextRequest): NextResponse {
  const hasSession = request.cookies.has("privy-token");

  if (!hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/certificator", "/me"],
};
