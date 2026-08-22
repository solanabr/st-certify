import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mocked BEFORE importing the module under test, per vitest's hoisting
// contract (same shape as attendance-mutations.test.ts).
vi.mock("../mutations", () => ({
  dbConfigured: true,
  getServiceClient: vi.fn(),
}));

const { getServiceClient } = await import("../mutations");
const { INVITE_EXPIRY_DAYS, createClaimFor } = await import("../draft-queries");
const {
  acceptInvite,
  claimDraftForCreate,
  insertDraft,
  insertInvites,
  releaseDraftCreateClaim,
  setDraftChainAddress,
  updateDraft,
} = await import("../draft-mutations");

const DAY_MS = 24 * 60 * 60 * 1000;

interface Terminal {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface Recorded {
  table: string | null;
  payload: unknown;
  filters: Array<[string, unknown]>;
  /** `.gt()` filters, kept apart so an equality assertion stays readable. */
  greaterThan: Array<[string, unknown]>;
}

/**
 * One chainable stand-in for the PostgREST builder, since these four writes
 * end in different chains (`.select().single()`, `.select().maybeSingle()`,
 * and a bare awaited `.select()` — the builder is itself a thenable, which is
 * why `then` is implemented here). Records the table, the written payload and
 * every `.eq()` filter so the tests can assert on what would hit the wire.
 */
function fakeClient(terminal: Terminal): Recorded {
  const recorded: Recorded = {
    table: null,
    payload: undefined,
    filters: [],
    greaterThan: [],
  };
  const builder = {
    insert(payload: unknown) {
      recorded.payload = payload;
      return builder;
    },
    update(payload: unknown) {
      recorded.payload = payload;
      return builder;
    },
    eq(column: string, value: unknown) {
      recorded.filters.push([column, value]);
      return builder;
    },
    gt(column: string, value: unknown) {
      recorded.greaterThan.push([column, value]);
      return builder;
    },
    is(column: string, value: unknown) {
      recorded.filters.push([column, value]);
      return builder;
    },
    select: () => builder,
    single: async () => terminal,
    maybeSingle: async () => terminal,
    then: (resolve: (t: Terminal) => unknown) =>
      Promise.resolve(terminal).then(resolve),
  };

  vi.mocked(getServiceClient).mockReturnValue({
    from(table: string) {
      recorded.table = table;
      return builder;
    },
  } as unknown as SupabaseClient);

  return recorded;
}

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const INVITE_ID = "22222222-2222-4222-8222-222222222222";
const WALLET = "5vJRnAiVQKgVJvKZJmTHZ8gWx3nZgWEDbMFkTQ9SF2ZQ";

const SEATS = [
  {
    name: "Ana Beatriz",
    role: "Coordenadora",
    email: "ana@example.org",
    token: "tok-ana",
  },
  {
    name: "Bruno Lima",
    role: "Diretor",
    email: "bruno@example.org",
    token: "tok-bruno",
  },
];

describe("insertDraft", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates the draft owned by the caller", async () => {
    const recorded = fakeClient({ data: { id: DRAFT_ID }, error: null });

    const row = await insertDraft({
      meta: { name: "Turma 2026" },
      createdBy: "did:privy:abc",
    });

    expect(recorded.table).toBe("edition_drafts");
    expect(recorded.payload).toEqual({
      meta: { name: "Turma 2026" },
      created_by: "did:privy:abc",
    });
    expect(row).toEqual({ id: DRAFT_ID });
  });
});

describe("updateDraft", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes only the patched columns and bumps updated_at", async () => {
    const recorded = fakeClient({ data: { id: DRAFT_ID }, error: null });

    await updateDraft(DRAFT_ID, { layout: { fields: [] } });

    const payload = recorded.payload as Record<string, unknown>;
    // meta / template_sha / chain_address absent: a layout-only autosave must
    // not clobber metadata the user typed on another step.
    expect(Object.keys(payload).sort()).toEqual(["layout", "updated_at"]);
    expect(payload.layout).toEqual({ fields: [] });
    // The frozen-draft guard rides in the WHERE clause: once chain_address is
    // set (real address or in-flight create claim), no autosave lands.
    expect(recorded.filters).toEqual([
      ["id", DRAFT_ID],
      ["chain_address", null],
    ]);
  });

  it("reports a missing draft as NOT_FOUND rather than a generic failure", async () => {
    fakeClient({ data: null, error: null });

    await expect(updateDraft(DRAFT_ID, { meta: {} })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("claimDraftForCreate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stamps the claim only on a draft nobody has claimed", async () => {
    const recorded = fakeClient({ data: { id: DRAFT_ID }, error: null });

    await expect(claimDraftForCreate(DRAFT_ID)).resolves.toBe(true);

    const payload = recorded.payload as Record<string, unknown>;
    expect(payload.chain_address).toBe(createClaimFor(DRAFT_ID));
    // The null check rides along with the UPDATE: a read-then-write here would
    // leave the gap that lets a retry mint a second edition.
    expect(recorded.filters).toEqual([
      ["id", DRAFT_ID],
      ["chain_address", null],
    ]);
  });

  it("reports the claim as lost when the row was already taken", async () => {
    // Zero rows matched — another request is mid-create, or the edition exists.
    fakeClient({ data: null, error: null });

    await expect(claimDraftForCreate(DRAFT_ID)).resolves.toBe(false);
  });
});

describe("releaseDraftCreateClaim", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears only this draft's own claim, never a real address", async () => {
    const recorded = fakeClient({ data: null, error: null });

    await releaseDraftCreateClaim(DRAFT_ID);

    expect(
      (recorded.payload as Record<string, unknown>).chain_address,
    ).toBeNull();
    expect(recorded.filters).toEqual([
      ["id", DRAFT_ID],
      ["chain_address", createClaimFor(DRAFT_ID)],
    ]);
  });
});

describe("insertInvites", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts one row per seat, passing the caller's tokens through untouched", async () => {
    const recorded = fakeClient({ data: [{ id: INVITE_ID }], error: null });

    await insertInvites(DRAFT_ID, SEATS);

    expect(recorded.table).toBe("signer_invites");
    expect(recorded.payload).toEqual([
      {
        draft_id: DRAFT_ID,
        name: "Ana Beatriz",
        role: "Coordenadora",
        email: "ana@example.org",
        token: "tok-ana",
      },
      {
        draft_id: DRAFT_ID,
        name: "Bruno Lima",
        role: "Diretor",
        email: "bruno@example.org",
        token: "tok-bruno",
      },
    ]);
  });

  it("surfaces a duplicate-token violation instead of swallowing it", async () => {
    // The unique index on signer_invites.token is the authority on collisions;
    // absorbing 23505 here (as logEvent deliberately does for its idempotency
    // ledger) would hand back seats whose magic links point at someone else.
    fakeClient({
      data: null,
      error: { message: "duplicate key value", code: "23505" },
    });

    await expect(insertInvites(DRAFT_ID, SEATS)).rejects.toThrow();
  });

  it("skips the round-trip when there are no seats", async () => {
    fakeClient({ data: [], error: null });

    await expect(insertInvites(DRAFT_ID, [])).resolves.toEqual([]);
    expect(getServiceClient).not.toHaveBeenCalled();
  });
});

describe("acceptInvite", () => {
  beforeEach(() => vi.clearAllMocks());

  it("binds the wallet and flips the seat to accepted", async () => {
    const recorded = fakeClient({
      data: { id: INVITE_ID, status: "accepted", wallet: WALLET },
      error: null,
    });

    const row = await acceptInvite(INVITE_ID, WALLET);

    const payload = recorded.payload as Record<string, unknown>;
    expect(payload.status).toBe("accepted");
    expect(payload.wallet).toBe(WALLET);
    expect(typeof payload.accepted_at).toBe("string");
    expect(row.status).toBe("accepted");
  });

  it("guards the transition in the WHERE clause, not in application code", async () => {
    // Two concurrent accepts must not both win: the status filter travels with
    // the UPDATE so Postgres decides, rather than a read-then-write here.
    const recorded = fakeClient({ data: { id: INVITE_ID }, error: null });

    await acceptInvite(INVITE_ID, WALLET);

    expect(recorded.filters).toEqual([
      ["id", INVITE_ID],
      ["status", "invited"],
    ]);
  });

  it("carries the 14-day cutoff into the UPDATE as well", async () => {
    // The read boundary derives 'expired', but only this filter stops a caller
    // that never read the row from binding a wallet to an aged-out seat.
    const recorded = fakeClient({ data: { id: INVITE_ID }, error: null });
    const before = Date.now();

    await acceptInvite(INVITE_ID, WALLET);

    expect(recorded.greaterThan).toHaveLength(1);
    const [column, cutoff] = recorded.greaterThan[0];
    expect(column).toBe("invited_at");
    const age = before - Date.parse(cutoff as string);
    expect(age).toBeGreaterThanOrEqual(INVITE_EXPIRY_DAYS * DAY_MS);
    expect(age).toBeLessThan((INVITE_EXPIRY_DAYS + 1) * DAY_MS);
  });

  it("rejects an invite that was already accepted or expired", async () => {
    // Zero rows matched — the seat is no longer 'invited'.
    fakeClient({ data: null, error: null });

    await expect(acceptInvite(INVITE_ID, WALLET)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("maps 0007's duplicate-wallet violation to the wallet-taken refusal", async () => {
    // Two signers confirming the same wallet at the same instant both pass the
    // route's read-first guard; the partial unique index is what decides it,
    // and the loser must see the same refusal — never a 500.
    fakeClient({
      data: null,
      error: { message: "duplicate key value", code: "23505" },
    });

    await expect(acceptInvite(INVITE_ID, WALLET)).rejects.toMatchObject({
      code: "INVITE_WALLET_TAKEN",
    });
  });
});

describe("setDraftChainAddress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes the address only over this draft's own create claim", async () => {
    const recorded = fakeClient({ data: { id: DRAFT_ID }, error: null });

    const landed = await setDraftChainAddress(DRAFT_ID, WALLET);

    expect(landed).toBe(true);
    const payload = recorded.payload as Record<string, unknown>;
    expect(payload.chain_address).toBe(WALLET);
    expect(recorded.filters).toEqual([
      ["id", DRAFT_ID],
      ["chain_address", createClaimFor(DRAFT_ID)],
    ]);
  });

  it("reports a miss instead of overwriting an address already there", async () => {
    fakeClient({ data: null, error: null });

    await expect(setDraftChainAddress(DRAFT_ID, WALLET)).resolves.toBe(false);
  });
});
