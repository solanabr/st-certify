import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked BEFORE importing notify, per vitest's hoisting contract (mirrors
// app/api/attendance/claim/__tests__/route.test.ts). `dbConfigured` is exposed
// as a getter so a single mock covers both the configured and unconfigured
// paths — notify reads it at call time.
const state = {
  configured: true,
  logRows: [] as Array<{ sent_at: string }>,
  selectError: null as { message: string } | null,
  insertError: null as { message: string } | null,
  inserts: [] as Array<Record<string, unknown>>,
  selects: [] as Array<{ table: string; filters: Record<string, string> }>,
};

function fakeClient() {
  return {
    from(table: string) {
      const filters: Record<string, string> = {};
      const builder = {
        select() {
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
          state.selects.push({ table, filters });
          return Promise.resolve({
            data: state.logRows,
            error: state.selectError,
          });
        },
        insert(row: Record<string, unknown>) {
          state.inserts.push({ table, ...row });
          return Promise.resolve({ error: state.insertError });
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

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  vi.mocked(sendEmail).mockClear();
  vi.mocked(sendEmail).mockResolvedValue({ sent: true });
  state.configured = true;
  state.logRows = [];
  state.selectError = null;
  state.insertError = null;
  state.inserts = [];
  state.selects = [];
});

describe("notifyOnce", () => {
  it("sends and records the notification when nothing was logged", async () => {
    const result = await notifyOnce(ARGS);

    expect(result).toEqual({ sent: true, deduped: false });
    expect(sendEmail).toHaveBeenCalledWith(
      ARGS.to,
      ARGS.kind,
      ARGS.locale,
      ARGS.payload,
    );
    expect(state.inserts).toEqual([
      {
        table: "notification_log",
        type: ARGS.kind,
        recipient: ARGS.to,
        ref_id: ARGS.refId,
      },
    ]);
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

  it("resends once minIntervalHours has elapsed", async () => {
    state.logRows = [{ sent_at: hoursAgo(21) }];

    const result = await notifyOnce({ ...ARGS, minIntervalHours: 20 });

    expect(result).toEqual({ sent: true, deduped: false });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(state.inserts).toHaveLength(1);
  });

  it("holds back inside minIntervalHours", async () => {
    state.logRows = [{ sent_at: hoursAgo(2) }];

    const result = await notifyOnce({ ...ARGS, minIntervalHours: 20 });

    expect(result).toEqual({ sent: false, deduped: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not record a send that never happened", async () => {
    vi.mocked(sendEmail).mockResolvedValue({
      sent: false,
      reason: "unconfigured",
    });

    const result = await notifyOnce(ARGS);

    expect(result).toEqual({ sent: false, deduped: false });
    expect(state.inserts).toEqual([]);
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
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("never throws when the log write fails", async () => {
    state.insertError = { message: "unique violation" };

    await expect(notifyOnce(ARGS)).resolves.toEqual({
      sent: true,
      deduped: false,
    });
  });
});
