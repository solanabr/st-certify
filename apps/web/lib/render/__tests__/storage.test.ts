import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const DEFAULT_TEMPLATE_PATH = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "assets",
  "templates",
  "default-superteam-br.png",
);

const defaultBytes = readFileSync(DEFAULT_TEMPLATE_PATH);
const defaultSha256 = createHash("sha256").update(defaultBytes).digest("hex");

// Mocked BEFORE importing the module under test, per vitest's hoisting
// contract (mirrors lib/chain/__tests__/server.test.ts). dbConfigured=false
// for the whole file: the default-sha path never consults it, and it's
// exactly the condition the "custom sha, no Supabase" test needs.
vi.mock("@/lib/db/mutations", () => ({
  dbConfigured: false,
  getServiceClient: vi.fn(),
}));

const { getTemplateBytes } = await import("../storage");

describe("getTemplateBytes", () => {
  it("resolves the committed default template's bytes for the default sha256, with zero Supabase dependency", async () => {
    const bytes = await getTemplateBytes(defaultSha256);

    expect(bytes.equals(defaultBytes)).toBe(true);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      defaultSha256,
    );
  });

  it("throws STORAGE_FAILED for a custom (non-default) sha256 when Supabase isn't configured — not a silent fallback to the wrong image", async () => {
    const customSha256 = "1".repeat(64);

    await expect(getTemplateBytes(customSha256)).rejects.toMatchObject({
      code: "STORAGE_FAILED",
    });
  });
});
