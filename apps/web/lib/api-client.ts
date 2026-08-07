import { fail, type AppError } from "@/lib/errors";

function isErrorEnvelope(body: unknown): body is { error: AppError } {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "object"
  );
}

/**
 * The single client-side fetch wrapper (webapp-architecture §4): every hook
 * and mutation reads the API through this. Throws an `AppError`-shaped
 * exception on `{ error }` responses or network failure, so callers get one
 * error-handling code path via `onAppError` (see `lib/api-client-error.ts`
 * usage in hooks).
 */
export async function api<T>(
  input: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, ...rest } = init ?? {};

  let response: Response;
  try {
    response = await fetch(input, {
      ...rest,
      method: rest.method ?? (json !== undefined ? "POST" : "GET"),
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    fail("CHAIN_RPC_UNAVAILABLE", "Falha de rede. Verifique sua conexão.", {
      retryable: true,
    });
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || isErrorEnvelope(body)) {
    if (isErrorEnvelope(body)) {
      const { code, message, detail, field, retryable, action } = body.error;
      fail(code, message, { detail, field, retryable, action });
    }
    fail("INTERNAL", "Ocorreu um erro inesperado. Tente novamente.", {
      retryable: true,
    });
  }

  return body as T;
}
