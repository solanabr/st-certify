/**
 * PDA-helper tests: determinism, seed sensitivity, and input validation. Parity
 * against real on-chain addresses is covered by `golden.test.ts` once m1a-program
 * lands LiteSVM PDA dumps.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAddressDecoder } from "@solana/kit";

import {
  findCertPda,
  findConfigPda,
  findEditionPda,
  findHashIndexPda,
} from "../src/pdas";
import { PROGRAM_ID } from "../src/program";

const addr = (fill: number) =>
  getAddressDecoder().decode(new Uint8Array(32).fill(fill));

describe("PDA helpers", () => {
  it("findConfigPda: deterministic, valid bump, not the program id", async () => {
    const [a, bump] = await findConfigPda();
    const [a2] = await findConfigPda();
    assert.equal(a, a2);
    assert.ok(bump >= 0 && bump <= 255);
    assert.notEqual(a, PROGRAM_ID);
  });

  it("findEditionPda: differs by id", async () => {
    const [e0] = await findEditionPda(0n);
    const [e1] = await findEditionPda(1n);
    const [e0b] = await findEditionPda(0n);
    assert.equal(e0, e0b);
    assert.notEqual(e0, e1);
  });

  it("findCertPda: deterministic and order-sensitive", async () => {
    const [c] = await findCertPda(addr(1), addr(2));
    const [c2] = await findCertPda(addr(1), addr(2));
    const [swapped] = await findCertPda(addr(2), addr(1));
    assert.equal(c, c2);
    assert.notEqual(c, swapped);
  });

  it("findHashIndexPda: works for 32 bytes, rejects other lengths", async () => {
    const [h] = await findHashIndexPda(new Uint8Array(32).fill(9));
    assert.ok(h);
    assert.throws(() => findHashIndexPda(new Uint8Array(16)), RangeError);
  });
});
