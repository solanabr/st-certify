import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked BEFORE importing notify, per vitest's hoisting contract (mirrors
// app/api/attendance/claim/__tests__/route.test.ts). `dbConfigured` is exposed
// as a getter so a single mock covers both the configured and unconfigured
// paths — notify reads it at call time.
//
// `ops` is the point of most of these tests: notifyOnce claims the ledger row
// before it calls the provider, so the ORDER of ledger write vs send is the
// behaviour under test, not just the final row.
const state = {
  configured: true,
  logRows: [] as Array<{ sent_at: string }>,
  selectError: null as { message: string } | null,
  insertError: null as { message: string; code?: string } | null,
  updateError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
  /** Whether the guarded `sent_at` update finds its row — false = lost race. */
  updateMatches: true,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{
    table: string;
    patch: Record<string, unknown>;
    filters: Record<string, string>;
  }>,
  deletes: [] as Array<{ table: string; filters: Record<string, string> }>,
  selects: [] as Array<{ table: string; filters: Record<string, string> }>,
  ops: [] as string[],
};

function fakeClient() {
  return {
    from(table: string) {
      const filters: Record<string, string> = {};
      let op = "select";
      let row: Record<string, unknown> = {};
      let patch: Record<string, unknown> = {};

      function settle(): { data: unknown; error: unknown } {
        state.ops.push(op);
        if (op === "insert") {
          state.inserts.push({ table, ...row });
          return { data: null, error: state.insertError };
        }
        if (op === "update") {
          state.updates.push({ table, patch, filters });
          if (state.updateError) {
            return { data: null, error: state.updateError };
          }
          return {
            data: state.updateMatches ? [{ sent_at: patch.sent_at }] : [],
            error: null,
          };
        }
        if (op === "delete") {
          state.deletes.push({ table, filters });
          return { data: null, error: state.deleteError };
        }
        state.selects.push({ table, filters });
        return { data: state.logRows, error: state.selectError };
      }

      const builder = {
        select() {
          return builder;
        },
        insert(values: Record<string, unknown>) {
          op = "insert";
          row = values;
          return builder;
        },
        update(values: Record<string, unknown>) {
          op = "update";
          patch = values;
          return builder;
        },
        delete() {
          op = "delete";
          return builder;
        },
        eq(column: string, value: string) {
          filters[column] = value;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        // Thenable rather than promise-returning: the chains end on different
        // methods (.limit(), .select(), .eq()) depending on the statement.
        then(
          resolve: (value: { data: unknown; error: unknown }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve(settle()).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

vi.mock("@/lib/db/mutations", () => ({
  get dbConfigured() {
    return state.configured;
  },
  getServiceClient: () => fakeClient(),
}));
vi.mock("../send", () => ({
  sendEmail: vi.fn(async () => ({ sent: true })),
}));

const { sendEmail } = await import("../send");
const { notifyOnce } = await import("../notify");

/** Keeps the send in the same timeline as the ledger writes. */
function mockSend(result: { sent: boolean; reason?: string }) {
  vi.mocked(sendEmail).mockImplementation(async () => {
    state.ops.push("send");
    return result;
  });
}

const ARGS = {
  to: "signer@example.test",
  kind: "requests-pending" as const,
  locale: "pt-BR" as const,
  refId: "Ed1t10n1111111111111111111111111111111111",
  payload: {
    editionName: "Turma A",
    count: 2,
    signUrl: "https://certify.test/sign",
  },
};

const LOGGED_ROW = {
  table: "notification_log",
  type: ARGS.kind,
  recipient: ARGS.to,
  ref_id: ARGS.refId,
  sent_at: expect.any(String) as unknown as string,
};

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  vi.mocked(sendEmail).mockClear();
  state.configured = true;
  state.logRows = [];
  state.selectError = null;
  state.insertError = null;
  state.updateError = null;
  state.deleteError = null;
  state.updateMatches = true;
  state.inserts = [];
  state.updates = [];
  state.deletes = [];
  state.selects = [];
  state.ops = [];
  mockSend({ sent: true });
});

describe("notifyOnce", () => {
  it("claims the ledger row before handing the email to the provider", async () => {
    const result = await notifyOnce(ARGS);

    expect(result).toEqual({ sent: true, deduped: false });
    expect(state.ops).toEqual(["select", "insert", "send"]);
    expect(sendEmail).toHaveBeenCalledWith(
      ARGS.to,
      ARGS.kind,
      ARGS.locale,
      ARGS.payload,
    );
    expect(state.inserts).toEqual([LOGGED_ROW]);
  });

  it("looks the log up by type, recipient and ref", async () => {
    await notifyOnce(ARGS);

    expect(state.selects).toEqual([
      {
        table: "notification_log",
        filters: {
          type: ARGS.kind,
          recipient: ARGS.to,
          ref_id: ARGS.refId,
        },
      },
    ]);
  });

  it("treats a unique violation as another worker's send", async () => {
    state.insertError = {
      message: "duplicate key value violates unique constraint",
      code: "23505",
    };

    const result = await notifyOnce(ARGS);

    expect(result).toEqual({ sent: false, deduped: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state.ops).toEqual(["select", "insert"]);
  });

  it("dedupes a second identical call", async () => {
    state.logRows = [{ sent_at: hoursAgo(1) }];

    const result = await notifyOnce(ARGS);

    expect(result).toEqual({ sent: false, deduped: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
  });

  it("dedupes forever when no minIntervalHours is given", async () => {
    state.logRows = [{ sent_at: hoursAgo(24 * 365) }];

    const result = await notifyOnce(ARGS);

    expect(result).toEqual({ sent: false, deduped: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("advances the row in place once minIntervalHours has elapsed", async () => {
    const previous = hoursAgo(21);
    state.logRows = [{ sent_at: previous }];

    const result = await notifyOnce({ ...ARGS, minIntervalHours: 20 });

    expect(result).toEqual({ sent: true, deduped: false });
    expect(state.ops).toEqual(["select", "update", "send"]);
    expect(state.inserts).toEqual([]);
    expect(state.updates).toHaveLength(1);
    // Guarded on the sent_at we read: a racing caller no longer matches.
    expect(state.updates[0].filters).toEqual({
      type: ARGS.kind,
      recipient: ARGS.to,
      ref_id: ARGS.refId,
      sent_at: previous,
    });
    expect(state.updates[0].patch.sent_at).not.toBe(previous);
  });

  it("backs off when the guarded advance matches nothing", async () => {
    state.logRows = [{ sent_at: hoursAgo(21) }];
    state.updateMatches = false;

    const result = await notifyOnce({ ...ARGS, minIntervalHours: 20 });

    expect(result).toEqual({ sent: false, deduped: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state.ops).toEqual(["select", "update"]);
  });

  it("holds back inside minIntervalHours", async () => {
    state.logRows = [{ sent_at: hoursAgo(2) }];

    const result = await notifyOnce({ ...ARGS, minIntervalHours: 20 });

    expect(result).toEqual({ sent: false, deduped: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("releases a first claim whose send failed", async () => {
    mockSend({ sent: false, reason: "domain is not verified" });

    const result = await notifyOnce(ARGS);

    expect(result).toEqual({ sent: false, deduped: false });
    expect(state.ops).toEqual(["select", "insert", "send", "delete"]);
    // Deletes exactly the row it wrote, never a concurrent claim.
    expect(state.deletes).toEqual([
      {
        table: "notification_log",
        filters: {
          type: ARGS.kind,
          recipient: ARGS.to,
          ref_id: ARGS.refId,
          sent_at: state.inserts[0].sent_at as string,
        },
      },
    ]);
  });

  it("restores the previous sent_at when an interval resend fails", async () => {
    const previous = hoursAgo(21);
    state.logRows = [{ sent_at: previous }];
    mockSend({ sent: false, reason: "rate limited" });

    const result = await notifyOnce({ ...ARGS, minIntervalHours: 20 });

    expect(result).toEqual({ sent: false, deduped: false });
    expect(state.ops).toEqual(["select", "update", "send", "update"]);
    const claimedAt = state.updates[0].patch.sent_at as string;
    expect(state.updates[1].patch).toEqual({ sent_at: previous });
    expect(state.updates[1].filters.sent_at).toBe(claimedAt);
    expect(state.deletes).toEqual([]);
  });

  it("still sends when the log is unavailable", async () => {
    state.configured = false;

    const result = await notifyOnce(ARGS);

    expect(result).toEqual({ sent: true, deduped: false });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(state.inserts).toEqual([]);
  });

  it("prefers delivering over staying silent when the log read fails", async () => {
    state.selectError = { message: "relation notification_log does not exist" };

    const result = await notifyOnce(ARGS);

    expect(result).toEqual({ sent: true, deduped: false });
    // Nothing could be claimed, so this one path still records afterwards.
    expect(state.ops).toEqual(["select", "send", "insert"]);
    expect(state.inserts).toEqual([LOGGED_ROW]);
  });

  it("holds no claim to release when the log read failed and the send failed", async () => {
    state.selectError = { message: "connection reset" };
    mockSend({ sent: false, reason: "network down" });

    const result = await notifyOnce(ARGS);

    expect(result).toEqual({ sent: false, deduped: false });
    expect(state.ops).toEqual(["select", "send"]);
    expect(state.deletes).toEqual([]);
  });

  it("sends anyway, without retrying, when the claim write fails", async () => {
    state.insertError = { message: "connection reset by peer" };

    await expect(notifyOnce(ARGS)).resolves.toEqual({
      sent: true,
      deduped: false,
    });
    expect(state.ops).toEqual(["select", "insert", "send"]);
    expect(state.inserts).toHaveLength(1);
  });

  it("sends anyway when the guarded advance itself errors", async () => {
    state.logRows = [{ sent_at: hoursAgo(21) }];
    state.updateError = { message: "deadlock detected" };
    mockSend({ sent: false, reason: "unconfigured" });

    const result = await notifyOnce({ ...ARGS, minIntervalHours: 20 });

    // No claim was taken, so there is nothing to roll back after the failure.
    expect(result).toEqual({ sent: false, deduped: false });
    expect(state.ops).toEqual(["select", "update", "send"]);
  });
});
