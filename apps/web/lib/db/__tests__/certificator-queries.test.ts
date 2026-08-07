import { describe, expect, it } from "vitest";
import { assemblePendingGroups } from "../certificator-queries";
import type { CertificateRow, EditionSignerRow } from "../types";

function cert(
  partial: Pick<
    CertificateRow,
    "address" | "edition_address" | "signer_bitmap"
  >,
): CertificateRow {
  return {
    owner_wallet: "student-wallet",
    owner_did: null,
    student_name: `Aluno ${partial.address}`,
    name_salt: null,
    status: "Requested",
    sha256: null,
    image_url: null,
    metadata_url: null,
    asset: null,
    cert_number: null,
    signer_txs: [],
    request_tx: null,
    claim_tx: null,
    revoke_tx: null,
    revoke_reason: null,
    reject_reason: null,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function signer(
  edition: string,
  position: number,
  wallet: string,
): EditionSignerRow {
  return {
    edition_address: edition,
    position,
    wallet,
    name: `Signer ${position}`,
    role: null,
    signature_image_url: null,
  };
}

const callerPosition = new Map([
  ["edA", 0],
  ["edB", 1],
]);
const signersByEdition = new Map<string, EditionSignerRow[]>([
  ["edA", [signer("edA", 0, "me"), signer("edA", 1, "other")]],
  [
    "edB",
    [
      signer("edB", 0, "other"),
      signer("edB", 1, "me"),
      signer("edB", 2, "third"),
    ],
  ],
]);
const editionName = new Map([
  ["edA", "Edição A"],
  ["edB", "Edição B"],
]);

describe("assemblePendingGroups", () => {
  it("includes bit-unset certs, excludes already-signed (retry-safety), counts signatures", () => {
    const certRows = [
      cert({ address: "a1", edition_address: "edA", signer_bitmap: 0 }), // caller bit0 unset -> include
      cert({ address: "a2", edition_address: "edA", signer_bitmap: 0b01 }), // caller bit0 SET -> exclude
      cert({ address: "a3", edition_address: "edA", signer_bitmap: 0b10 }), // bit1 (other) set -> include, signed 1
    ];
    const groups = assemblePendingGroups({
      callerPosition,
      signersByEdition,
      editionName,
      certRows,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].editionName).toBe("Edição A");
    expect(groups[0].signerCount).toBe(2);
    expect(groups[0].certificates.map((c) => c.address)).toEqual(["a1", "a3"]);
    expect(
      groups[0].certificates.find((c) => c.address === "a3")?.signedCount,
    ).toBe(1);
    expect(
      groups[0].certificates.find((c) => c.address === "a1")?.signedCount,
    ).toBe(0);
  });

  it("drops editions with nothing left pending for the caller", () => {
    const certRows = [
      cert({ address: "a2", edition_address: "edA", signer_bitmap: 0b01 }),
    ];
    expect(
      assemblePendingGroups({
        callerPosition,
        signersByEdition,
        editionName,
        certRows,
      }),
    ).toHaveLength(0);
  });

  it("uses the caller's per-edition position (edB bit 1)", () => {
    const certRows = [
      cert({ address: "b1", edition_address: "edB", signer_bitmap: 0b001 }), // bit0 set, caller bit1 unset -> include
      cert({ address: "b2", edition_address: "edB", signer_bitmap: 0b010 }), // caller bit1 SET -> exclude
    ];
    const groups = assemblePendingGroups({
      callerPosition,
      signersByEdition,
      editionName,
      certRows,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].certificates.map((c) => c.address)).toEqual(["b1"]);
    expect(groups[0].certificates[0].signedCount).toBe(1);
    expect(groups[0].signerCount).toBe(3);
    expect(groups[0].callerPosition).toBe(1);
  });

  it("ignores certs whose edition the caller does not sign", () => {
    const certRows = [
      cert({ address: "x", edition_address: "edUnknown", signer_bitmap: 0 }),
    ];
    expect(
      assemblePendingGroups({
        callerPosition,
        signersByEdition,
        editionName,
        certRows,
      }),
    ).toHaveLength(0);
  });
});
