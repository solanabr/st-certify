/**
 * Golden-vector tests (skill rule 3, the real-bytes layer). Decodes account
 * buffers dumped from the program's LiteSVM matrix and asserts the decoded
 * fields — the layer that catches a self-consistent-but-wrong codec.
 *
 * Convention (agreed with the program agent, owned by the M1a #12 matrix):
 * vectors live at `<repo>/tests/golden/` as `<name>.hex` (hex-encoded raw account
 * bytes) plus `manifest.json`. This test reads them READ-ONLY and auto-unskips
 * when they appear. See ../golden/README.md for the manifest schema.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  decodeCertificate,
  decodeConfig,
  decodeEdition,
  decodeHashIndex,
} from "../src/accounts";

const here = dirname(fileURLToPath(import.meta.url));
// packages/certify-client/tests -> <repo>/tests/golden (read-only)
const goldenDir = join(here, "..", "..", "..", "tests", "golden");
const manifestPath = join(goldenDir, "manifest.json");

const decoders: Record<string, (b: Uint8Array) => Record<string, unknown>> = {
  config: decodeConfig,
  edition: decodeEdition,
  certificate: decodeCertificate,
  hashindex: decodeHashIndex,
};

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "").replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

type ManifestEntry = {
  account: string;
  expected?: Record<string, unknown>;
} & Record<string, unknown>;

const hasVectors = existsSync(manifestPath);
const manifest: Record<string, ManifestEntry> = hasVectors
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : {};
const names = Object.keys(manifest);

describe("golden vectors (real LiteSVM/onchain dumps)", () => {
  it(
    "manifest is present",
    {
      skip: hasVectors
        ? false
        : "no tests/golden/manifest.json yet — activates when the program matrix lands vectors",
    },
    () => {
      assert.ok(names.length > 0, "manifest.json has no entries");
    },
  );

  for (const name of names) {
    it(`decodes ${name}`, () => {
      const entry = manifest[name];
      const decode = decoders[String(entry.account).toLowerCase()];
      assert.ok(decode, `unknown account type "${entry.account}" for ${name}`);

      const hexPath = join(goldenDir, `${name}.hex`);
      assert.ok(existsSync(hexPath), `missing ${name}.hex`);
      const decoded = decode(hexToBytes(readFileSync(hexPath, "utf8")));

      const expected =
        entry.expected ??
        Object.fromEntries(
          Object.entries(entry).filter(([k]) => k !== "account"),
        );
      for (const [field, want] of Object.entries(expected)) {
        const actual = decoded[field];
        const wanted =
          typeof actual === "bigint" ? BigInt(want as string | number) : want;
        assert.deepEqual(actual, wanted, `${name}.${field}`);
      }
    });
  }
});
