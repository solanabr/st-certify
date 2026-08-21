import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocked BEFORE importing the route, per vitest's hoisting contract. The claim
// pipeline itself is covered by lib/chain/__tests__ — what's under test here is
// the receipt that goes out after it succeeds.
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
  requireUser: vi.fn(async () => ({
    did: "did:privy:student",
    email: "ana@example.test",
    wallets: ["WaLLet1"],
    role: "student",
    isCertifier: false,
  })),
}));
vi.mock("@/lib/chain/claim", () => ({
  submitClaim: vi.fn(async () => ({
    status: "claimed",
    certNumber: 7,
    asset: "Asset111",
    imageUrl: "https://cdn.test/cert.png",
  })),
}));
vi.mock("@/lib/db/notification-queries", () => ({
  getCertificateNotificationContext: vi.fn(async () => ({
    certificateAddress: "Cert111",
    studentName: "Ana Souza",
    studentEmail: "profile@example.test",
    editionAddress: "Ed1t10n",
    editionName: "Turma A",
  })),
}));
vi.mock("@/lib/email/notify", () => ({
  notifyOnce: vi.fn(async () => ({ sent: true, deduped: false })),
}));

const { requireUser } = await import("@/lib/auth");
const { submitClaim } = await import("@/lib/chain/claim");
const { getCertificateNotificationContext } =
  await import("@/lib/db/notification-queries");
const { notifyOnce } = await import("@/lib/email/notify");
const { POST } = await import("../route");

const ADDR = "Cert111";

interface FakeResponse {
  body: { status?: string; certNumber?: number; error?: { code: string } };
  status: number;
}

async function post(): Promise<FakeResponse> {
  const request = {
    json: async () => ({}),
  } as unknown as Request;
  const response = (await POST(request, {
    params: Promise.resolve({ addr: ADDR }),
  })) as unknown as FakeResponse;
  await Promise.all(afterTasks.splice(0));
  return response;
}

beforeEach(() => {
  afterTasks.length = 0;
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://certify.test");
  vi.mocked(requireUser).mockResolvedValue({
    did: "did:privy:student",
    email: "ana@example.test",
    wallets: ["WaLLet1"],
    role: "student",
    isCertifier: false,
  });
  vi.mocked(submitClaim).mockResolvedValue({
    status: "claimed",
    certNumber: 7,
    asset: "Asset111",
    imageUrl: "https://cdn.test/cert.png",
  });
  vi.mocked(getCertificateNotificationContext).mockResolvedValue({
    certificateAddress: ADDR,
    studentName: "Ana Souza",
    studentEmail: "profile@example.test",
    editionAddress: "Ed1t10n",
    editionName: "Turma A",
  });
  vi.mocked(notifyOnce).mockResolvedValue({ sent: true, deduped: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/certificates/[addr]/claim-submit — receipt", () => {
  it("sends the receipt with the verify and pdf links", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(notifyOnce).toHaveBeenCalledWith({
      to: "ana@example.test",
      kind: "claim-receipt",
      locale: "pt-BR",
      refId: ADDR,
      payload: {
        studentName: "Ana Souza",
        editionName: "Turma A",
        verifyUrl: `https://certify.test/verify/${ADDR}`,
        pdfUrl: `https://certify.test/api/certificates/${ADDR}/pdf`,
      },
    });
  });

  it("prefers the session address, since the claimer is the student", async () => {
    await post();

    expect(notifyOnce).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ana@example.test" }),
    );
  });

  it("falls back to the profile email when the session carries none", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      did: "did:privy:student",
      email: null,
      wallets: ["WaLLet1"],
      role: "student",
      isCertifier: false,
    });

    await post();

    expect(notifyOnce).toHaveBeenCalledWith(
      expect.objectContaining({ to: "profile@example.test" }),
    );
  });

  it("skips with a log line when no address resolves at all", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(requireUser).mockResolvedValue({
      did: "did:privy:student",
      email: null,
      wallets: ["WaLLet1"],
      role: "student",
      isCertifier: false,
    });
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

  it("returns the claim result even when the receipt throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(notifyOnce).mockRejectedValue(new Error("resend exploded"));

    const response = await post();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "claimed", certNumber: 7 });
    expect(error).toHaveBeenCalled();
  });

  it("sends nothing when the claim itself fails", async () => {
    vi.mocked(submitClaim).mockRejectedValue(new Error("chain down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await post();

    expect(response.status).toBe(500);
    expect(notifyOnce).not.toHaveBeenCalled();
  });
});
