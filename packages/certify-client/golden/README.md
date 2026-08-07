# Golden vectors

Real account-data dumps from the LiteSVM / on-chain test matrix. `tests/golden.test.ts`
uses these to prove the decoders match the bytes the **program** actually writes —
not just self-roundtrip (the classic native-client failure is a codec that is
self-consistent but wrong). The suite auto-discovers `*.json` here and unskips.

## File format

One JSON file per account state:

    {
      "account": "certificate",        // config | edition | certificate | hashIndex
      "dataHex": "03fe01...",          // full account data as hex (or "dataBase64")
      "expected": {                    // subset of decoded fields to assert
        "status": "FullySigned",
        "certNumber": "1",             // u64/i64 as a STRING (JSON has no bigint)
        "student": "5Wx1mNKSgtu1pnwHgLe5duYK9xcFhEhsd1zoeJi9EiUZ"
      }
    }

- `dataHex` and `dataBase64` are interchangeable.
- `expected` is matched against the **public** decoder output (`decodeCertificate`,
  `decodeEdition`, `decodeConfig`, `decodeHashIndex`). Give bigints as strings and
  addresses as base58. Omit raw byte fields (assert those in a dedicated test if needed).

## Producing these (owner: m1a-program / M1a test matrix)

In the LiteSVM matrix, after driving an account to a known state, dump
`account.data` (base64 or hex) and the fields worth asserting. Good candidates that
cross-check the program's writes against this client:

- `certificate-claimed.json` — a claimed cert (asserts `status`, `certNumber`, `student`, `edition`).
- `edition-open.json` — an open edition (asserts `status`, `id`, `name`, `signerCount`).
- `config.json` — the config singleton (asserts `adminCount`, `notary`).
- `hashindex.json` — a hash index (asserts `certificate`).

Byte parity here + PDA parity (dump the derived addresses and compare to the
`find*Pda` helpers) is the M1 client gate.
