import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mocked BEFORE importing the module under test, per vitest's hoisting
// contract (same shape as draft-mutations.test.ts).
vi.mock("../mutations", () => ({
  dbConfigured: true,
  getServiceClient: vi.fn(),
}));

const { getServiceClient } = await import("../mutations");
const {
  getCertificateNotificationContext,
  listAllSignerWallets,
  listSignerWalletsForEdition,
  signerEmailsByWallet,
} = await import("../notification-queries");

interface Terminal {
  data: unknown;
  error: { message: string } | null;
}

interface Recorded {
  table: string;
  filters: Array<[string, unknown]>;
}

const responses = new Map<string, Terminal>();
let recorded: Recorded[] = [];

/**
 * Table-routed stand-in for the PostgREST builder: these accessors read from
 * four tables in sequence, so the fake answers per table and records the
 * filters that would have hit the wire. The builder is itself a thenable
 * because some chains end on `.eq()`/`.limit()` rather than `.maybeSingle()`.
 */
function installFakeClient(): void {
  vi.mocked(getServiceClient).mockReturnValue({
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const terminal = (): Terminal => {
        recorded.push({ table, filters });
        return responses.get(table) ?? { data: null, error: null };
      };
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        in: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        contains: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        limit: () => builder,
        maybeSingle: async () => terminal(),
        then: (resolve: (t: Terminal) => unknown) =>
          Promise.resolve(terminal()).then(resolve),
      };
      return builder;
    },
  } as unknown as SupabaseClient);
}

/** Filters recorded for a table — the reads run in parallel, so position is not the contract. */
function filtersFor(table: string): Array<[string, unknown]> | undefined {
  return recorded.find((entry) => entry.table === table)?.filters;
}

beforeEach(() => {
  vi.restoreAllMocks();
  responses.clear();
  recorded = [];
  installFakeClient();
});

describe("listAllSignerWallets", () => {
  it("returns each signer wallet once", async () => {
    responses.set("edition_signers", {
      data: [{ wallet: "A" }, { wallet: "B" }, { wallet: "A" }],
      error: null,
    });

    await expect(listAllSignerWallets()).resolves.toEqual(["A", "B"]);
  });

  it("throws when the read fails — the digest has nothing to stand on", async () => {
    responses.set("edition_signers", {
      data: null,
      error: { message: "connection reset" },
    });

    await expect(listAllSignerWallets()).rejects.toThrow();
  });
});

describe("listSignerWalletsForEdition", () => {
  it("filters by edition and dedupes", async () => {
    responses.set("edition_signers", {
      data: [{ wallet: "A" }, { wallet: "A" }, { wallet: "B" }],
      error: null,
    });

    const wallets = await listSignerWalletsForEdition("Ed1t10n");

    expect(wallets).toEqual(["A", "B"]);
    expect(recorded).toEqual([
      { table: "edition_signers", filters: [["edition_address", "Ed1t10n"]] },
    ]);
  });

  it("degrades to no wallets when the read fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    responses.set("edition_signers", {
      data: null,
      error: { message: "boom" },
    });

    await expect(listSignerWalletsForEdition("Ed1t10n")).resolves.toEqual([]);
  });
});

describe("signerEmailsByWallet", () => {
  it("maps wallets to invite emails", async () => {
    responses.set("signer_invites", {
      data: [
        { wallet: "A", email: "a@example.test" },
        { wallet: "B", email: "b@example.test" },
      ],
      error: null,
    });

    const emails = await signerEmailsByWallet(["A", "B"]);

    expect([...emails.entries()]).toEqual([
      ["A", "a@example.test"],
      ["B", "b@example.test"],
    ]);
    expect(recorded[0]?.filters).toEqual([["wallet", ["A", "B"]]]);
  });

  it("keeps the first email for a wallet invited more than once", async () => {
    responses.set("signer_invites", {
      data: [
        { wallet: "A", email: "first@example.test" },
        { wallet: "A", email: "second@example.test" },
      ],
      error: null,
    });

    const emails = await signerEmailsByWallet(["A"]);

    expect(emails.get("A")).toBe("first@example.test");
  });

  it("ignores rows with no wallet bound yet", async () => {
    responses.set("signer_invites", {
      data: [
        { wallet: null, email: "pending@example.test" },
        { wallet: "B", email: "" },
      ],
      error: null,
    });

    await expect(signerEmailsByWallet(["A", "B"])).resolves.toEqual(new Map());
  });

  it("asks nothing when there are no wallets", async () => {
    await expect(signerEmailsByWallet([])).resolves.toEqual(new Map());
    expect(recorded).toEqual([]);
  });

  it("degrades to no emails when signer_invites is unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    responses.set("signer_invites", {
      data: null,
      error: { message: 'relation "signer_invites" does not exist' },
    });

    await expect(signerEmailsByWallet(["A"])).resolves.toEqual(new Map());
  });
});

describe("getCertificateNotificationContext", () => {
  const CERT = {
    address: "Cert111",
    student_name: "Ana Souza",
    edition_address: "Ed1t10n",
    owner_did: "did:privy:abc",
    owner_wallet: "WaLLet1",
  };

  it("assembles student, edition and email from the profile linked by did", async () => {
    responses.set("certificates", { data: CERT, error: null });
    responses.set("editions", { data: { name: "Turma A" }, error: null });
    responses.set("profiles", {
      data: { email: "ana@example.test" },
      error: null,
    });

    const context = await getCertificateNotificationContext("Cert111");

    expect(context).toEqual({
      certificateAddress: "Cert111",
      studentName: "Ana Souza",
      studentEmail: "ana@example.test",
      editionAddress: "Ed1t10n",
      editionName: "Turma A",
    });
    expect(recorded.map((entry) => entry.table).sort()).toEqual([
      "certificates",
      "editions",
      "profiles",
    ]);
    expect(filtersFor("profiles")).toEqual([["did", "did:privy:abc"]]);
  });

  it("falls back to the profile holding the owner wallet", async () => {
    responses.set("certificates", {
      data: { ...CERT, owner_did: null },
      error: null,
    });
    responses.set("editions", { data: { name: "Turma A" }, error: null });
    responses.set("profiles", {
      data: [{ email: "wallet-owner@example.test" }],
      error: null,
    });

    const context = await getCertificateNotificationContext("Cert111");

    expect(context?.studentEmail).toBe("wallet-owner@example.test");
    expect(filtersFor("profiles")).toEqual([["wallets", ["WaLLet1"]]]);
  });

  it("reports a null email rather than failing when no profile matches", async () => {
    responses.set("certificates", { data: CERT, error: null });
    responses.set("editions", { data: { name: "Turma A" }, error: null });
    responses.set("profiles", { data: null, error: null });

    const context = await getCertificateNotificationContext("Cert111");

    expect(context?.studentEmail).toBeNull();
    expect(context?.editionName).toBe("Turma A");
  });

  it("returns null when the certificate is unknown", async () => {
    responses.set("certificates", { data: null, error: null });

    await expect(
      getCertificateNotificationContext("Cert111"),
    ).resolves.toBeNull();
  });

  it("returns null instead of throwing when the read fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    responses.set("certificates", {
      data: null,
      error: { message: "timeout" },
    });

    await expect(
      getCertificateNotificationContext("Cert111"),
    ).resolves.toBeNull();
  });

  it("still names the edition by address when the edition row is missing", async () => {
    responses.set("certificates", { data: CERT, error: null });
    responses.set("editions", { data: null, error: null });
    responses.set("profiles", {
      data: { email: "ana@example.test" },
      error: null,
    });

    const context = await getCertificateNotificationContext("Cert111");

    expect(context?.editionName).toBe("Ed1t10n");
  });
});
