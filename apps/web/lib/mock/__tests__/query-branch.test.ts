import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The contract UI-mock mode actually has to keep: with the flag on, the
 * page-facing query functions answer from fixtures and never construct a
 * Supabase client; with it off, nothing about them changes.
 *
 * `createClient` throws here, so any query that reaches the real client fails
 * the test loudly instead of silently depending on ambient env.
 */
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    throw new Error("createClient must not be reached in UI-mock mode");
  },
}));

// `dbConfigured` is evaluated at module load, so each block imports the query
// modules fresh under its own environment.
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function enableMock() {
  vi.stubEnv("NEXT_PUBLIC_UI_MOCK", "1");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
}

describe("query branching with the flag on", () => {
  beforeEach(enableMock);

  it("reports the database as configured so pages render content, not a notice", async () => {
    const queries = await import("@/lib/db/queries");
    const verify = await import("@/lib/db/claim-verify-queries");
    const certificator = await import("@/lib/db/certificator-queries");

    expect(queries.dbConfigured).toBe(true);
    expect(verify.dbConfigured).toBe(true);
    expect(certificator.dbConfigured).toBe(true);
  });

  it("serves editions from fixtures", async () => {
    const { listOpenEditions, listEditionsAdmin, getEditionBySlug } =
      await import("@/lib/db/queries");

    const open = await listOpenEditions();
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((edition) => edition.status === "Open")).toBe(true);
    expect(open[0].signers.length).toBeGreaterThan(0);

    // The admin list is wider than the public one — it carries every status.
    const all = await listEditionsAdmin();
    expect(all.length).toBeGreaterThan(open.length);
    expect(new Set(all.map((e) => e.status)).size).toBeGreaterThan(1);

    expect(await getEditionBySlug(open[0].slug)).not.toBeNull();
    expect(await getEditionBySlug("nao-existe")).toBeNull();
  });

  it("covers every certificate status the UI can render", async () => {
    const { listCertificatesForOwner } = await import("@/lib/db/queries");
    const certs = await listCertificatesForOwner({ did: "any", wallets: [] });

    expect(new Set(certs.map((c) => c.status))).toEqual(
      new Set(["Requested", "FullySigned", "Claimed", "Rejected", "Revoked"]),
    );
  });

  it("serves the signer inbox, verify view, drafts and attendance", async () => {
    const { getPendingForSigner } =
      await import("@/lib/db/certificator-queries");
    const { getVerifyView } = await import("@/lib/db/claim-verify-queries");
    const { listDrafts, listInvites } = await import("@/lib/db/draft-queries");
    const { listAttendanceEvents } =
      await import("@/lib/db/attendance-queries");

    const inbox = await getPendingForSigner([]);
    expect(inbox.length).toBeGreaterThan(0);
    expect(inbox[0].certificates.length).toBeGreaterThan(0);

    const drafts = await listDrafts();
    expect(drafts.length).toBeGreaterThan(0);
    const seats = await listInvites(drafts[0].id);
    expect(seats.length).toBeGreaterThan(0);

    const events = await listAttendanceEvents();
    expect(events.length).toBeGreaterThan(0);
    // Both the capped and uncapped branches of the supply UI.
    expect(events.some((e) => e.max_supply === null)).toBe(true);
    expect(events.some((e) => e.max_supply !== null)).toBe(true);

    const claimed = (
      await (
        await import("@/lib/db/queries")
      ).listCertificatesForOwner({
        did: "any",
        wallets: [],
      })
    ).find((c) => c.status === "Claimed");
    expect(await getVerifyView(claimed!.address)).not.toBeNull();
  });

  it("still enforces the signer boundary rather than waving actions through", async () => {
    const { isWalletSignerOfEdition } =
      await import("@/lib/db/certificator-queries");
    const { listEditionsAdmin } = await import("@/lib/db/queries");
    const [edition] = await listEditionsAdmin();

    expect(
      await isWalletSignerOfEdition(edition.address, [
        edition.signers[0].wallet,
      ]),
    ).toBe(true);
    expect(
      await isWalletSignerOfEdition(edition.address, ["nao-e-signatario"]),
    ).toBe(false);
  });

  it("is deterministic — repeated reads are identical", async () => {
    const { listEditionsAdmin } = await import("@/lib/db/queries");
    expect(await listEditionsAdmin()).toEqual(await listEditionsAdmin());
  });
});

describe("query branching with the flag off", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_UI_MOCK", undefined);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
  });

  it("leaves dbConfigured alone and never substitutes fixtures", async () => {
    const { dbConfigured, listOpenEditions } = await import("@/lib/db/queries");

    expect(dbConfigured).toBe(false);
    // Unconfigured stays unconfigured: it fails rather than inventing data.
    await expect(listOpenEditions()).rejects.toThrow();
  });

  it("stays off in a production build even with the flag set", async () => {
    vi.stubEnv("NEXT_PUBLIC_UI_MOCK", "1");
    vi.stubEnv("NODE_ENV", "production");

    const { dbConfigured, listEditionsAdmin } =
      await import("@/lib/db/queries");

    expect(dbConfigured).toBe(false);
    await expect(listEditionsAdmin()).rejects.toThrow();
  });
});
