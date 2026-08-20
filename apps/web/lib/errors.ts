export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "CHAIN_BLOCKHASH_EXPIRED"
  | "CHAIN_INSUFFICIENT_FUNDS"
  | "CHAIN_REJECTED_BY_USER"
  | "CHAIN_PROGRAM_ERROR"
  | "CHAIN_RPC_UNAVAILABLE"
  | "CHAIN_PROGRAM_NOT_DEPLOYED"
  | "SUPPLY_EXHAUSTED"
  | "EDITION_NOT_OPEN"
  | "ALREADY_REQUESTED"
  | "CERT_STATE_CONFLICT"
  | "RENDER_FAILED"
  | "STORAGE_FAILED"
  | "ATTENDANCE_LINK_INVALID"
  | "ATTENDANCE_CLOSED"
  | "ATTENDANCE_SUPPLY_EXHAUSTED"
  | "ATTENDANCE_ALREADY_CLAIMED"
  | "ATTENDANCE_NOT_CREATOR"
  | "SIWS_NONCE_EXPIRED"
  | "SIWS_INVALID_SIGNATURE"
  | "INTERNAL";

export type AppErrorAction = "airdrop" | "retry" | "login" | "goto-me";

export interface AppError {
  code: AppErrorCode;
  /** User-facing message, pt-BR, written at the throw site. */
  message: string;
  detail?: string;
  field?: string;
  retryable: boolean;
  action?: AppErrorAction;
}

interface FailOptions {
  detail?: string;
  field?: string;
  retryable?: boolean;
  action?: AppErrorAction;
}

class AppErrorException extends Error implements AppError {
  code: AppErrorCode;
  detail?: string;
  field?: string;
  retryable: boolean;
  action?: AppErrorAction;

  constructor(err: AppError) {
    super(err.message);
    this.name = "AppErrorException";
    this.code = err.code;
    this.detail = err.detail;
    this.field = err.field;
    this.retryable = err.retryable;
    this.action = err.action;
  }
}

/** Throws a well-formed AppError. `message` is user-facing pt-BR, written at the call site. */
export function fail(
  code: AppErrorCode,
  message: string,
  opts?: FailOptions,
): never {
  throw new AppErrorException({
    code,
    message,
    retryable: opts?.retryable ?? false,
    detail: opts?.detail,
    field: opts?.field,
    action: opts?.action,
  });
}

/** True when `error` came from `fail()`, i.e. its message and detail were written for a human to read. */
export function isAppError(error: unknown): error is AppError & Error {
  return error instanceof AppErrorException;
}

/**
 * Normalizes any caught value into an AppError, for use at catch boundaries (API routes, actions).
 *
 * Only errors thrown through `fail()` keep their `detail`. Anything else is an
 * unexpected exception whose message routinely carries internals — Postgres
 * error text, RPC endpoints with keys in the query string, filesystem paths —
 * so it collapses to the generic INTERNAL error with no `detail` at all. The
 * raw text is not lost: `apiError` logs it server-side before responding.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppErrorException) {
    return {
      code: error.code,
      message: error.message,
      detail: error.detail,
      field: error.field,
      retryable: error.retryable,
      action: error.action,
    };
  }

  return {
    code: "INTERNAL",
    message: "Ocorreu um erro inesperado. Tente novamente.",
    retryable: true,
  };
}
