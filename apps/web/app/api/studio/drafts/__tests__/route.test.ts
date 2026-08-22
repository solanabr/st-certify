import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditionDraftRow, SignerInviteRow } from "@/lib/db/types";

// Route-test style of app/api/cron/digest/__tests__/route.test.ts: the DB,
// mail and chain edges are faked; the auth gate, validation, seat-state rules
// and the AppError envelope stay real.
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));
vi.mock("@/lib/auth", () => ({ requireSysadmin: vi.fn() }));
vi.mock("@/lib/db/draft-queries", () => ({
  getDraft: vi.fn(),
  listDrafts: vi.fn(),
  listInvites: vi.fn(),
  listInvitesForDrafts: vi.fn(),
}));
vi.mock("@/lib/db/draft-mutations", () => ({
  insertDraft: vi.fn(),
  updateDraft: vi.fn(),
  insertInvites: vi.fn(),
  deleteInvite: vi.fn(),
  touchInviteReminded: vi.fn(),
  claimDraftForCreate: vi.fn(async () => true),
  releaseDraftCreateClaim: vi.fn(async () => {}),
}));
vi.mock("@/lib/db/queries", () => ({ getEditionByAddress: vi.fn() }));
vi.mock("@/lib/email/notify", () => ({
  notifyOnce: vi.fn(async () => ({ sent: true, deduped: false })),
}));
vi.mock("@/lib/editions/create", () => ({
  createEditionFromWizard: vi.fn(async () => ({
    address: "EdiTion1111111111111111111111111111111111",
    slug: "turma-2026",
  })),
  mirrorEditionFromWizard: vi.fn(async () => ({
    address: "EdiTion1111111111111111111111111111111111",
    slug: "turma-2026",
  })),
  autoSignatureBoxes: vi.fn(() => []),
}));
vi.mock("@/lib/attendance/token", () => ({
  generateClaimToken: vi.fn(() => "tok-generated"),
}));

const { requireSysadmin } = await import("@/lib/auth");
const { getDraft, listDrafts, listInvites, listInvitesForDrafts } =
  await import("@/lib/db/draft-queries");
const {
  insertDraft,
  updateDraft,
  insertInvites,
  deleteInvite,
  claimDraftForCreate,
  releaseDraftCreateClaim,
} = await import("@/lib/db/draft-mutations");
const { getEditionByAddress } = await import("@/lib/db/queries");
const { notifyOnce } = await import("@/lib/email/notify");
const { createEditionFromWizard, mirrorEditionFromWizard } =
  await import("@/lib/editions/create");
const { fail } = await import("@/lib/errors");

const drafts = await import("../route");
const draftItem = await import("../[id]/route");
const invites = await import("../[id]/invites/route");
const inviteItem = await import("../[id]/invites/[inviteId]/route");
const remind = await import("../[id]/invites/[inviteId]/remind/route");
const createOnchain = await import("../[id]/create-onchain/route");

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const SEAT_A = "22222222-2222-4222-8222-222222222222";
const SEAT_B = "33333333-3333-4333-8333-333333333333";
const WALLET_A = "AwaLLet11111111111111111111111111111111111";
const WALLET_B = "BwaLLet22222222222222222222222222222222222";
const DID = "did:privy:admin";

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
    created_by: DID,
    created_at: "2026-08-20T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
    ...over,
  };
}

function seatRow(over: Partial<SignerInviteRow> = {}): SignerInviteRow {
  return {
    id: SEAT_A,
    draft_id: DRAFT_ID,
    name: "Ana Beatriz",
    role: "Coordenadora",
    email: "ana@example.org",
    token: "tok-ana",
    status: "invited",
    wallet: null,
    invited_at: "2026-08-20T00:00:00Z",
    accepted_at: null,
    reminded_at: null,
    ...over,
  };
}

const jsonRequest = (body: unknown): Request =>
  ({ json: async () => body }) as unknown as Request;
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

const EDITION = "EdiTion1111111111111111111111111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSysadmin).mockResolvedValue({
    did: DID,
  } as Awaited<ReturnType<typeof requireSysadmin>>);
  vi.mocked(listInvites).mockResolvedValue([]);
  vi.mocked(notifyOnce).mockResolvedValue({ sent: true, deduped: false });
  vi.mocked(claimDraftForCreate).mockResolvedValue(true);
  // A linked draft normally has its mirror row; the tests that exercise the
  // crash window say otherwise.
  vi.mocked(getEditionByAddress).mockResolvedValue({
    address: EDITION,
  } as Awaited<ReturnType<typeof getEditionByAddress>>);
});

describe("auth gate", () => {
  it("refuses every draft route to a non-admin", async () => {
    vi.mocked(requireSysadmin).mockImplementation(async () =>
      fail("FORBIDDEN", "Apenas administradores podem acessar esta página."),
    );

    const responses = (await Promise.all([
      drafts.GET(),
      drafts.POST(jsonRequest({})),
      draftItem.GET(jsonRequest(null), params({ id: DRAFT_ID })),
      createOnchain.POST(jsonRequest(null), params({ id: DRAFT_ID })),
    ])) as unknown as FakeResponse[];

    for (const response of responses) {
      expect(response.status).toBe(403);
    }
    expect(insertDraft).not.toHaveBeenCalled();
    expect(createEditionFromWizard).not.toHaveBeenCalled();
  });
});

describe("POST /api/studio/drafts", () => {
  it("opens a draft owned by the caller and returns it with no seats", async () => {
    vi.mocked(insertDraft).mockResolvedValue(draftRow());

    const response = (await drafts.POST(
      jsonRequest({ meta: { name: "Turma 2026" } }),
    )) as unknown as FakeResponse;

    expect(insertDraft).toHaveBeenCalledWith({
      meta: { name: "Turma 2026" },
      createdBy: DID,
    });
    expect(response.body).toMatchObject({
      id: DRAFT_ID,
      chainAddress: null,
      seats: [],
    });
  });
});

describe("GET /api/studio/drafts", () => {
  it("attaches each draft's own seats in one batched query", async () => {
    const other = "44444444-4444-4444-8444-444444444444";
    vi.mocked(listDrafts).mockResolvedValue([
      draftRow(),
      draftRow({ id: other }),
    ]);
    vi.mocked(listInvitesForDrafts).mockResolvedValue([
      seatRow(),
      seatRow({ id: SEAT_B, draft_id: other, name: "Bruno Lima" }),
    ]);

    const response = (await drafts.GET()) as unknown as FakeResponse;
    const list = response.body as unknown as Array<{
      id: string;
      seats: Array<{ name: string }>;
    }>;

    expect(listInvitesForDrafts).toHaveBeenCalledTimes(1);
    expect(list[0].seats.map((s) => s.name)).toEqual(["Ana Beatriz"]);
    expect(list[1].seats.map((s) => s.name)).toEqual(["Bruno Lima"]);
  });
});

describe("GET/PATCH /api/studio/drafts/[id]", () => {
  it("404s an unknown draft", async () => {
    vi.mocked(getDraft).mockResolvedValue(null);

    const response = (await draftItem.GET(
      jsonRequest(null),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(response.status).toBe(404);
  });

  it("never leaks a seat's invite token", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(listInvites).mockResolvedValue([seatRow()]);

    const response = (await draftItem.GET(
      jsonRequest(null),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(JSON.stringify(response.body)).not.toContain("tok-ana");
  });

  it("merges a partial meta patch instead of replacing it", async () => {
    vi.mocked(getDraft).mockResolvedValue(
      draftRow({ meta: { name: "Turma 2026", slug: "turma-2026" } }),
    );
    vi.mocked(updateDraft).mockResolvedValue(draftRow());

    await draftItem.PATCH(
      jsonRequest({ meta: { description: "Formatura" } }),
      params({ id: DRAFT_ID }),
    );

    expect(updateDraft).toHaveBeenCalledWith(DRAFT_ID, {
      meta: {
        name: "Turma 2026",
        slug: "turma-2026",
        description: "Formatura",
      },
    });
  });

  it("derives template_sha from the patched layout rather than trusting the client", async () => {
    const sha = "a".repeat(64);
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(updateDraft).mockResolvedValue(draftRow());

    const box = {
      x: 0,
      y: 0.4,
      w: 1,
      h: 0.1,
      size: 0.05,
      color: "#FFFFFF",
      align: "center",
      font: "inter",
      weight: 400,
    } as const;
    await draftItem.PATCH(
      jsonRequest({
        layout: {
          version: 1,
          canvas: { width: 2000, height: 1414 },
          template: { sha256: sha },
          signers: [],
          fields: {
            student_name: box,
            date: box,
            cert_id: box,
            qr: { x: 0.88, y: 0.67, size: 0.11 },
          },
          signatures: [],
        },
      }),
      params({ id: DRAFT_ID }),
    );

    const [, patch] = vi.mocked(updateDraft).mock.calls[0];
    expect(patch.template_sha).toBe(sha);
  });

  it("refuses any edit once the edition exists on-chain", async () => {
    vi.mocked(getDraft).mockResolvedValue(
      draftRow({ chain_address: "EdiTion1111111111111111111111111111111111" }),
    );

    const response = (await draftItem.PATCH(
      jsonRequest({ meta: { name: "Outro nome" } }),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(response.status).toBe(409);
    expect(updateDraft).not.toHaveBeenCalled();
  });
});

describe("POST /api/studio/drafts/[id]/invites", () => {
  it("invites an emailed seat with a link carrying its own token", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(insertInvites).mockResolvedValue([
      seatRow({ token: "tok-generated" }),
    ]);

    await invites.POST(
      jsonRequest({
        seats: [
          {
            name: "Ana Beatriz",
            role: "Coordenadora",
            email: "ana@example.org",
          },
        ],
      }),
      params({ id: DRAFT_ID }),
    );

    expect(insertInvites).toHaveBeenCalledWith(DRAFT_ID, [
      {
        name: "Ana Beatriz",
        role: "Coordenadora",
        email: "ana@example.org",
        token: "tok-generated",
        wallet: null,
      },
    ]);
    expect(notifyOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana@example.org",
        kind: "signer-invite",
        refId: SEAT_A,
        payload: expect.objectContaining({
          inviteUrl: expect.stringContaining("/invite/tok-generated"),
        }),
      }),
    );
  });

  it("binds a manually-entered wallet immediately and emails nobody", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(insertInvites).mockResolvedValue([
      seatRow({ status: "accepted", wallet: WALLET_A, email: "" }),
    ]);

    await invites.POST(
      jsonRequest({
        seats: [
          { name: "Ana Beatriz", role: "Coordenadora", wallet: WALLET_A },
        ],
      }),
      params({ id: DRAFT_ID }),
    );

    expect(vi.mocked(insertInvites).mock.calls[0][1][0].wallet).toBe(WALLET_A);
    expect(notifyOnce).not.toHaveBeenCalled();
  });

  it("rejects a seat with neither an email nor a wallet", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow());

    const response = (await invites.POST(
      jsonRequest({ seats: [{ name: "Ana", role: "Coordenadora" }] }),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(response.status).toBe(400);
    expect(insertInvites).not.toHaveBeenCalled();
  });

  it("refuses to exceed the on-chain six-signer ceiling", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(listInvites).mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => seatRow({ id: `seat-${i}` })),
    );

    const response = (await invites.POST(
      jsonRequest({
        seats: [{ name: "Sete", role: "Extra", email: "sete@example.org" }],
      }),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(response.status).toBe(400);
    expect(insertInvites).not.toHaveBeenCalled();
  });

  it("refuses new seats once the edition exists on-chain", async () => {
    vi.mocked(getDraft).mockResolvedValue(
      draftRow({ chain_address: "EdiTion1111111111111111111111111111111111" }),
    );

    const response = (await invites.POST(
      jsonRequest({
        seats: [{ name: "Ana", role: "Coord", email: "ana@example.org" }],
      }),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(response.status).toBe(409);
    expect(insertInvites).not.toHaveBeenCalled();
  });
});

describe("seat removal and reminders", () => {
  it("404s removing a seat that isn't on this draft", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(listInvites).mockResolvedValue([seatRow()]);

    const response = (await inviteItem.DELETE(
      jsonRequest(null),
      params({ id: DRAFT_ID, inviteId: SEAT_B }),
    )) as unknown as FakeResponse;

    expect(response.status).toBe(404);
    expect(deleteInvite).not.toHaveBeenCalled();
  });

  it("reminds a pending signer at most once a day", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(listInvites).mockResolvedValue([seatRow()]);

    await remind.POST(
      jsonRequest(null),
      params({ id: DRAFT_ID, inviteId: SEAT_A }),
    );

    expect(notifyOnce).toHaveBeenCalledWith(
      expect.objectContaining({ refId: SEAT_A, minIntervalHours: 20 }),
    );
  });

  it("refuses to remind a signer who already accepted", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(listInvites).mockResolvedValue([
      seatRow({ status: "accepted", wallet: WALLET_A }),
    ]);

    const response = (await remind.POST(
      jsonRequest(null),
      params({ id: DRAFT_ID, inviteId: SEAT_A }),
    )) as unknown as FakeResponse;

    expect(response.status).toBe(409);
    expect(notifyOnce).not.toHaveBeenCalled();
  });
});

describe("POST /api/studio/drafts/[id]/create-onchain", () => {
  const accepted = [
    seatRow({ id: SEAT_A, status: "accepted", wallet: WALLET_A }),
    seatRow({
      id: SEAT_B,
      name: "Bruno Lima",
      role: "Diretor",
      status: "accepted",
      wallet: WALLET_B,
    }),
  ];

  it("refuses while any seat is still unaccepted, naming who is missing", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(listInvites).mockResolvedValue([
      accepted[0],
      seatRow({ id: SEAT_B, name: "Bruno Lima", status: "invited" }),
    ]);

    const response = (await createOnchain.POST(
      jsonRequest(null),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(response.status).toBe(409);
    expect(response.body.error?.message).toContain("Bruno Lima");
    expect(createEditionFromWizard).not.toHaveBeenCalled();
  });

  it("refuses a draft with fewer than two seats", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(listInvites).mockResolvedValue([accepted[0]]);

    const response = (await createOnchain.POST(
      jsonRequest(null),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(response.status).toBe(400);
    expect(createEditionFromWizard).not.toHaveBeenCalled();
  });

  it("refuses a draft whose metadata never got completed", async () => {
    vi.mocked(getDraft).mockResolvedValue(
      draftRow({ meta: { name: "Só nome" } }),
    );
    vi.mocked(listInvites).mockResolvedValue(accepted);

    const response = (await createOnchain.POST(
      jsonRequest(null),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(response.status).toBe(400);
    expect(createEditionFromWizard).not.toHaveBeenCalled();
  });

  it("creates the edition from the accepted seats and links the draft", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(listInvites).mockResolvedValue(accepted);
    vi.mocked(updateDraft).mockResolvedValue(draftRow());

    const response = (await createOnchain.POST(
      jsonRequest(null),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(createEditionFromWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        templatePath: "default",
        actorDid: DID,
        signers: [
          { wallet: WALLET_A, name: "Ana Beatriz", role: "Coordenadora" },
          { wallet: WALLET_B, name: "Bruno Lima", role: "Diretor" },
        ],
      }),
      // The hook that persists the address the moment the write confirms.
      expect.objectContaining({ onChainWritten: expect.any(Function) }),
    );
    expect(updateDraft).toHaveBeenCalledWith(DRAFT_ID, {
      chain_address: EDITION,
    });
    expect(response.body).toMatchObject({ slug: "turma-2026" });
  });

  it("is idempotent: a second call never writes a second edition", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow({ chain_address: EDITION }));

    const response = (await createOnchain.POST(
      jsonRequest(null),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(response.status).toBe(200);
    expect(createEditionFromWizard).not.toHaveBeenCalled();
    // Mirror already there: nothing to repair either.
    expect(mirrorEditionFromWizard).not.toHaveBeenCalled();
    expect(claimDraftForCreate).not.toHaveBeenCalled();
  });

  it("claims the draft before writing to the chain", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(listInvites).mockResolvedValue(accepted);
    vi.mocked(updateDraft).mockResolvedValue(draftRow());

    await createOnchain.POST(jsonRequest(null), params({ id: DRAFT_ID }));

    expect(claimDraftForCreate).toHaveBeenCalledWith(DRAFT_ID);
    expect(
      vi.mocked(claimDraftForCreate).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(createEditionFromWizard).mock.invocationCallOrder[0],
    );
    // The claim was converted into the real address, so nothing releases it.
    expect(releaseDraftCreateClaim).not.toHaveBeenCalled();
  });

  it("refuses a second request while the first is still in flight", async () => {
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(listInvites).mockResolvedValue(accepted);
    vi.mocked(claimDraftForCreate).mockResolvedValue(false);

    const response = (await createOnchain.POST(
      jsonRequest(null),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(response.status).toBe(409);
    expect(createEditionFromWizard).not.toHaveBeenCalled();
  });

  it("hands the claim back when the attempt never reaches the chain", async () => {
    // A slug taken between wizard steps, an RPC that refused the request —
    // nothing was minted, so the draft must stay creatable.
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(listInvites).mockResolvedValue(accepted);
    vi.mocked(createEditionFromWizard).mockImplementationOnce(async () =>
      fail("VALIDATION", "Este slug já está em uso.", { field: "slug" }),
    );

    const response = (await createOnchain.POST(
      jsonRequest(null),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(response.status).toBe(400);
    expect(releaseDraftCreateClaim).toHaveBeenCalledWith(DRAFT_ID);
  });

  it("finishes the mirror on retry instead of minting a second edition", async () => {
    // The window this whole dance exists for: create_edition confirmed, the
    // mirror insert then failed. `chain_address` is written from inside the
    // flow, so the retry can tell repair from a fresh create.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(listInvites).mockResolvedValue(accepted);
    vi.mocked(updateDraft).mockResolvedValue(draftRow());
    vi.mocked(createEditionFromWizard).mockImplementationOnce(
      async (_input, hooks) => {
        await hooks?.onChainWritten?.(EDITION);
        throw new Error("mirror insert failed");
      },
    );

    const first = (await createOnchain.POST(
      jsonRequest(null),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(first.status).toBe(500);
    // The address landed before the mirror was attempted, and the claim was
    // NOT handed back — a released claim here is what re-mints.
    expect(updateDraft).toHaveBeenCalledWith(DRAFT_ID, {
      chain_address: EDITION,
    });
    expect(releaseDraftCreateClaim).not.toHaveBeenCalled();

    // Retry: the draft is linked, the mirror row is still missing.
    vi.mocked(getDraft).mockResolvedValue(draftRow({ chain_address: EDITION }));
    vi.mocked(getEditionByAddress).mockResolvedValue(null);

    const second = (await createOnchain.POST(
      jsonRequest(null),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ address: EDITION });
    expect(createEditionFromWizard).toHaveBeenCalledTimes(1);
    expect(mirrorEditionFromWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        signers: [
          { wallet: WALLET_A, name: "Ana Beatriz", role: "Coordenadora" },
          { wallet: WALLET_B, name: "Bruno Lima", role: "Diretor" },
        ],
      }),
      EDITION,
    );
    errorSpy.mockRestore();
  });

  it("keeps the created edition when linking the draft fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getDraft).mockResolvedValue(draftRow());
    vi.mocked(listInvites).mockResolvedValue(accepted);
    vi.mocked(updateDraft).mockRejectedValue(new Error("db down"));

    const response = (await createOnchain.POST(
      jsonRequest(null),
      params({ id: DRAFT_ID }),
    )) as unknown as FakeResponse;

    // The chain write already happened; reporting failure would invite a
    // retry that creates a second edition.
    expect(response.status).toBe(200);
    expect(errorSpy.mock.calls[0][0]).toContain("[studio:reconcile]");
    errorSpy.mockRestore();
  });
});
