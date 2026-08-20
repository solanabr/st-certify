import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, apiRoute } from "../api";
import { fail, toAppError, type AppError } from "../errors";

/** A string that must never reach the client: stands in for a DB/RPC/config leak. */
const SECRET =
  "postgres://admin:hunter2@db.internal:5432 relation does not exist";

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

async function envelope(
  res: Response,
): Promise<{ status: number; error: AppError; raw: string }> {
  const raw = await res.text();
  return { status: res.status, error: JSON.parse(raw).error, raw };
}

describe("apiError — expected AppErrors", () => {
  it("preserves the user-facing detail an author wrote at the throw site", async () => {
    const err = (() => {
      try {
        fail("VALIDATION", "Nome inválido.", {
          detail: "O nome deve ter ao menos 3 caracteres.",
          field: "studentName",
        });
      } catch (e) {
        return e;
      }
    })();

    const { status, error } = await envelope(apiError(err));

    expect(status).toBe(400);
    expect(error).toMatchObject({
      code: "VALIDATION",
      message: "Nome inválido.",
      detail: "O nome deve ter ao menos 3 caracteres.",
      field: "studentName",
      retryable: false,
    });
  });

  it("carries retryable and action hints through untouched", async () => {
    const err = (() => {
      try {
        fail("CHAIN_INSUFFICIENT_FUNDS", "Saldo insuficiente.", {
          retryable: true,
          action: "airdrop",
        });
      } catch (e) {
        return e;
      }
    })();

    const { status, error } = await envelope(apiError(err));

    expect(status).toBe(402);
    expect(error.retryable).toBe(true);
    expect(error.action).toBe("airdrop");
  });

  it("does not log a 4xx — a client misusing a working route is not an incident", () => {
    const err = (() => {
      try {
        fail("RATE_LIMITED", "Muitas tentativas.", { detail: "Aguarde 60s." });
      } catch (e) {
        return e;
      }
    })();

    apiError(err);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs a deliberate 5xx but still keeps its authored detail", async () => {
    const err = (() => {
      try {
        fail("STORAGE_FAILED", "Falha ao armazenar.", {
          detail: "bucket indisponível",
        });
      } catch (e) {
        return e;
      }
    })();

    const { status, error } = await envelope(apiError(err));

    expect(status).toBe(500);
    expect(error.detail).toBe("bucket indisponível");
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});

describe("apiError — unexpected exceptions", () => {
  it("redacts the raw exception message out of the response entirely", async () => {
    const { status, error, raw } = await envelope(apiError(new Error(SECRET)));

    expect(status).toBe(500);
    expect(error.code).toBe("INTERNAL");
    expect(error.message).toBe("Ocorreu um erro inesperado. Tente novamente.");
    expect(error.detail).toBeUndefined();
    // Nothing anywhere in the serialized envelope, not just the detail field.
    expect(raw).not.toContain("hunter2");
    expect(raw).not.toContain(SECRET);
  });

  it("logs the raw message server-side under a greppable prefix", () => {
    apiError(new Error(SECRET));

    expect(errorSpy).toHaveBeenCalledOnce();
    const [prefix, detail] = errorSpy.mock.calls[0];
    expect(prefix).toContain("[api:error]");
    expect(prefix).toContain("INTERNAL");
    expect(String(detail)).toContain(SECRET);
  });

  it("redacts thrown non-Error values too", async () => {
    const { status, error, raw } = await envelope(apiError(SECRET));

    expect(status).toBe(500);
    expect(error.code).toBe("INTERNAL");
    expect(error.detail).toBeUndefined();
    expect(raw).not.toContain("hunter2");
  });

  it("toAppError alone drops the detail, so non-route callers cannot leak it either", () => {
    expect(toAppError(new Error(SECRET))).toEqual({
      code: "INTERNAL",
      message: "Ocorreu um erro inesperado. Tente novamente.",
      retryable: true,
    });
  });
});

describe("apiError — status mapping", () => {
  const CASES: [Parameters<typeof fail>[0], number][] = [
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["VALIDATION", 400],
    ["RATE_LIMITED", 429],
    ["CONFLICT", 409],
    ["CHAIN_INSUFFICIENT_FUNDS", 402],
    ["CHAIN_PROGRAM_ERROR", 422],
    ["CHAIN_RPC_UNAVAILABLE", 503],
    ["SUPPLY_EXHAUSTED", 409],
    ["ATTENDANCE_LINK_INVALID", 404],
    ["ATTENDANCE_NOT_CREATOR", 403],
    ["SIWS_INVALID_SIGNATURE", 401],
    ["RENDER_FAILED", 500],
    ["INTERNAL", 500],
  ];

  it.each(CASES)("maps %s to HTTP %i", (code, expected) => {
    const err = (() => {
      try {
        fail(code, "mensagem");
      } catch (e) {
        return e;
      }
    })();

    expect(apiError(err).status).toBe(expected);
  });
});

describe("apiRoute", () => {
  it("returns the resolved value as the 200 body", async () => {
    const res = await apiRoute(async () => ({ ok: true, count: 2 }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, count: 2 });
  });

  it("serializes a void handler as null rather than an empty body", async () => {
    const res = await apiRoute(async () => undefined);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toBeNull();
  });

  it("turns a fail() into the mapped status without logging it", async () => {
    const res = await apiRoute(async () => {
      fail("ATTENDANCE_ALREADY_CLAIMED", "Você já resgatou este evento.");
    });
    const { error } = await envelope(res);

    expect(res.status).toBe(409);
    expect(error.message).toBe("Você já resgatou este evento.");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("redacts an unexpected throw and logs it instead", async () => {
    const res = await apiRoute(async () => {
      throw new Error(SECRET);
    });
    const { status, error, raw } = await envelope(res);

    expect(status).toBe(500);
    expect(error.code).toBe("INTERNAL");
    expect(raw).not.toContain("hunter2");
    expect(String(errorSpy.mock.calls[0][1])).toContain(SECRET);
  });
});
