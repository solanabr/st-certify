import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CertificateRow } from "@/lib/db/types";

// Mocked BEFORE importing the route, per vitest's hoisting contract. The
// chain-side reject and the mirror flip are existing behaviour; the assertion
// here is that the student is told, and told the reason.
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
    role: "user",
    isCertifier: true,
  })),
}));
vi.mock("@/lib/chain/server", () => ({
  submitAndSyncTransaction: vi.fn(async () => ({
    signature: "5xRejectSig",
    alreadyProcessed: false,
  })),
  certificateExistsOnChain: vi.fn(async () => false),
}));
vi.mock("@/lib/db/queries", () => ({ getCertificateByAddress: vi.fn() }));
vi.mock("@/lib/db/certificator-queries", () => ({
  isWalletSignerOfEdition: vi.fn(async () => true),
}));
vi.mock("@/lib/db/certificator-mutations", () => ({
  markCertificateRejected: vi.fn(async () => {}),
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

const ADDR = "Cert111";
const EDITION = "Ed1t10n";
const REASON = "Nome divergente da lista de presença.";

const CERT = {
  address: ADDR,
  edition_address: EDITION,
  status: "Requested",
} as unknown as CertificateRow;

interface FakeResponse {
  body: { signature?: string; error?: { code: string } };
  status: number;
}

const OMIT_REASON = Symbol("omit-reason");

async function post(
  reason: string | typeof OMIT_REASON = REASON,
): Promise<FakeResponse> {
  const request = {
    json: async () => ({
      wireBytesBase64: "AAAA",
      lastValidBlockHeight: "123",
      certificateAddress: ADDR,
      editionAddress: EDITION,
      ...(reason === OMIT_REASON ? {} : { reason }),
    }),
  } as unknown as Request;
  const response = (await POST(request)) as unknown as FakeResponse;
  await Promise.all(afterTasks.splice(0));
  return response;
}

beforeEach(() => {
  afterTasks.length = 0;
  vi.clearAllMocks();
  vi.mocked(getCertificateByAddress).mockResolvedValue(CERT);
  vi.mocked(submitAndSyncTransaction).mockResolvedValue({
    signature: "5xRejectSig",
    alreadyProcessed: false,
  });
  vi.mocked(getCertificateNotificationContext).mockResolvedValue({
    certificateAddress: ADDR,
    studentName: "Ana Souza",
    studentEmail: "ana@example.test",
    editionAddress: EDITION,
    editionName: "Turma A",
  });
  vi.mocked(notifyOnce).mockResolvedValue({ sent: true, deduped: false });
});

describe("POST /api/certificator/reject — notification", () => {
  it("tells the student why, keyed on the certificate", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(notifyOnce).toHaveBeenCalledWith({
      to: "ana@example.test",
      kind: "cert-rejected",
      locale: "pt-BR",
      refId: ADDR,
      payload: {
        studentName: "Ana Souza",
        editionName: "Turma A",
        reason: REASON,
      },
    });
  });

  it("carries a null reason rather than the string 'undefined'", async () => {
    await post(OMIT_REASON);

    expect(notifyOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ reason: null }),
      }),
    );
  });

  it("stays silent on a replayed submission", async () => {
    vi.mocked(submitAndSyncTransaction).mockResolvedValue({
      signature: "5xRejectSig",
      alreadyProcessed: true,
    });

    await post();

    expect(notifyOnce).not.toHaveBeenCalled();
  });

  it("skips with a log line when no email resolves for the student", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getCertificateNotificationContext).mockResolvedValue({
      certificateAddress: ADDR,
      studentName: "Ana Souza",
      studentEmail: null,
      editionAddress: EDITION,
      editionName: "Turma A",
    });

    const response = await post();

    expect(response.status).toBe(200);
    expect(notifyOnce).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("still rejects when the notification throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(notifyOnce).mockRejectedValue(new Error("resend exploded"));

    const response = await post();

    expect(response.status).toBe(200);
    expect(response.body.signature).toBe("5xRejectSig");
    expect(error).toHaveBeenCalled();
  });
});
