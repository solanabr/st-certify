import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CertificateRow } from "@/lib/db/types";

// Style of the reject route's test: chain/DB/mail edges faked, the
// before/after FullySigned delta logic under test is real.
const afterTasks: Array<Promise<unknown>> = [];

vi.mock("next/server", () => ({
  after: (task: () => Promise<unknown> | unknown) => {
    afterTasks.push(Promise.resolve(task()));
  },
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));
vi.mock("@/lib/auth", () => ({
  requireCertifier: vi.fn(async () => ({
    did: "did:privy:signer",
    email: "signer@example.test",
    wallets: ["SignerWaLLet"],
    role: "student",
    isCertifier: true,
  })),
}));
vi.mock("@/lib/chain/server", () => ({
  submitAndSyncTransaction: vi.fn(),
}));
vi.mock("@/lib/db/queries", () => ({ getCertificateByAddress: vi.fn() }));
vi.mock("@/lib/db/certificator-queries", () => ({
  isWalletSignerOfEdition: vi.fn(async () => true),
}));
vi.mock("@/lib/db/notification-queries", () => ({
  getCertificateNotificationContext: vi.fn(),
}));
vi.mock("@/lib/email/notify", () => ({
  notifyOnce: vi.fn(async () => ({ sent: true, deduped: false })),
}));

const { submitAndSyncTransaction } = await import("@/lib/chain/server");
const { getCertificateByAddress } = await import("@/lib/db/queries");
const { getCertificateNotificationContext } =
  await import("@/lib/db/notification-queries");
const { notifyOnce } = await import("@/lib/email/notify");
const { POST } = await import("../route");

const EDITION = "Ed1t10n";
const ADDR_A = "CertA";
const ADDR_B = "CertB";

function cert(
  address: string,
  status: CertificateRow["status"],
): CertificateRow {
  return {
    address,
    edition_address: EDITION,
    status,
  } as unknown as CertificateRow;
}

interface FakeResponse {
  body: { error?: { code: string } };
  status: number;
}

async function post(addresses: string[]): Promise<FakeResponse> {
  const request = {
    json: async () => ({
      wireBytesBase64: "AAAA",
      lastValidBlockHeight: "123",
      certificateAddresses: addresses,
      editionAddress: EDITION,
    }),
  } as unknown as Request;
  const response = (await POST(request)) as unknown as FakeResponse;
  await Promise.all(afterTasks.splice(0));
  return response;
}

beforeEach(() => {
  afterTasks.length = 0;
  vi.clearAllMocks();
  vi.mocked(submitAndSyncTransaction).mockResolvedValue({
    signature: "5xSignSig",
    alreadyProcessed: false,
  });
  vi.mocked(getCertificateNotificationContext).mockResolvedValue({
    certificateAddress: ADDR_A,
    studentName: "Ana Souza",
    studentEmail: "ana@example.test",
    editionAddress: EDITION,
    editionName: "Turma A",
  });
  vi.mocked(notifyOnce).mockResolvedValue({ sent: true, deduped: false });
});

describe("POST /api/certificator/submit — cert-ready notification", () => {
  it("notifies only the certificate that just became FullySigned", async () => {
    // Pre-submit lookups (validation), then post-sync re-reads: A flips to
    // FullySigned, B stays Requested.
    vi.mocked(getCertificateByAddress).mockImplementation(async (addr) => {
      const calls = vi.mocked(getCertificateByAddress).mock.calls.length;
      const postSync = calls > 2;
      if (addr === ADDR_A) {
        return cert(ADDR_A, postSync ? "FullySigned" : "Requested");
      }
      return cert(ADDR_B, "Requested");
    });

    const response = await post([ADDR_A, ADDR_B]);

    expect(response.status).toBe(200);
    expect(notifyOnce).toHaveBeenCalledTimes(1);
    expect(notifyOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "cert-ready",
        refId: ADDR_A,
        to: "ana@example.test",
        payload: expect.objectContaining({
          studentName: "Ana Souza",
          editionName: "Turma A",
          claimUrl: expect.stringContaining("/me"),
        }),
      }),
    );
  });

  it("stays silent when nothing newly completed", async () => {
    vi.mocked(getCertificateByAddress).mockResolvedValue(
      cert(ADDR_A, "Requested"),
    );

    await post([ADDR_A]);

    expect(notifyOnce).not.toHaveBeenCalled();
  });

  it("skips certificates that were already FullySigned before this chunk", async () => {
    vi.mocked(getCertificateByAddress).mockResolvedValue(
      cert(ADDR_A, "FullySigned"),
    );

    await post([ADDR_A]);

    expect(notifyOnce).not.toHaveBeenCalled();
  });

  it("stays silent on a replayed submission", async () => {
    vi.mocked(submitAndSyncTransaction).mockResolvedValue({
      signature: "5xSignSig",
      alreadyProcessed: true,
    });
    vi.mocked(getCertificateByAddress).mockResolvedValue(
      cert(ADDR_A, "FullySigned"),
    );

    await post([ADDR_A]);

    expect(notifyOnce).not.toHaveBeenCalled();
  });

  it("a notification failure never fails the batch", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getCertificateByAddress).mockImplementation(async () =>
      cert(
        ADDR_A,
        vi.mocked(getCertificateByAddress).mock.calls.length > 1
          ? "FullySigned"
          : "Requested",
      ),
    );
    vi.mocked(notifyOnce).mockRejectedValue(new Error("smtp down"));

    const response = await post([ADDR_A]);

    expect(response.status).toBe(200);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
