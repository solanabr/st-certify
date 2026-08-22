import { describe, expect, it } from "vitest";
import type { CertSignState } from "@/hooks/useMassSign";
import {
  nextSignStep,
  summarizeBatch,
  type BatchGroupInput,
} from "../ceremony";

const GROUPS: BatchGroupInput[] = [
  {
    editionAddress: "Ed1t10nA1111111111111111111111111111111111",
    editionName: "Turma 2026",
    certificateAddresses: ["certA1", "certA2", "certA3"],
  },
  {
    editionAddress: "Ed1t10nB2222222222222222222222222222222222",
    editionName: "Bootcamp Solana",
    certificateAddresses: ["certB1"],
  },
];

const state = (
  entries: Record<string, CertSignState>,
): Record<string, CertSignState> => entries;

describe("nextSignStep", () => {
  it("puts the disclosure before the first wallet prompt of a session", () => {
    expect(nextSignStep(false)).toBe("consent");
  });

  it("goes straight to the confirmation once it has been acknowledged", () => {
    expect(nextSignStep(true)).toBe("confirm");
  });
});

describe("summarizeBatch", () => {
  it("counts a clean run per edition and in total", () => {
    const summary = summarizeBatch(
      GROUPS,
      state({
        certA1: "confirmed",
        certA2: "confirmed",
        certA3: "confirmed",
        certB1: "confirmed",
      }),
    );

    expect(summary.signed).toBe(4);
    expect(summary.failed).toBe(0);
    expect(summary.editions).toEqual([
      {
        editionAddress: GROUPS[0].editionAddress,
        editionName: "Turma 2026",
        signed: 3,
        failed: 0,
      },
      {
        editionAddress: GROUPS[1].editionAddress,
        editionName: "Bootcamp Solana",
        signed: 1,
        failed: 0,
      },
    ]);
  });

  it("splits a partial run so the failures stay visible", () => {
    const summary = summarizeBatch(
      GROUPS,
      state({
        certA1: "confirmed",
        certA2: "failed",
        certA3: "confirmed",
        certB1: "failed",
      }),
    );

    expect(summary).toMatchObject({ signed: 2, failed: 2 });
    expect(summary.editions[0]).toMatchObject({ signed: 2, failed: 1 });
    expect(summary.editions[1]).toMatchObject({ signed: 0, failed: 1 });
  });

  /**
   * The counting rule that keeps the completion state honest: anything the run
   * left mid-flight is still waiting on the signer, so it is a failure, not an
   * unknown to be quietly dropped from both columns.
   */
  it("treats a cert the run never resolved as failed, not as missing", () => {
    const summary = summarizeBatch(
      GROUPS,
      state({ certA1: "confirmed", certA2: "signing", certA3: "idle" }),
    );

    expect(summary.signed).toBe(1);
    expect(summary.failed).toBe(3);
    expect(summary.signed + summary.failed).toBe(4);
  });

  it("reports nothing signed when the run produced no states at all", () => {
    const summary = summarizeBatch(GROUPS, {});

    expect(summary).toMatchObject({ signed: 0, failed: 4 });
  });

  it("has nothing to report for an empty batch", () => {
    expect(summarizeBatch([], {})).toEqual({
      signed: 0,
      failed: 0,
      editions: [],
    });
  });
});
