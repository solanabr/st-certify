import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));
vi.mock("@/lib/db/claim-verify-queries", () => ({
  getCertificateByVerifyCode: vi.fn(),
}));

const { getCertificateByVerifyCode } =
  await import("@/lib/db/claim-verify-queries");
const { GET } = await import("../route");

interface FakeResponse {
  body: { address?: string | null; error?: { code: string } };
  status: number;
}

function call(code: string) {
  return GET(new Request("https://certify.test"), {
    params: Promise.resolve({ code }),
  }) as unknown as Promise<FakeResponse>;
}

afterEach(() => {
  vi.mocked(getCertificateByVerifyCode).mockReset();
});

describe("GET /api/verify/resolve-code/[code]", () => {
  it("resolves a printed code to its certificate address", async () => {
    vi.mocked(getCertificateByVerifyCode).mockResolvedValue({
      address: "Cert111",
    });

    const response = await call("K7M2QX9T");

    expect(getCertificateByVerifyCode).toHaveBeenCalledWith("K7M2QX9T");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ address: "Cert111" });
  });

  it("answers a miss with a null address, not an error", async () => {
    // The verify tool must be able to tell "no such certificate" apart from
    // "we could not check" — an error status would collapse the two.
    vi.mocked(getCertificateByVerifyCode).mockResolvedValue(null);

    const response = await call("ZZZZ1111");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ address: null });
  });

  it("surfaces a lookup failure as an error, never as a miss", async () => {
    vi.mocked(getCertificateByVerifyCode).mockRejectedValue(
      new Error("supabase down"),
    );

    const response = await call("K7M2QX9T");

    expect(response.status).toBe(500);
    expect(response.body.address).toBeUndefined();
  });
});
