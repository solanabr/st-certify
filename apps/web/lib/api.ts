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
  INTERNAL: 500,
};

/** The `{ error }` half of the envelope, for routes that can't return JSON on success (e.g. an inline PNG). */
export function apiError(err: unknown): NextResponse {
  const appError = toAppError(err);
  return NextResponse.json(
    { error: appError },
    { status: STATUS_BY_CODE[appError.code] },
  );
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
