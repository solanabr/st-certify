import { NextResponse } from "next/server";
import { toAppError, type AppErrorCode } from "@/lib/errors";

/**
 * Every route handler's response envelope (webapp-architecture §4): success is
 * the data itself, failure is `{ error: AppError }`. No other shape leaks out.
 * The matching client-side reader is `api()` in `lib/api-client.ts`.
 */
const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  CHAIN_BLOCKHASH_EXPIRED: 409,
  CHAIN_INSUFFICIENT_FUNDS: 402,
  CHAIN_REJECTED_BY_USER: 400,
  CHAIN_PROGRAM_ERROR: 422,
  CHAIN_RPC_UNAVAILABLE: 503,
  CHAIN_PROGRAM_NOT_DEPLOYED: 503,
  SUPPLY_EXHAUSTED: 409,
  EDITION_NOT_OPEN: 409,
  ALREADY_REQUESTED: 409,
  CERT_STATE_CONFLICT: 409,
  RENDER_FAILED: 500,
  STORAGE_FAILED: 500,
  ATTENDANCE_LINK_INVALID: 404,
  ATTENDANCE_CLOSED: 409,
  ATTENDANCE_SUPPLY_EXHAUSTED: 409,
  ATTENDANCE_ALREADY_CLAIMED: 409,
  ATTENDANCE_NOT_CREATOR: 403,
  SIWS_NONCE_EXPIRED: 401,
  SIWS_INVALID_SIGNATURE: 401,
  INVITE_EMAIL_MISMATCH: 403,
  INVITE_WALLET_TAKEN: 409,
  INTERNAL: 500,
};

/**
 * The `{ error }` half of the envelope, for routes that can't return JSON on success (e.g. an inline PNG).
 *
 * Anything mapping to 5xx is logged first. `toAppError` strips the raw
 * exception text out of the response (see lib/errors.ts), so this is the only
 * place it survives — without it a failing route is silent. 4xx is the client
 * misusing a working route, not an incident, so it stays out of the log.
 */
export function apiError(err: unknown): NextResponse {
  const appError = toAppError(err);
  const status = STATUS_BY_CODE[appError.code];

  if (status >= 500) {
    // The stack names the route file and frame, which is what an on-call
    // reader actually needs — apiRoute has no access to the request path.
    console.error(
      `[api:error] ${appError.code} ${status}:`,
      err instanceof Error ? (err.stack ?? err.message) : String(err),
    );
  }

  return NextResponse.json({ error: appError }, { status });
}

/**
 * Wraps a route handler body: the resolved value becomes the 200 JSON body;
 * a thrown AppError (via `fail()`) becomes `{ error }` at the mapped status.
 * Any other thrown value is normalized through `toAppError` first, so a route
 * handler never needs its own try/catch.
 */
export async function apiRoute<T>(
  handler: () => Promise<T>,
): Promise<NextResponse> {
  try {
    const data = await handler();
    return NextResponse.json(data ?? null);
  } catch (err) {
    return apiError(err);
  }
}
