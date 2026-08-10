/**
 * Codec roundtrip tests (skill rule 2): decode(encode(x)) === x for every
 * account codec, with edge values (0, u64::MAX, negative i64, all-0xFF hashes),
 * plus fixed-size assertions tying each codec to the spec sizes (rule 1) and
 * instruction-data length/discriminator/offset checks against the spec (§3).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAddressDecoder, type ReadonlyUint8Array } from "@solana/kit";

import { ACCOUNT_SIZES, IX_DATA_LEN, IxDisc } from "../src/program";
import {
  certificateCodec,
  configCodec,
  editionCodec,
  encodeAddAdminData,
  encodeClaimCertificateData,
  encodeCreateEditionData,
  encodeInitConfigData,
  encodeRecordAssetData,
  encodeRejectRequestData,
  encodeRemoveAdminData,
  encodeRequestCertificateData,
  encodeRevokeCertificateData,
  encodeSetEditionStatusData,
  encodeSetMaxSupplyData,
  encodeSetNotaryData,
  encodeSignCertificateData,
  encodeUtf8Fixed,
  hashIndexCodec,
  signerSlotCodec,
  trimZeroUtf8,
} from "../src/internal/codecs";

const addrDecoder = getAddressDecoder();
const addr = (fill: number) =>
  addrDecoder.decode(new Uint8Array(32).fill(fill));
const bytes = (fill: number, n = 32) => new Uint8Array(n).fill(fill);

const U64_MAX = 2n ** 64n - 1n;
const I64_MIN = -(2n ** 63n);

describe("account codec fixed sizes match the spec", () => {
  it("config = 299", () =>
    assert.equal(configCodec.fixedSize, ACCOUNT_SIZES.config));
  it("edition = 676", () =>
    assert.equal(editionCodec.fixedSize, ACCOUNT_SIZES.edition));
  it("certificate = 228", () =>
    assert.equal(certificateCodec.fixedSize, ACCOUNT_SIZES.certificate));
  it("hashIndex = 34", () =>
    assert.equal(hashIndexCodec.fixedSize, ACCOUNT_SIZES.hashIndex));
  it("signer slot = 88", () => assert.equal(signerSlotCodec.fixedSize, 88));
});

describe("account codec roundtrips (edge values)", () => {
  it("Config", () => {
    const value = {
      disc: 1,
      bump: 255,
      adminCount: 8,
      notary: addr(1),
      admins: [
        addr(2),
        addr(3),
        addr(4),
        addr(5),
        addr(6),
        addr(7),
        addr(8),
        addr(9),
      ],
      editionsCreated: U64_MAX,
    };
    const enc = configCodec.encode(value);
    assert.equal(enc.length, ACCOUNT_SIZES.config);
    assert.deepEqual(configCodec.decode(enc), value);
  });

  it("Edition", () => {
    const signer = (i: number) => ({
      pubkey: addr(10 + i),
      name: bytes(0x41, 32),
      role: bytes(0x42, 24),
    });
    const value = {
      disc: 2,
      bump: 254,
      status: 2,
      signerCount: 6,
      id: U64_MAX,
      name: bytes(0x4e, 64),
      specHash: bytes(0xff, 32),
      signers: [
        signer(0),
        signer(1),
        signer(2),
        signer(3),
        signer(4),
        signer(5),
      ],
      maxSupply: 0n,
      certsRequested: 100n,
      certsClosed: 5n,
      certsClaimed: 3n,
      createdAt: I64_MIN,
    };
    const enc = editionCodec.encode(value);
    assert.equal(enc.length, ACCOUNT_SIZES.edition);
    assert.deepEqual(editionCodec.decode(enc), value);
  });

  it("Certificate", () => {
    const value = {
      disc: 3,
      bump: 253,
      status: 2,
      signedMask: 0b0011_1111,
      edition: addr(20),
      student: addr(21),
      nameCommitment: bytes(0xab, 32),
      artifactHash: bytes(0xcd, 32),
      asset: addr(22),
      certNumber: U64_MAX,
      sigTimestamps: [0n, 1n, -1n, I64_MIN, 2n ** 62n, 1_700_000_000n],
      claimedAt: -42n,
    };
    const enc = certificateCodec.encode(value);
    assert.equal(enc.length, ACCOUNT_SIZES.certificate);
    assert.deepEqual(certificateCodec.decode(enc), value);
  });

  it("HashIndex", () => {
    const value = { disc: 4, bump: 252, certificate: addr(30) };
    const enc = hashIndexCodec.encode(value);
    assert.equal(enc.length, ACCOUNT_SIZES.hashIndex);
    assert.deepEqual(hashIndexCodec.decode(enc), value);
  });
});

describe("instruction-data encoders: exact length + leading discriminator", () => {
  const cases: Array<[string, ReadonlyUint8Array, number, number]> = [
    [
      "initConfig",
      encodeInitConfigData(addr(1), [addr(2), addr(3)]),
      IX_DATA_LEN.initConfig,
      IxDisc.InitConfig,
    ],
    [
      "addAdmin",
      encodeAddAdminData(addr(1)),
      IX_DATA_LEN.addAdmin,
      IxDisc.AddAdmin,
    ],
    [
      "removeAdmin",
      encodeRemoveAdminData(addr(1)),
      IX_DATA_LEN.removeAdmin,
      IxDisc.RemoveAdmin,
    ],
    [
      "setNotary",
      encodeSetNotaryData(addr(1)),
      IX_DATA_LEN.setNotary,
      IxDisc.SetNotary,
    ],
    [
      "createEdition",
      encodeCreateEditionData({
        name: "Curso de Solana",
        specHash: bytes(0xaa, 32),
        maxSupply: 100n,
        signers: [
          { pubkey: addr(1), name: "Alice", role: "Instrutora" },
          { pubkey: addr(2), name: "Bob", role: "Diretor" },
        ],
      }),
      IX_DATA_LEN.createEdition,
      IxDisc.CreateEdition,
    ],
    [
      "setEditionStatus",
      encodeSetEditionStatusData(2),
      IX_DATA_LEN.setEditionStatus,
      IxDisc.SetEditionStatus,
    ],
    [
      "setMaxSupply",
      encodeSetMaxSupplyData(100n),
      IX_DATA_LEN.setMaxSupply,
      IxDisc.SetMaxSupply,
    ],
    [
      "requestCertificate",
      encodeRequestCertificateData(bytes(0x11, 32)),
      IX_DATA_LEN.requestCertificate,
      IxDisc.RequestCertificate,
    ],
    [
      "signCertificate",
      encodeSignCertificateData(),
      IX_DATA_LEN.signCertificate,
      IxDisc.SignCertificate,
    ],
    [
      "rejectRequest",
      encodeRejectRequestData(),
      IX_DATA_LEN.rejectRequest,
      IxDisc.RejectRequest,
    ],
    [
      "claimCertificate",
      encodeClaimCertificateData(bytes(0x22, 32)),
      IX_DATA_LEN.claimCertificate,
      IxDisc.ClaimCertificate,
    ],
    [
      "recordAsset",
      encodeRecordAssetData(addr(1)),
      IX_DATA_LEN.recordAsset,
      IxDisc.RecordAsset,
    ],
    [
      "revokeCertificate",
      encodeRevokeCertificateData(),
      IX_DATA_LEN.revokeCertificate,
      IxDisc.RevokeCertificate,
    ],
  ];

  for (const [name, data, len, disc] of cases) {
    it(`${name}: ${len} bytes, disc ${disc}`, () => {
      assert.equal(data.length, len);
      assert.equal(data[0], disc);
    });
  }

  it("initConfig writes adminCount@33 and zero-pads freed slots", () => {
    const data = encodeInitConfigData(addr(1), [addr(2), addr(3)]);
    assert.equal(data[33], 2); // adminCount
    assert.equal(data[34], 2); // admins[0] = addr(2) (first byte)
    assert.equal(data[66], 3); // admins[1] = addr(3)
    assert.equal(data[98], 0); // admins[2] = zero
  });

  it("createEdition writes signerCount@105", () => {
    const data = encodeCreateEditionData({
      name: "X",
      specHash: bytes(0xaa, 32),
      maxSupply: 0n,
      signers: [
        { pubkey: addr(1), name: "A", role: "R" },
        { pubkey: addr(2), name: "B", role: "S" },
        { pubkey: addr(3), name: "C", role: "T" },
      ],
    });
    assert.equal(data[105], 3);
  });
});

describe("encodeUtf8Fixed: multibyte boundary backoff (pt-BR names)", () => {
  it("drops a multibyte char split by the byte cap — no partial UTF-8", () => {
    // 31 ASCII + 'ç' (2 bytes) = 33 bytes; cap 32 splits 'ç', so it is dropped whole.
    const out = encodeUtf8Fixed("a".repeat(31) + "ç", 32);
    assert.equal(out.length, 32);
    assert.equal(trimZeroUtf8(out), "a".repeat(31));
    assert.ok(!trimZeroUtf8(out).includes("�")); // no replacement char
  });

  it("keeps a multibyte char that fits exactly at the cap", () => {
    // 30 ASCII + 'ç' (2 bytes) = 32 bytes exactly.
    const out = encodeUtf8Fixed("a".repeat(30) + "ç", 32);
    assert.equal(trimZeroUtf8(out), "a".repeat(30) + "ç");
  });

  it("round-trips a realistic accented name under the cap", () => {
    const name = "Conceição Assunção";
    assert.equal(trimZeroUtf8(encodeUtf8Fixed(name, 32)), name);
  });
});
