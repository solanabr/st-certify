import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { PendingEditionGroup } from "@/lib/db/certificator-queries";

// Everything the handler talks to is faked; the Bearer guard, the aggregation
// and the AppError envelope stay real (route-test style of
// app/api/attendance/claim/__tests__/route.test.ts).
const state = {
  signerRows: [] as Array<{ wallet: string }>,
  signerError: null as { message: string } | null,
  inviteRows: [] as Array<{ wallet: string | null; email: string }>,
  inviteError: null as { message: string } | null,
};

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));
vi.mock("@/lib/db/mutations", () => ({
  dbConfigured: true,
  getServiceClient: () => ({
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        in() {
          return builder;
        },
        not() {
          return builder;
        },
        then(
          resolve: (value: {
            data: unknown[];
            error: { message: string } | null;
          }) => unknown,
        ) {
          return Promise.resolve(
            table === "edition_signers"
              ? { data: state.signerRows, error: state.signerError }
              : { data: state.inviteRows, error: state.inviteError },
          ).then(resolve);
        },
      };
      return builder;
    },
  }),
}));
vi.mock("@/lib/db/certificator-queries", () => ({
  getPendingForSigner: vi.fn(async () => []),
}));
vi.mock("@/lib/email/notify", () => ({
  notifyOnce: vi.fn(async () => ({ sent: true, deduped: false })),
}));

const { getPendingForSigner } = await import("@/lib/db/certificator-queries");
const { notifyOnce } = await import("@/lib/email/notify");
const { GET } = await import("../route");

const SECRET = "cron-secret-value";
const WALLET_A = "AwaLLet11111111111111111111111111111111111";
const WALLET_B = "BwaLLet22222222222222222222222222222222222";

interface FakeResponse {
  body: {
    signers?: number;
    notified?: number;
    skipped?: number;
    error?: { code: string };
  };
  status: number;
}

function group(
  editionAddress: string,
  editionName: string,
  pending: number,
): PendingEditionGroup {
  return {
    editionAddress,
    editionName,
    signerCount: 2,
    callerPosition: 0,
    signers: [],
    certificates: Array.from({ length: pending }, (_unused, index) => ({
      address: `${editionAddress}-cert-${index}`,
      studentName: "Aluno",
      ownerWallet: "OwnerWaLLet1111111111111111111111111111111",
      requestedAt: "2026-08-19T12:00:00Z",
      signerBitmap: 0,
      signedCount: 0,
      signerCount: 2,
    })),
  };
}

function get(authorization?: string): Promise<FakeResponse> {
  const request = {
    headers: new Headers(authorization ? { authorization } : {}),
  } as unknown as NextRequest;
  return GET(request) as unknown as Promise<FakeResponse>;
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://certify.test");
  vi.mocked(getPendingForSigner).mockReset();
  vi.mocked(getPendingForSigner).mockResolvedValue([]);
  vi.mocked(notifyOnce).mockReset();
  vi.mocked(notifyOnce).mockResolvedValue({ sent: true, deduped: false });
  state.signerRows = [];
  state.signerError = null;
  state.inviteRows = [];
  state.inviteError = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/digest — authorization", () => {
  it("rejects a request with no authorization header", async () => {
    const response = await get();

    expect(response.status).toBe(401);
    expect(response.body.error?.code).toBe("UNAUTHORIZED");
    expect(notifyOnce).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer token", async () => {
    const response = await get("Bearer not-the-secret");

    expect(response.status).toBe(401);
    expect(notifyOnce).not.toHaveBeenCalled();
  });

  it("rejects every request when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await get(`Bearer ${SECRET}`);

    expect(response.status).toBe(401);
    expect(notifyOnce).not.toHaveBeenCalled();
  });

  it("accepts the configured bearer token", async () => {
    const response = await get(`Bearer ${SECRET}`);

    expect(response.status).toBe(200);
  });
});

describe("GET /api/cron/digest — digest", () => {
  it("notifies each signer that has pending requests", async () => {
    state.signerRows = [{ wallet: WALLET_A }, { wallet: WALLET_B }];
    state.inviteRows = [
      { wallet: WALLET_A, email: "a@example.test" },
      { wallet: WALLET_B, email: "b@example.test" },
    ];
    vi.mocked(getPendingForSigner).mockImplementation(async (wallets) =>
      wallets[0] === WALLET_A
        ? [group("Ed1t10nA", "Turma A", 3)]
        : [group("Ed1t10nB", "Turma B", 1)],
    );

    const response = await get(`Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ signers: 2, notified: 2 });
    expect(notifyOnce).toHaveBeenCalledTimes(2);
    expect(notifyOnce).toHaveBeenCalledWith({
      to: "a@example.test",
      kind: "requests-pending",
      locale: "pt-BR",
      refId: "Ed1t10nA",
      payload: {
        editionName: "Turma A",
        count: 3,
        signUrl: "https://certify.test/sign",
      },
      minIntervalHours: 20,
    });
    expect(notifyOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "b@example.test",
        payload: expect.objectContaining({ editionName: "Turma B", count: 1 }),
      }),
    );
  });

  it("queries pending work once per distinct signer wallet", async () => {
    state.signerRows = [
      { wallet: WALLET_A },
      { wallet: WALLET_A },
      { wallet: WALLET_B },
    ];

    await get(`Bearer ${SECRET}`);

    expect(getPendingForSigner).toHaveBeenCalledTimes(2);
    expect(getPendingForSigner).toHaveBeenCalledWith([WALLET_A]);
    expect(getPendingForSigner).toHaveBeenCalledWith([WALLET_B]);
  });

  it("skips a signer with pending work but no known email", async () => {
    state.signerRows = [{ wallet: WALLET_A }];
    state.inviteRows = [];
    vi.mocked(getPendingForSigner).mockResolvedValue([
      group("Ed1t10nA", "Turma A", 2),
    ]);

    const response = await get(`Bearer ${SECRET}`);

    expect(response.body).toMatchObject({ notified: 0, skipped: 1 });
    expect(notifyOnce).not.toHaveBeenCalled();
  });

  it("notifies nobody when no request is pending", async () => {
    state.signerRows = [{ wallet: WALLET_A }];
    state.inviteRows = [{ wallet: WALLET_A, email: "a@example.test" }];

    const response = await get(`Bearer ${SECRET}`);

    expect(response.body).toMatchObject({ signers: 0, notified: 0 });
    expect(notifyOnce).not.toHaveBeenCalled();
  });

  it("degrades to no email resolution when signer_invites is unavailable", async () => {
    state.signerRows = [{ wallet: WALLET_A }];
    state.inviteError = { message: 'relation "signer_invites" does not exist' };
    vi.mocked(getPendingForSigner).mockResolvedValue([
      group("Ed1t10nA", "Turma A", 2),
    ]);

    const response = await get(`Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ notified: 0, skipped: 1 });
  });

  it("sends one notice per edition when a signer has several", async () => {
    state.signerRows = [{ wallet: WALLET_A }];
    state.inviteRows = [{ wallet: WALLET_A, email: "a@example.test" }];
    vi.mocked(getPendingForSigner).mockResolvedValue([
      group("Ed1t10nA", "Turma A", 2),
      group("Ed1t10nB", "Turma B", 5),
    ]);

    const response = await get(`Bearer ${SECRET}`);

    expect(notifyOnce).toHaveBeenCalledTimes(2);
    expect(response.body).toMatchObject({ signers: 1, notified: 2 });
  });
});
