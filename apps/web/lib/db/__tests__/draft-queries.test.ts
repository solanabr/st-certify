import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Same mocking shape as draft-mutations.test.ts: the Supabase edge is faked so
// the expiry derivation, the FK-embed normalization and the projection stay
// real.
vi.mock("../mutations", () => ({
  dbConfigured: true,
  getServiceClient: vi.fn(),
}));

const { getServiceClient } = await import("../mutations");
const { INVITE_EXPIRY_DAYS, getInviteByToken, inviteExpiryCutoff } =
  await import("../draft-queries");

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const SEAT_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "tok-ana";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Records the filters so a test can assert the token, not just the result. */
interface Recorded {
  table: string | null;
  filters: Array<[string, unknown]>;
}

function fakeClient(row: unknown): Recorded {
  const recorded: Recorded = { table: null, filters: [] };
  const builder = {
    select: () => builder,
    eq(column: string, value: unknown) {
      recorded.filters.push([column, value]);
      return builder;
    },
    maybeSingle: async () => ({ data: row, error: null }),
  };

  vi.mocked(getServiceClient).mockReturnValue({
    from(table: string) {
      recorded.table = table;
      return builder;
    },
  } as unknown as SupabaseClient);

  return recorded;
}

/** A joined row as PostgREST returns it: the seat with its draft embedded. */
function joinedRow(invitedAt: string, status = "invited") {
  return {
    id: SEAT_ID,
    draft_id: DRAFT_ID,
    name: "Ana Beatriz",
    role: "Coordenadora",
    email: "ana@example.org",
    token: TOKEN,
    status,
    wallet: null,
    invited_at: invitedAt,
    accepted_at: null,
    reminded_at: null,
    edition_drafts: {
      id: DRAFT_ID,
      meta: { name: "Turma 2026" },
      layout: null,
      template_sha: null,
      chain_address: null,
      created_by: "did:privy:admin",
      created_at: invitedAt,
      updated_at: invitedAt,
    },
  };
}

const daysAgo = (days: number) =>
  new Date(Date.now() - days * DAY_MS).toISOString();

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe("getInviteByToken", () => {
  it("looks the seat up by its token and attaches the draft", async () => {
    const recorded = fakeClient(joinedRow(daysAgo(1)));

    const invite = await getInviteByToken(TOKEN);

    expect(recorded.table).toBe("signer_invites");
    expect(recorded.filters).toEqual([["token", TOKEN]]);
    expect(invite?.draft.meta.name).toBe("Turma 2026");
    // The embed is lifted out — no raw join key survives on the seat.
    expect(invite).not.toHaveProperty("edition_drafts");
  });

  it("keeps a seat invited inside the deadline", async () => {
    fakeClient(joinedRow(daysAgo(INVITE_EXPIRY_DAYS - 1)));

    await expect(getInviteByToken(TOKEN)).resolves.toMatchObject({
      status: "invited",
    });
  });

  it("reads an aged-out seat as expired even though the row still says invited", async () => {
    // Nothing writes 'expired' — this is the only thing standing between a
    // months-old magic link and a live seat.
    fakeClient(joinedRow(daysAgo(INVITE_EXPIRY_DAYS + 1)));

    await expect(getInviteByToken(TOKEN)).resolves.toMatchObject({
      status: "expired",
    });
  });

  it("leaves an accepted seat alone however old it is", async () => {
    // Expiry is about links that were never used; a bound wallet stays bound.
    fakeClient(joinedRow(daysAgo(400), "accepted"));

    await expect(getInviteByToken(TOKEN)).resolves.toMatchObject({
      status: "accepted",
    });
  });

  it("treats an unreadable invited_at as a data bug, not an expiry", async () => {
    fakeClient(joinedRow("not a timestamp"));

    await expect(getInviteByToken(TOKEN)).resolves.toMatchObject({
      status: "invited",
    });
  });

  it("returns null for an unknown token", async () => {
    fakeClient(null);

    await expect(getInviteByToken("tok-nope")).resolves.toBeNull();
  });
});

describe("inviteExpiryCutoff", () => {
  it("is exactly INVITE_EXPIRY_DAYS behind the instant it is asked about", () => {
    const now = Date.parse("2026-08-22T12:00:00.000Z");

    expect(inviteExpiryCutoff(now)).toBe("2026-08-08T12:00:00.000Z");
    expect(INVITE_EXPIRY_DAYS).toBe(14);
  });
});
