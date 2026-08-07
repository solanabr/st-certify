import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { Blob } from "node:buffer";

// Fake Supabase client covering only what getTemplateBytes touches:
// storage.from(bucket).download(path) -> { data: Blob | null, error }.
// Declared via vi.hoisted so the vi.mock factory below (hoisted above these
// imports by vitest) can close over it — mirrors lib/chain/__tests__/server.test.ts's
// vi.mock("@/lib/db/mutations", ...) precedent, extended with a shared spy.
const { downloadMock } = vi.hoisted(() => ({ downloadMock: vi.fn() }));

vi.mock("@/lib/db/mutations", () => ({
  dbConfigured: true,
  getServiceClient: () => ({
    storage: {
      from: () => ({ download: downloadMock }),
    },
  }),
}));

const { getTemplateBytes } = await import("../storage");

describe("getTemplateBytes — custom (non-default) template, Supabase configured", () => {
  beforeEach(() => {
    downloadMock.mockReset();
  });

  it("downloads and returns a custom template's bytes when they hash to the requested sha256 — the mechanism buildClaimArtifact now relies on instead of the old default-only equality assert", async () => {
    const customBytes = Buffer.from("a custom uploaded template's PNG bytes");
    const customSha256 = createHash("sha256").update(customBytes).digest("hex");
    downloadMock.mockResolvedValue({
      data: new Blob([customBytes]),
      error: null,
    });

    const bytes = await getTemplateBytes(customSha256);

    expect(bytes.equals(customBytes)).toBe(true);
    expect(downloadMock).toHaveBeenCalledWith(`${customSha256}.png`);
  });

  it("throws RENDER_FAILED when the downloaded bytes don't hash to the requested sha256 — preserves the old code's tamper/corruption check", async () => {
    const requestedSha256 = "2".repeat(64);
    downloadMock.mockResolvedValue({
      data: new Blob([Buffer.from("bytes that don't match the hash")]),
      error: null,
    });

    await expect(getTemplateBytes(requestedSha256)).rejects.toMatchObject({
      code: "RENDER_FAILED",
    });
  });

  it("throws STORAGE_FAILED when the download itself fails (missing object, network error)", async () => {
    downloadMock.mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });

    await expect(getTemplateBytes("3".repeat(64))).rejects.toMatchObject({
      code: "STORAGE_FAILED",
    });
  });
});
