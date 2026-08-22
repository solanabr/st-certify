import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked BEFORE importing the route, per vitest's hoisting contract. Only the
// notification wiring is under test here: the revoke pipeline, auth and the
// reason schema are someone else's contract, so they are faked wholesale.
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
  requireSysadmin: vi.fn(async () => ({
    did: "did:privy:admin",
    email: "admin@example.test",
    wallets: [],
    role: "sysadmin",
    isCertifier: true,
  })),
}));
vi.mock("@/lib/chain/revoke", () => ({
  revokeCertificate: vi.fn(async () => ({
    signature: "5xRevokeSig",
    burned: true,
    alreadyRevoked: false,
  })),
}));
vi.mock("@/lib/db/notification-queries", () => ({
  getCertificateNotificationContext: vi.fn(async () => ({
    certificateAddress: "Cert111",
    studentName: "Ana Souza",
    studentEmail: "ana@example.test",
    editionAddress: "Ed1t10n",
    editionName: "Turma A",
  })),
}));
vi.mock("@/lib/email/notify", () => ({
  notifyOnce: vi.fn(async () => ({ sent: true, deduped: false })),
}));
vi.mock("@/lib/db/claim-verify-queries", () => ({
  getVerifyView: vi.fn(),
}));
vi.mock("@/lib/pdf/storage", () => ({
  removeCachedPdfs: vi.fn(async () => 1),
}));

const { revokeCertificate } = await import("@/lib/chain/revoke");
const { getVerifyView } = await import("@/lib/db/claim-verify-queries");
const { removeCachedPdfs } = await import("@/lib/pdf/storage");
const { getCertificateNotificationContext } =
  await import("@/lib/db/notification-queries");
const { notifyOnce } = await import("@/lib/email/notify");
const { POST } = await import("../route");

const ADDR = "Cert111";
const REASON = "Emitido para a turma errada.";

interface FakeResponse {
  body: { signature?: string; error?: { code: string } };
  status: number;
}

async function post(reason: unknown = REASON): Promise<FakeResponse> {
  const request = { json: async () => ({ reason }) } as unknown as Request;
  const response = (await POST(request, {
    params: Promise.resolve({ addr: ADDR }),
  })) as unknown as FakeResponse;
  // after() work is scheduled, not awaited, by the route — drain it so the
  // assertions see what production would eventually run.
  await Promise.all(afterTasks.splice(0));
  return response;
}

beforeEach(() => {
  afterTasks.length = 0;
  vi.clearAllMocks();
  vi.mocked(revokeCertificate).mockResolvedValue({
    signature: "5xRevokeSig",
    burned: true,
    alreadyRevoked: false,
  });
  vi.mocked(getCertificateNotificationContext).mockResolvedValue({
    certificateAddress: ADDR,
    studentName: "Ana Souza",
    studentEmail: "ana@example.test",
    editionAddress: "Ed1t10n",
    editionName: "Turma A",
  });
  vi.mocked(notifyOnce).mockResolvedValue({ sent: true, deduped: false });
  vi.mocked(getVerifyView).mockResolvedValue({
    sha256: "c".repeat(64),
  } as Awaited<ReturnType<typeof getVerifyView>>);
  vi.mocked(removeCachedPdfs).mockResolvedValue(1);
});

describe("POST /api/admin/certificates/[addr]/revoke — notification", () => {
  it("tells the student, with the reason, keyed on the certificate", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(notifyOnce).toHaveBeenCalledWith({
      to: "ana@example.test",
      kind: "cert-revoked",
      locale: "pt-BR",
      refId: ADDR,
      payload: {
        studentName: "Ana Souza",
        editionName: "Turma A",
        reason: REASON,
      },
    });
  });

  it("stays silent when the certificate was already revoked", async () => {
    vi.mocked(revokeCertificate).mockResolvedValue({
      signature: null,
      burned: false,
      alreadyRevoked: true,
    });

    await post();

    expect(notifyOnce).not.toHaveBeenCalled();
    // But the cache sweep still runs — re-revoking repairs a missed sweep.
    expect(removeCachedPdfs).toHaveBeenCalledWith("c".repeat(64));
  });

  it("sweeps the public bucket's cached export for the revoked artifact", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(getVerifyView).toHaveBeenCalledWith(ADDR);
    expect(removeCachedPdfs).toHaveBeenCalledWith("c".repeat(64));
  });

  it("never fails the revoke over a failed sweep, but says so out loud", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(removeCachedPdfs).mockRejectedValue(new Error("storage down"));

    const response = await post();

    expect(response.status).toBe(200);
    expect(
      errorSpy.mock.calls.some(([line]) =>
        String(line).includes("PDF cache sweep"),
      ),
    ).toBe(true);
    errorSpy.mockRestore();
  });

  it("skips with a log line when no email resolves for the student", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getCertificateNotificationContext).mockResolvedValue({
      certificateAddress: ADDR,
      studentName: "Ana Souza",
      studentEmail: null,
      editionAddress: "Ed1t10n",
      editionName: "Turma A",
    });

    const response = await post();

    expect(response.status).toBe(200);
    expect(notifyOnce).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("still revokes when the notification throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(notifyOnce).mockRejectedValue(new Error("resend exploded"));

    const response = await post();

    expect(response.status).toBe(200);
    expect(response.body.signature).toBe("5xRevokeSig");
    expect(error).toHaveBeenCalled();
  });

  it("never reaches the notification when the reason is invalid", async () => {
    const response = await post("");

    expect(response.status).toBe(400);
    expect(revokeCertificate).not.toHaveBeenCalled();
    expect(notifyOnce).not.toHaveBeenCalled();
  });
});
