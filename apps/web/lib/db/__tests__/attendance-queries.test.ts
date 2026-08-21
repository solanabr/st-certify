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
const {
  getClaimByAssetId,
  listAttendanceClaimsForWallets,
  ATTENDANCE_CLAIM_PUBLIC_COLUMNS,
  ATTENDANCE_CLAIM_OWNER_COLUMNS,
} = await import("../attendance-queries");

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

interface ListCalls {
  select: string;
  in: { column: string; values: string[] } | null;
  eq: [string, unknown][];
  fromCount: number;
}

/** Client for the list query, which ends at `.order()` rather than `.maybeSingle()`. */
function recordingListClient(rows: unknown[]): ListCalls {
  const calls: ListCalls = { select: "", in: null, eq: [], fromCount: 0 };
  const builder = {
    select(columns: string) {
      calls.select = columns;
      return builder;
    },
    in(column: string, values: string[]) {
      calls.in = { column, values };
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.eq.push([column, value]);
      return builder;
    },
    order() {
      return Promise.resolve({ data: rows, error: null });
    },
  };
  vi.mocked(getServiceClient).mockReturnValue({
    from: () => {
      calls.fromCount += 1;
      return builder;
    },
  } as unknown as SupabaseClient);
  return calls;
}

const EVENT = {
  name: "Superteam Meetup",
  image_url: "https://example.test/i.png",
  event_date: "2026-08-20",
};

describe("listAttendanceClaimsForWallets", () => {
  it("never lists claim_token or a wildcard in the allowlist constant", () => {
    expect(ATTENDANCE_CLAIM_OWNER_COLUMNS).not.toContain("claim_token");
    expect(ATTENDANCE_CLAIM_OWNER_COLUMNS).not.toContain("*");
  });

  it("queries the allowlist scoped to the caller's wallets and minted claims", async () => {
    const calls = recordingListClient([
      {
        tx_sig: "SigABC",
        asset_id: "AssetXYZ",
        created_at: "2026-08-20T12:00:00Z",
        attendance_events: EVENT,
      },
    ]);

    const claims = await listAttendanceClaimsForWallets(["W1", "W2"]);

    expect(calls.select).toBe(ATTENDANCE_CLAIM_OWNER_COLUMNS);
    expect(calls.in).toEqual({ column: "wallet", values: ["W1", "W2"] });
    expect(calls.eq).toEqual([["status", "minted"]]);
    expect(claims).toEqual([
      {
        eventName: "Superteam Meetup",
        eventDate: "2026-08-20",
        imageUrl: "https://example.test/i.png",
        assetId: "AssetXYZ",
        txSig: "SigABC",
        claimedAt: "2026-08-20T12:00:00Z",
      },
    ]);
  });

  it("keeps a minted claim whose asset id has not backfilled yet", async () => {
    recordingListClient([
      {
        tx_sig: "SigABC",
        asset_id: null,
        created_at: "2026-08-20T12:00:00Z",
        attendance_events: [EVENT],
      },
    ]);

    const [claim] = await listAttendanceClaimsForWallets(["W1"]);
    expect(claim.assetId).toBeNull();
    expect(claim.txSig).toBe("SigABC");
  });

  it("drops a claim whose event embed is missing rather than rendering a blank card", async () => {
    recordingListClient([
      {
        tx_sig: null,
        asset_id: "A",
        created_at: "2026-08-20T12:00:00Z",
        attendance_events: null,
      },
      {
        tx_sig: null,
        asset_id: "B",
        created_at: "2026-08-20T11:00:00Z",
        attendance_events: EVENT,
      },
    ]);

    const claims = await listAttendanceClaimsForWallets(["W1"]);
    expect(claims.map((c) => c.assetId)).toEqual(["B"]);
  });

  it("short-circuits a walletless session without touching the database", async () => {
    const calls = recordingListClient([]);

    await expect(listAttendanceClaimsForWallets([])).resolves.toEqual([]);
    expect(calls.fromCount).toBe(0);
  });
});
