import { afterEach, describe, expect, it, vi } from "vitest";

// Mocked BEFORE importing the route, per vitest's hoisting contract. The
// builder, the seal and the mirror reads have their own tests; what's under
// test here is the route's own decisions — claimed-only, cache-first, and the
// headers a browser needs to save the file.
class FakeResponse {
  constructor(
    readonly body: unknown,
    readonly init?: { status?: number; headers?: Record<string, string> },
  ) {}
  get status(): number {
    return this.init?.status ?? 200;
  }
  get headers(): Record<string, string> {
    return this.init?.headers ?? {};
  }
  static json(body: unknown, init?: { status?: number }) {
    return new FakeResponse(body, init);
  }
}

vi.mock("next/server", () => ({ NextResponse: FakeResponse }));
vi.mock("@/lib/i18n/server", () => ({ getLocale: vi.fn(async () => "pt-BR") }));
vi.mock("@/lib/pdf/source", () => ({
  loadCertificatePdfSource: vi.fn(),
}));
vi.mock("@/lib/pdf/storage", () => ({
  pdfCachePath: (sha: string, locale: string, sealed: boolean) =>
    `certs-pdf/${sha}-${locale}${sealed ? "-sealed" : ""}.pdf`,
  readCachedPdf: vi.fn(async () => null),
  writeCachedPdf: vi.fn(async () => undefined),
}));
vi.mock("@/lib/pdf/build", () => ({
  buildCertificatePdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock("@/lib/pdf/seal", () => ({
  sealConfigured: vi.fn(() => false),
  envP12Source: vi.fn(() => ({ sign: vi.fn() })),
  sealPdf: vi.fn(async () => new Uint8Array([9, 9, 9])),
}));

const { loadCertificatePdfSource } = await import("@/lib/pdf/source");
const { readCachedPdf, writeCachedPdf } = await import("@/lib/pdf/storage");
const { buildCertificatePdf } = await import("@/lib/pdf/build");
const { sealConfigured, sealPdf } = await import("@/lib/pdf/seal");
const { GET } = await import("../route");

const ADDR = "Cert111";
const SHA = "c".repeat(64);

function source() {
  return {
    artifactSha256Hex: SHA,
    editionSlug: "turma-a",
    issuanceTime: new Date("2026-08-20T14:05:00.000Z"),
    input: {
      verifyCode: "K7M2QX9T",
      verifyUrl: "https://certify.test/verify/Cert111",
      txSig: "5zzz",
      cluster: "devnet" as const,
      issuer: { name: "Superteam Brasil", contactUrl: "https://st.test" },
    },
  };
}

function call(url = `https://certify.test/api/certificates/${ADDR}/pdf`) {
  return GET(new Request(url), {
    params: Promise.resolve({ addr: ADDR }),
  }) as unknown as Promise<FakeResponse>;
}

afterEach(() => {
  vi.mocked(loadCertificatePdfSource).mockReset();
  vi.mocked(readCachedPdf).mockReset().mockResolvedValue(null);
  vi.mocked(writeCachedPdf).mockReset();
  vi.mocked(buildCertificatePdf)
    .mockReset()
    .mockResolvedValue(new Uint8Array([1, 2, 3]));
  vi.mocked(sealConfigured).mockReset().mockReturnValue(false);
  vi.mocked(sealPdf)
    .mockReset()
    .mockResolvedValue(new Uint8Array([9, 9, 9]));
});

describe("GET /api/certificates/[addr]/pdf", () => {
  it("404s when the certificate is not claimed", async () => {
    vi.mocked(loadCertificatePdfSource).mockResolvedValue(null);

    const response = await call();

    expect(response.status).toBe(404);
    expect(buildCertificatePdf).not.toHaveBeenCalled();
  });

  it("builds, caches and streams a claimed certificate as an attachment", async () => {
    vi.mocked(loadCertificatePdfSource).mockResolvedValue(source() as never);

    const response = await call();

    expect(response.status).toBe(200);
    expect(response.headers["Content-Type"]).toBe("application/pdf");
    expect(response.headers["Content-Disposition"]).toBe(
      'attachment; filename="certificado-turma-a-K7M2QX9T.pdf"',
    );
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(response.body).toEqual(new Uint8Array([1, 2, 3]));
    expect(writeCachedPdf).toHaveBeenCalledWith(
      `certs-pdf/${SHA}-pt-BR.pdf`,
      new Uint8Array([1, 2, 3]),
    );
  });

  it("serves the cached export without rebuilding it", async () => {
    vi.mocked(loadCertificatePdfSource).mockResolvedValue(source() as never);
    vi.mocked(readCachedPdf).mockResolvedValue(new Uint8Array([7, 7]));

    const response = await call();

    expect(readCachedPdf).toHaveBeenCalledWith(`certs-pdf/${SHA}-pt-BR.pdf`);
    expect(response.body).toEqual(new Uint8Array([7, 7]));
    expect(buildCertificatePdf).not.toHaveBeenCalled();
    expect(writeCachedPdf).not.toHaveBeenCalled();
  });

  it("seals the export when a certificate source is configured", async () => {
    vi.mocked(loadCertificatePdfSource).mockResolvedValue(source() as never);
    vi.mocked(sealConfigured).mockReturnValue(true);

    const response = await call();

    expect(sealPdf).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      expect.anything(),
      expect.objectContaining({
        reason: "https://explorer.solana.com/tx/5zzz?cluster=devnet",
        signingTime: new Date("2026-08-20T14:05:00.000Z"),
        name: "Superteam Brasil",
      }),
    );
    // Sealed and unsealed exports are different bytes, so they cache apart.
    expect(readCachedPdf).toHaveBeenCalledWith(
      `certs-pdf/${SHA}-pt-BR-sealed.pdf`,
    );
    expect(response.body).toEqual(new Uint8Array([9, 9, 9]));
  });

  it("honours ?lang= over the cookie so a shared link keeps its language", async () => {
    vi.mocked(loadCertificatePdfSource).mockResolvedValue(source() as never);

    await call(`https://certify.test/api/certificates/${ADDR}/pdf?lang=en`);

    expect(loadCertificatePdfSource).toHaveBeenCalledWith(ADDR, "en");
    expect(readCachedPdf).toHaveBeenCalledWith(`certs-pdf/${SHA}-en.pdf`);
  });
});
