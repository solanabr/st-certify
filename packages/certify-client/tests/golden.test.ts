/**
 * Golden-vector tests (skill rule 3, the real-bytes layer). Decodes account
 * buffers dumped from a live LiteSVM/on-chain run and asserts the decoded fields.
 * These auto-activate the moment m1a-program drops dump files into `golden/`;
 * until then the suite skips (see golden/README.md for the file format).
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
const goldenDir = join(here, "..", "golden");

const decoders: Record<string, (b: Uint8Array) => Record<string, unknown>> = {
  config: decodeConfig,
  edition: decodeEdition,
  certificate: decodeCertificate,
  hashIndex: decodeHashIndex,
};

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "").replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function loadBytes(g: { dataHex?: string; dataBase64?: string }): Uint8Array {
  if (g.dataHex) return hexToBytes(g.dataHex);
  if (g.dataBase64) return new Uint8Array(Buffer.from(g.dataBase64, "base64"));
  throw new Error("golden entry needs dataHex or dataBase64");
}

const files =
  existsSync(goldenDir) &&
  readdirSync(goldenDir).some((f) => f.endsWith(".json"))
    ? readdirSync(goldenDir).filter((f) => f.endsWith(".json"))
    : [];

describe("golden vectors (real LiteSVM/onchain dumps)", () => {
  it(
    "at least one golden file is present",
    {
      skip:
        files.length === 0
          ? "no golden/*.json yet — drop LiteSVM dumps to activate"
          : false,
    },
    () => {
      assert.ok(files.length > 0);
    },
  );

  for (const file of files) {
    it(`decodes ${file}`, () => {
      const g = JSON.parse(readFileSync(join(goldenDir, file), "utf8"));
      const decode = decoders[g.account];
      assert.ok(decode, `unknown account type "${g.account}"`);
      const decoded = decode(loadBytes(g));
      for (const [k, v] of Object.entries(g.expected ?? {})) {
        const actual = decoded[k];
        const expected =
          typeof actual === "bigint" ? BigInt(v as string | number) : v;
        assert.deepEqual(actual, expected, `field "${k}"`);
      }
    });
  }
});
