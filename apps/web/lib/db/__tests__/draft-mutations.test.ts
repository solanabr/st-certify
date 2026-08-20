import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mocked BEFORE importing the module under test, per vitest's hoisting
// contract (same shape as attendance-mutations.test.ts).
vi.mock("../mutations", () => ({
  dbConfigured: true,
  getServiceClient: vi.fn(),
}));

const { getServiceClient } = await import("../mutations");
const { acceptInvite, insertDraft, insertInvites, updateDraft } =
  await import("../draft-mutations");

interface Terminal {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface Recorded {
  table: string | null;
  payload: unknown;
  filters: Array<[string, unknown]>;
}

/**
 * One chainable stand-in for the PostgREST builder, since these four writes
 * end in different chains (`.select().single()`, `.select().maybeSingle()`,
 * and a bare awaited `.select()` — the builder is itself a thenable, which is
 * why `then` is implemented here). Records the table, the written payload and
 * every `.eq()` filter so the tests can assert on what would hit the wire.
 */
function fakeClient(terminal: Terminal): Recorded {
  const recorded: Recorded = { table: null, payload: undefined, filters: [] };
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
    expect(recorded.filters).toEqual([["id", DRAFT_ID]]);
  });

  it("reports a missing draft as NOT_FOUND rather than a generic failure", async () => {
    fakeClient({ data: null, error: null });

    await expect(updateDraft(DRAFT_ID, { meta: {} })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
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

  it("rejects an invite that was already accepted or expired", async () => {
    // Zero rows matched — the seat is no longer 'invited'.
    fakeClient({ data: null, error: null });

    await expect(acceptInvite(INVITE_ID, WALLET)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
