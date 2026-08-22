import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditionDraftRow, SignerInviteRow } from "@/lib/db/types";

// Route-test style of app/api/studio/drafts/__tests__/route.test.ts: the DB
// edge and the session are faked; the token lifecycle, the wallet-ownership
// check, zod validation and the AppError envelope stay real.
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/draft-queries", () => ({ getInviteByToken: vi.fn() }));
vi.mock("@/lib/db/draft-mutations", () => ({ acceptInvite: vi.fn() }));

const { requireUser } = await import("@/lib/auth");
const { getInviteByToken } = await import("@/lib/db/draft-queries");
const { acceptInvite } = await import("@/lib/db/draft-mutations");
const { fail } = await import("@/lib/errors");

const lookup = await import("../[token]/route");
const accept = await import("../[token]/accept/route");

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const SEAT_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "tok-ana";
const INVITED_EMAIL = "ana@example.org";
const MINE = "AwaLLet11111111111111111111111111111111111";
const SOMEONE_ELSE = "BwaLLet22222222222222222222222222222222222";
const DID = "did:privy:ana";

interface FakeResponse {
  body: Record<string, unknown> & { error?: { code: string; message: string } };
  status: number;
}

function draftRow(over: Partial<EditionDraftRow> = {}): EditionDraftRow {
  return {
    id: DRAFT_ID,
    meta: { name: "Turma 2026", slug: "turma-2026" },
    layout: null,
    template_sha: null,
    chain_address: null,
    created_by: "did:privy:admin",
    created_at: "2026-08-20T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
    ...over,
  };
}

function seatRow(over: Partial<SignerInviteRow> = {}): SignerInviteRow {
  return {
    id: SEAT_ID,
    draft_id: DRAFT_ID,
    name: "Ana Beatriz",
    role: "Coordenadora",
    email: INVITED_EMAIL,
    token: TOKEN,
    status: "invited",
    wallet: null,
    invited_at: "2026-08-20T00:00:00Z",
    accepted_at: null,
    reminded_at: null,
    ...over,
  };
}

function invite(
  seat: Partial<SignerInviteRow> = {},
  draft: Partial<EditionDraftRow> = {},
) {
  return { ...seatRow(seat), draft: draftRow(draft) };
}

const jsonRequest = (body: unknown): Request =>
  ({ json: async () => body }) as unknown as Request;
const params = (token: string) => ({ params: Promise.resolve({ token }) });

const getInvite = (token = TOKEN) =>
  lookup.GET(
    jsonRequest(null),
    params(token),
  ) as unknown as Promise<FakeResponse>;
const postAccept = (body: unknown, token = TOKEN) =>
  accept.POST(
    jsonRequest(body),
    params(token),
  ) as unknown as Promise<FakeResponse>;

/** The session the seat was addressed to, unless a test says otherwise. */
function givenSession(
  over: { email?: string | null; wallets?: string[] } = {},
) {
  vi.mocked(requireUser).mockResolvedValue({
    did: DID,
    email: "email" in over ? (over.email ?? null) : INVITED_EMAIL,
    wallets: over.wallets ?? [MINE],
  } as Awaited<ReturnType<typeof requireUser>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  givenSession();
});

afterEach(() => {
  delete process.env.ISSUER_NAME;
  delete process.env.ISSUER_CONTACT_URL;
});

describe("GET /api/invite/[token]", () => {
  it("404s an unknown token", async () => {
    vi.mocked(getInviteByToken).mockResolvedValue(null);

    const response = await getInvite("tok-nope");

    expect(response.status).toBe(404);
    expect(response.body.error?.code).toBe("NOT_FOUND");
  });

  it("describes the seat without leaking the token or any e-mail", async () => {
    vi.mocked(getInviteByToken).mockResolvedValue(invite());

    const response = await getInvite();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      seatId: SEAT_ID,
      name: "Ana Beatriz",
      role: "Coordenadora",
      status: "invited",
      editionName: "Turma 2026",
      wallet: null,
      frozen: false,
    });
    // The bearer capability and the signer's e-mail must never come back out.
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(INVITED_EMAIL);
    expect(serialized).not.toContain(DRAFT_ID);
  });

  it("still answers for a spent seat, so the page can say which dead-state it is", async () => {
    vi.mocked(getInviteByToken).mockResolvedValue(
      invite({ status: "accepted", wallet: MINE }),
    );

    const response = await getInvite();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "accepted", wallet: MINE });
  });

  it("hands a link the accessor aged out to both surfaces as a dead one", async () => {
    // getInviteByToken derives 'expired' from invited_at — nothing ever writes
    // that status — so a stale magic link arrives here already spent, and
    // neither reading it nor accepting it may revive the seat.
    vi.mocked(getInviteByToken).mockResolvedValue(
      invite({ status: "expired", invited_at: "2026-06-01T00:00:00Z" }),
    );

    const [read, accepted] = await Promise.all([
      getInvite(),
      postAccept({ wallet: MINE }),
    ]);

    expect(read.body).toMatchObject({ status: "expired", wallet: null });
    expect(accepted.status).toBe(409);
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("carries the configured issuer so a dead link names someone to contact", async () => {
    process.env.ISSUER_NAME = "Superteam Brasil";
    process.env.ISSUER_CONTACT_URL = "https://superteam.fun/br";
    vi.mocked(getInviteByToken).mockResolvedValue(
      invite({ status: "expired" }),
    );

    const response = await getInvite();

    expect(response.body.issuer).toEqual({
      name: "Superteam Brasil",
      contactUrl: "https://superteam.fun/br",
      cnpj: undefined,
    });
  });
});

describe("POST /api/invite/[token]/accept", () => {
  it("refuses a caller with no session before touching the seat", async () => {
    vi.mocked(requireUser).mockImplementation(async () =>
      fail("UNAUTHORIZED", "Entre para continuar.", { action: "login" }),
    );

    const response = await postAccept({ wallet: MINE });

    expect(response.status).toBe(401);
    expect(getInviteByToken).not.toHaveBeenCalled();
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("rejects a body without a usable wallet", async () => {
    const responses = await Promise.all([
      postAccept({}),
      postAccept({ wallet: "" }),
      postAccept({ wallet: "not a base58 address!" }),
      postAccept(null),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body.error?.code).toBe("VALIDATION");
    }
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("404s an unknown token", async () => {
    vi.mocked(getInviteByToken).mockResolvedValue(null);

    const response = await postAccept({ wallet: MINE }, "tok-nope");

    expect(response.status).toBe(404);
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("rejects a seat that was already accepted", async () => {
    vi.mocked(getInviteByToken).mockResolvedValue(
      invite({ status: "accepted", wallet: MINE }),
    );

    const response = await postAccept({ wallet: MINE });

    expect(response.status).toBe(409);
    expect(response.body.error?.message).toContain("já foi confirmado");
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("rejects an expired seat and points at the organiser", async () => {
    vi.mocked(getInviteByToken).mockResolvedValue(
      invite({ status: "expired" }),
    );

    const response = await postAccept({ wallet: MINE });

    expect(response.status).toBe(409);
    expect(response.body.error?.message).toContain("expirou");
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("rejects a seat whose edition is already on-chain", async () => {
    vi.mocked(getInviteByToken).mockResolvedValue(
      invite(
        {},
        { chain_address: "Ed1t10n11111111111111111111111111111111111" },
      ),
    );

    const response = await postAccept({ wallet: MINE });

    expect(response.status).toBe(409);
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("refuses an account other than the one the invite was sent to", async () => {
    // The forwarded-invite case: a real session, a real seat, the wrong person.
    vi.mocked(getInviteByToken).mockResolvedValue(invite());
    givenSession({ email: "bruno@example.org" });

    const response = await postAccept({ wallet: MINE });

    expect(response.status).toBe(403);
    expect(response.body.error?.code).toBe("INVITE_EMAIL_MISMATCH");
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("refuses a wallet-only session on an emailed seat", async () => {
    // Nothing to compare against: a login with no e-mail cannot be shown to be
    // the invited signer, so it is refused rather than assumed.
    vi.mocked(getInviteByToken).mockResolvedValue(invite());
    givenSession({ email: null });

    const response = await postAccept({ wallet: MINE });

    expect(response.status).toBe(403);
    expect(response.body.error?.code).toBe("INVITE_EMAIL_MISMATCH");
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("accepts the invited e-mail however it was capitalised or padded", async () => {
    vi.mocked(getInviteByToken).mockResolvedValue(
      invite({ email: " Ana@Example.ORG " }),
    );
    givenSession({ email: "ana@EXAMPLE.org" });
    vi.mocked(acceptInvite).mockResolvedValue(
      seatRow({ status: "accepted", wallet: MINE }),
    );

    const response = await postAccept({ wallet: MINE });

    expect(response.status).toBe(200);
    expect(acceptInvite).toHaveBeenCalledWith(SEAT_ID, MINE);
  });

  it("lets a manual-wallet seat through, since it was addressed to nobody", async () => {
    // Seats bound by raw wallet carry no e-mail and are born accepted; the
    // identity check must not turn that empty string into a mismatch.
    vi.mocked(getInviteByToken).mockResolvedValue(invite({ email: "" }));
    givenSession({ email: null });
    vi.mocked(acceptInvite).mockResolvedValue(
      seatRow({ email: "", status: "accepted", wallet: MINE }),
    );

    const response = await postAccept({ wallet: MINE });

    expect(response.status).toBe(200);
    expect(acceptInvite).toHaveBeenCalledWith(SEAT_ID, MINE);
  });

  it("refuses to bind a wallet the session does not own", async () => {
    vi.mocked(getInviteByToken).mockResolvedValue(invite());

    const response = await postAccept({ wallet: SOMEONE_ELSE });

    expect(response.status).toBe(403);
    expect(response.body.error?.code).toBe("FORBIDDEN");
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("binds the chosen wallet and flips the seat to accepted", async () => {
    vi.mocked(getInviteByToken).mockResolvedValue(invite());
    vi.mocked(acceptInvite).mockResolvedValue(
      seatRow({
        status: "accepted",
        wallet: MINE,
        accepted_at: "2026-08-21T10:00:00Z",
      }),
    );

    const response = await postAccept({ wallet: MINE });

    expect(acceptInvite).toHaveBeenCalledWith(SEAT_ID, MINE);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      seatId: SEAT_ID,
      status: "accepted",
      wallet: MINE,
      editionName: "Turma 2026",
    });
    expect(JSON.stringify(response.body)).not.toContain(TOKEN);
  });

  it("surfaces the DB's own status guard when two tabs race", async () => {
    // Both reads see `invited`; the second write loses `eq("status",
    // "invited")` inside acceptInvite. That guard, not this route's check, is
    // what makes double-accept impossible.
    vi.mocked(getInviteByToken).mockResolvedValue(invite());
    vi.mocked(acceptInvite).mockImplementation(async () =>
      fail(
        "CONFLICT",
        "Este convite já foi utilizado ou não está mais válido.",
      ),
    );

    const response = await postAccept({ wallet: MINE });

    expect(response.status).toBe(409);
    expect(response.body.error?.code).toBe("CONFLICT");
  });
});
