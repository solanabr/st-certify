# Golden vectors

Real account-data dumps that prove the decoders match the bytes the **program**
actually writes (not just self-roundtrip — the classic native-client failure is a
codec that is self-consistent but wrong).

**Location (agreed convention):** the vectors live at `<repo>/tests/golden/`,
produced and owned by the M1a LiteSVM/Mollusk matrix (task #12). This client's
`tests/golden.test.ts` reads them **read-only** and auto-unskips when they appear.
This directory holds only the schema doc.

## Files

- `<repo>/tests/golden/<name>.hex` — hex-encoded raw account bytes (whitespace ignored).
- `<repo>/tests/golden/manifest.json` — maps each `<name>` to its account type and
  expected decoded fields.

Agreed names: `config.default`, `edition.3signers`, `certificate.requested`,
`certificate.fullysigned`, `certificate.claimed`, `hashindex`.

## `manifest.json` schema

Keyed by the `.hex` basename. `account` is the decoder type
(`config` | `edition` | `certificate` | `hashIndex`, case-insensitive). `expected`
is a subset of the **public** decoder's output — `u64`/`i64` as strings, addresses
base58, status as its name string, masks as numbers. (`expected` may be omitted and
its fields placed flat next to `account`.)

    {
      "config.default":          { "account": "config",      "expected": { "adminCount": 3, "notary": "<base58>", "editionsCreated": "0" } },
      "edition.3signers":        { "account": "edition",     "expected": { "status": "Open", "signerCount": 3, "id": "0", "name": "<utf8>" } },
      "certificate.requested":   { "account": "certificate", "expected": { "status": "Requested", "signedMask": 0 } },
      "certificate.fullysigned": { "account": "certificate", "expected": { "status": "FullySigned", "signedMask": 7 } },
      "certificate.claimed":     { "account": "certificate", "expected": { "status": "Claimed", "certNumber": "1" } },
      "hashindex":               { "account": "hashIndex",   "expected": { "certificate": "<base58>" } }
    }

Byte fields (`nameCommitment`, `artifactHash`, `specHash`) are best asserted in a
dedicated test rather than the manifest. Adding a `pda` field (the derived address)
per entry lets us also cross-check the `find*Pda` helpers against on-chain addresses.
