/**
 * Fixture-byte tests (skill rule 3): buffers laid out BY HAND at the spec offsets
 * (§2), independent of the codec definitions, decoded through the PUBLIC decoders.
 * This is the layer that catches a codec whose encode/decode share an offset bug
 * (self-consistent but wrong). Real LiteSVM dumps slot in via `golden.test.ts`.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAddressDecoder, getAddressEncoder } from "@solana/kit";

import {
  decodeCertificate,
  decodeConfig,
  decodeEdition,
} from "../src/accounts";
import { CodecError } from "../src/errors";
import { ACCOUNT_SIZES, AccountDisc, OFFSETS } from "../src/program";

const addrEncoder = getAddressEncoder();
const addrDecoder = getAddressDecoder();
const addr = (fill: number) =>
  addrDecoder.decode(new Uint8Array(32).fill(fill));

function putU64(buf: Uint8Array, off: number, v: bigint): void {
  for (let i = 0; i < 8; i++)
    buf[off + i] = Number((v >> BigInt(8 * i)) & 0xffn);
}
function putAddr(
  buf: Uint8Array,
  off: number,
  a: ReturnType<typeof addr>,
): void {
  buf.set(addrEncoder.encode(a), off);
}
function putUtf8(buf: Uint8Array, off: number, s: string): void {
  buf.set(new TextEncoder().encode(s), off);
}

describe("Certificate fixture (hand-laid at §2 offsets)", () => {
  const o = OFFSETS.certificate;

  // Synthetic distinct nonzero values covering bytes [172,228) — the
  // sig_timestamps[1..5] + claimed_at region an offset/order bug could otherwise
  // hide in (a zero-filled region passes both a self-roundtrip and a zeroed fixture).
  const SIG_TS = [
    1_700_000_000n,
    1_700_000_001n,
    1_700_000_002n,
    -5n,
    1_700_000_004n,
    1_700_000_005n,
  ];
  const CLAIMED_AT = -987_654_321n;

  function build(status: number, mask: number, withAsset: boolean): Uint8Array {
    const buf = new Uint8Array(ACCOUNT_SIZES.certificate);
    buf[o.disc] = AccountDisc.Certificate;
    buf[o.bump] = 254;
    buf[o.status] = status;
    buf[o.signedMask] = mask;
    putAddr(buf, o.edition, addr(20));
    putAddr(buf, o.student, addr(21));
    buf.fill(0xab, o.nameCommitment, o.nameCommitment + 32);
    buf.fill(0xcd, o.artifactHash, o.artifactHash + 32);
    if (withAsset) putAddr(buf, o.asset, addr(22)); // else left zero (unset)
    putU64(buf, o.certNumber, 7n);
    for (let i = 0; i < 6; i++) putU64(buf, o.sigTimestamps + i * 8, SIG_TS[i]);
    putU64(buf, o.claimedAt, CLAIMED_AT);
    return buf;
  }

  it("decodes a partially-signed Requested cert with unset asset", () => {
    const cert = decodeCertificate(build(1, 0b0000_0001, false));
    assert.equal(cert.status, "Requested");
    assert.equal(cert.isPartiallySigned, true);
    assert.equal(cert.signedMask, 1);
    assert.equal(cert.edition, addr(20));
    assert.equal(cert.student, addr(21));
    assert.deepEqual(cert.nameCommitment, new Uint8Array(32).fill(0xab));
    assert.deepEqual(cert.artifactHash, new Uint8Array(32).fill(0xcd));
    assert.equal(cert.asset, null);
    assert.equal(cert.certNumber, 7n);
    assert.deepEqual(cert.sigTimestamps, SIG_TS);
    assert.equal(cert.claimedAt, CLAIMED_AT);
  });

  it("FullySigned cert is not partially-signed and exposes asset", () => {
    const cert = decodeCertificate(build(2, 0b0011_1111, true));
    assert.equal(cert.status, "FullySigned");
    assert.equal(cert.isPartiallySigned, false);
    assert.equal(cert.asset, addr(22));
  });

  it("rejects wrong size", () => {
    assert.throws(
      () => decodeCertificate(new Uint8Array(100)),
      (e) => e instanceof CodecError && e.kind === "WrongSize",
    );
  });

  it("rejects wrong discriminator", () => {
    const buf = build(1, 0, false);
    buf[0] = AccountDisc.Edition;
    assert.throws(
      () => decodeCertificate(buf),
      (e) => e instanceof CodecError && e.kind === "WrongDiscriminator",
    );
  });

  it("rejects an out-of-range status byte", () => {
    const buf = build(9, 0, false);
    assert.throws(
      () => decodeCertificate(buf),
      (e) => e instanceof CodecError && e.kind === "InvalidStatus",
    );
  });
});

describe("Config fixture", () => {
  const o = OFFSETS.config;
  it("decodes and slices admins to adminCount", () => {
    const buf = new Uint8Array(ACCOUNT_SIZES.config);
    buf[o.disc] = AccountDisc.Config;
    buf[o.bump] = 250;
    buf[o.adminCount] = 3;
    putAddr(buf, o.notary, addr(1));
    putAddr(buf, o.admins + 0 * 32, addr(2));
    putAddr(buf, o.admins + 1 * 32, addr(3));
    putAddr(buf, o.admins + 2 * 32, addr(4));
    // slots 3..8 left zero
    putU64(buf, o.editionsCreated, 42n);

    const cfg = decodeConfig(buf);
    assert.equal(cfg.bump, 250);
    assert.equal(cfg.adminCount, 3);
    assert.equal(cfg.notary, addr(1));
    assert.deepEqual(cfg.admins, [addr(2), addr(3), addr(4)]);
    assert.equal(cfg.editionsCreated, 42n);
  });
});

describe("Edition fixture", () => {
  const o = OFFSETS.edition;
  it("decodes name/status/signers with zero-trimmed strings", () => {
    const buf = new Uint8Array(ACCOUNT_SIZES.edition);
    buf[o.disc] = AccountDisc.Edition;
    buf[o.bump] = 249;
    buf[o.status] = 2; // Open
    buf[o.signerCount] = 2;
    putU64(buf, o.id, 5n);
    putUtf8(buf, o.name, "Curso de Rust");
    buf.fill(0xee, o.specHash, o.specHash + 32);
    // signer 0
    putAddr(buf, o.signers + 0, addr(11));
    putUtf8(buf, o.signers + 0 + 32, "Alice");
    putUtf8(buf, o.signers + 0 + 64, "Instrutora");
    // signer 1
    putAddr(buf, o.signers + 88, addr(12));
    putUtf8(buf, o.signers + 88 + 32, "Bob");
    putUtf8(buf, o.signers + 88 + 64, "Diretor");
    putU64(buf, o.maxSupply, 100n);
    putU64(buf, o.certsRequested, 10n);
    putU64(buf, o.certsClosed, 2n);
    putU64(buf, o.certsClaimed, 3n);
    putU64(buf, o.createdAt, 1_700_000_123n);

    const ed = decodeEdition(buf);
    assert.equal(ed.status, "Open");
    assert.equal(ed.signerCount, 2);
    assert.equal(ed.id, 5n);
    assert.equal(ed.name, "Curso de Rust");
    assert.equal(ed.signers.length, 2);
    assert.deepEqual(
      ed.signers.map((s) => [s.name, s.role]),
      [
        ["Alice", "Instrutora"],
        ["Bob", "Diretor"],
      ],
    );
    assert.equal(ed.signers[0].pubkey, addr(11));
    assert.equal(ed.maxSupply, 100n);
    assert.equal(ed.certsRequested, 10n);
    assert.equal(ed.createdAt, 1_700_000_123n);
  });
});
