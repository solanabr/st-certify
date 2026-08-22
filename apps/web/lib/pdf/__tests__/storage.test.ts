import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/mutations", () => ({
  dbConfigured: true,
  getServiceClient: vi.fn(),
}));

const { getServiceClient } = await import("@/lib/db/mutations");
const { pdfCachePath, removeCachedPdfs } = await import("../storage");

const SHA = "a".repeat(64);

/** Any base64 works: the fingerprint hashes the decoded bytes, it never parses them. */
function useKey(name: string): void {
  process.env.SEAL_P12_BASE64 = Buffer.from(name).toString("base64");
}

afterEach(() => {
  delete process.env.SEAL_P12_BASE64;
});

describe("pdfCachePath", () => {
  it("addresses an unsealed export by artifact and locale alone", () => {
    expect(pdfCachePath(SHA, "pt-BR", false)).toBe(
      `certs-pdf/${SHA}-pt-BR.pdf`,
    );
  });

  it("separates a sealed export from the unsealed one", () => {
    useKey("key-a");

    expect(pdfCachePath(SHA, "pt-BR", true)).not.toBe(
      pdfCachePath(SHA, "pt-BR", false),
    );
    expect(pdfCachePath(SHA, "pt-BR", true)).toMatch(
      new RegExp(`^certs-pdf/${SHA}-pt-BR-sealed-[0-9a-f]{12}\\.pdf$`),
    );
  });

  it("moves to a new path when the signing key is rotated", () => {
    useKey("key-a");
    const before = pdfCachePath(SHA, "pt-BR", true);
    useKey("key-b");
    const after = pdfCachePath(SHA, "pt-BR", true);

    // The whole point: the old key's signature can no longer answer a request.
    expect(after).not.toBe(before);
    useKey("key-a");
    expect(pdfCachePath(SHA, "pt-BR", true)).toBe(before);
  });

  it("keeps locales apart", () => {
    useKey("key-a");

    expect(pdfCachePath(SHA, "en", true)).not.toBe(
      pdfCachePath(SHA, "pt-BR", true),
    );
  });
});

describe("removeCachedPdfs", () => {
  function fakeStorage(over: {
    listed?: Array<{ name: string }>;
    listError?: { message: string };
    removeError?: { message: string };
  }) {
    const remove = vi.fn(async () => ({
      error: over.removeError ?? null,
    }));
    const list = vi.fn(async () => ({
      data: over.listError ? null : (over.listed ?? []),
      error: over.listError ?? null,
    }));
    vi.mocked(getServiceClient).mockReturnValue({
      storage: { from: () => ({ list, remove }) },
    } as unknown as ReturnType<typeof getServiceClient>);
    return { list, remove };
  }

  it("sweeps every export shape sharing the artifact prefix, nothing else", async () => {
    const { list, remove } = fakeStorage({
      listed: [
        { name: `${SHA}-pt-BR.pdf` },
        { name: `${SHA}-en-sealed-abc123def456.pdf` },
        // A search hit that is not this artifact's prefix stays untouched.
        { name: `b${SHA.slice(1)}-pt-BR.pdf` },
      ],
    });

    await expect(removeCachedPdfs(SHA)).resolves.toBe(2);
    expect(list).toHaveBeenCalledWith("certs-pdf", { search: SHA });
    expect(remove).toHaveBeenCalledWith([
      `certs-pdf/${SHA}-pt-BR.pdf`,
      `certs-pdf/${SHA}-en-sealed-abc123def456.pdf`,
    ]);
  });

  it("reports zero without a round-trip when nothing matches", async () => {
    const { remove } = fakeStorage({ listed: [] });

    await expect(removeCachedPdfs(SHA)).resolves.toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it("signals a failed sweep instead of pretending it emptied", async () => {
    // -1 is load-bearing: a revoked certificate's export staying fetchable is
    // exactly what the caller has to be able to see and log.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fakeStorage({ listError: { message: "listing exploded" } });
    await expect(removeCachedPdfs(SHA)).resolves.toBe(-1);

    fakeStorage({
      listed: [{ name: `${SHA}-pt-BR.pdf` }],
      removeError: { message: "remove exploded" },
    });
    await expect(removeCachedPdfs(SHA)).resolves.toBe(-1);
    errorSpy.mockRestore();
  });
});
