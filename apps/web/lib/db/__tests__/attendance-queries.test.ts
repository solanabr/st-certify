import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mocked BEFORE importing the module under test (vitest hoisting), mirroring
// attendance-mutations.test.ts. getClaimByAssetId bottoms out in
// supabase.from(...).select(...).eq(...).eq(...).maybeSingle(), so the fake
// client records the select string and carries that chain.
vi.mock("../mutations", () => ({
  dbConfigured: true,
  getServiceClient: vi.fn(),
}));

const { getServiceClient } = await import("../mutations");
const { getClaimByAssetId, ATTENDANCE_CLAIM_PUBLIC_COLUMNS } =
  await import("../attendance-queries");

/** Installs a client that records the `.select()` columns and resolves `row` from `.maybeSingle()`. */
function recordingClient(row: unknown): { calls: { select: string } } {
  const calls = { select: "" };
  const builder = {
    select(columns: string) {
      calls.select = columns;
      return builder;
    },
    eq() {
      return builder;
    },
    maybeSingle() {
      return Promise.resolve({ data: row, error: null });
    },
  };
  vi.mocked(getServiceClient).mockReturnValue({
    from: () => builder,
  } as unknown as SupabaseClient);
  return { calls };
}

describe("getClaimByAssetId column allowlist", () => {
  it("never lists claim_token or a wildcard in the allowlist constant", () => {
    expect(ATTENDANCE_CLAIM_PUBLIC_COLUMNS).not.toContain("claim_token");
    expect(ATTENDANCE_CLAIM_PUBLIC_COLUMNS).not.toContain("*");
  });

  it("queries with exactly the allowlist and maps the joined event", async () => {
    const { calls } = recordingClient({
      wallet: "Wa11etAddr",
      tx_sig: "SigABC",
      asset_id: "AssetXYZ",
      created_at: "2026-08-20T12:00:00Z",
      attendance_events: {
        name: "Superteam Meetup",
        image_url: "https://example.test/i.png",
        event_date: "2026-08-20",
      },
    });

    const view = await getClaimByAssetId("AssetXYZ");

    expect(calls.select).toBe(ATTENDANCE_CLAIM_PUBLIC_COLUMNS);
    expect(calls.select).not.toContain("claim_token");
    expect(view).toEqual({
      eventName: "Superteam Meetup",
      eventImageUrl: "https://example.test/i.png",
      eventDate: "2026-08-20",
      wallet: "Wa11etAddr",
      claimedAt: "2026-08-20T12:00:00Z",
      txSig: "SigABC",
      assetId: "AssetXYZ",
    });
  });

  it("normalizes a to-one event embed returned as an array", async () => {
    recordingClient({
      wallet: "W",
      tx_sig: null,
      asset_id: "A",
      created_at: "2026-08-20T12:00:00Z",
      attendance_events: [
        {
          name: "Event",
          image_url: "https://example.test/i.png",
          event_date: "2026-08-20",
        },
      ],
    });

    const view = await getClaimByAssetId("A");
    expect(view?.eventName).toBe("Event");
    expect(view?.txSig).toBeNull();
  });

  it("returns null when no claim matches", async () => {
    recordingClient(null);
    expect(await getClaimByAssetId("missing")).toBeNull();
  });
});
