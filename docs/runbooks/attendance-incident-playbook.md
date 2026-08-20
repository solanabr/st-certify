# Attendance NFT incident playbook

For Superteam BR staff running an event, possibly from a phone. Each
section: **Symptom -> Run -> Read the output -> Fix**. All commands run from
the repo root: `npx tsx scripts/admin/<script>.ts`. Full flag docs:
`--help` on any script, or `scripts/README.md`.

**Every mutating script defaults to dry-run — nothing writes until you add
`--execute`.** Run without it first, read the output, then re-run with
`--execute` if it looks right.

## Quick reference

| Symptom | Script |
|---|---|
| Mints failing, "insufficient funds" | `operator-balance.ts` |
| App / claim page erroring, `ENOTFOUND` | Supabase paused — see below |
| RPC timeouts / 429s | swap RPC — see below |
| Same NFT (or tx) appears twice | `integrity-report.ts` |
| Claim link posted somewhere public | `event-control.ts invalidate` |
| "Sold out" before expected | `tree-capacity.ts` |
| minted_count looks too high, event under supply | `reserve-sweep.ts` |
| — (routine hygiene) | `nonce-sweep.ts` |
| Operator key compromised / rotating on schedule | see "OPERATOR_SECRET_KEY rotation" below |

Before doors open, just run:

```bash
npx tsx scripts/admin/preflight.ts
```

It runs the RPC, Supabase, operator-balance, and tree-capacity checks
together and prints one ALL CLEAR / NOT CLEAR line.

---

## Operator wallet low or empty

**Symptom:** Participants report claims failing; server logs show a
transaction error mentioning insufficient funds. OPERATOR pays ~95,000
lamports (~0.000095 SOL) per mint, out of its own balance — nobody else
pays.

**Run:**
```bash
npx tsx scripts/admin/operator-balance.ts
```

**Read the output:** A table of operator (and deployer/notary, if
configured) balances, plus "operator can afford ~N more mints." Exit code 1
means it's below the floor (default: 50 mints' worth).

**Fix:** Top up the OPERATOR wallet. Its public key is printed by the
command above. The private key lives at `.keys/operator.json` (or wherever
`OPERATOR_SECRET_KEY` points — see `.env`) — never needed for a top-up,
only the public key is.
- Devnet: `solana airdrop 1 <operator-pubkey> --url devnet`
- Mainnet: transfer SOL from a funded wallet to the operator pubkey.

Re-run `operator-balance.ts` to confirm it's back above the floor.

---

## Supabase paused / outage

**Symptom:** The app fails to load events/claims; any admin script reports
something like `ENOTFOUND` or "Supabase unreachable... the project may be
paused." Supabase's free tier auto-pauses a project after a period of
inactivity — its hostname stops resolving entirely until restored.

**Run:** Any read-only admin script surfaces this immediately, e.g.:
```bash
npx tsx scripts/admin/preflight.ts
```

**Read the output:** The `supabase` check (or any script touching the DB)
will FAIL with an "unreachable... may be paused" message rather than
hanging or crashing.

**Fix:**
1. Open the Supabase dashboard for this project -> if it shows "Paused,"
   click **Restore project**.
2. Wait ~1-2 minutes for it to come back online.
3. Re-run `preflight.ts` (or the script you started with) to confirm.

**Degrade behavior while paused:** the public claim page and creator
dashboard will show generic failures (not a crash) — no writes are lost,
nothing is corrupted, it just can't reach the DB. Once restored, everything
resumes exactly where it left off.

---

## RPC outage / rate-limit

**Symptom:** Mints or reads timing out, or `429 Too Many Requests` from the
Solana RPC endpoint.

**Run:**
```bash
npx tsx scripts/admin/preflight.ts
```
The `rpc` check reports reachability + current slot.

**Fix — failover:**
1. If you have a `HELIUS_API_KEY`, the app already prefers it over the
   public RPC (see `apps/web/lib/chain/rpc.ts`). Confirm it's set in
   Vercel's project env.
2. Otherwise, swap `NEXT_PUBLIC_RPC_URL` to a different provider (Helius,
   QuickNode, Triton) in Vercel's project env.
3. **Redeploy** — `NEXT_PUBLIC_*` vars are baked in at build time, so an
   env-var change alone won't take effect until the app rebuilds.
4. Re-run `preflight.ts` against the new endpoint.

---

## Double-mint discovered

**Symptom:** A participant reports getting (or you notice) more than one
NFT for the same event, or two claim rows referencing what looks like the
same mint.

**Run:**
```bash
npx tsx scripts/admin/integrity-report.ts --event <eventId>
```
(Omit `--event` to scan every event.)

**Read the output:** Look for `duplicate_tx_sig` or `duplicate_asset_id`
anomalies — the actual double-mint signal — and `minted_count_desync`,
which tells you whether the event's counter still matches reality. This is
read-only; it only reports, it does not fix anything.

**Fix:** Solana mints are irreversible — there is no "un-mint" script.
1. Identify which claim row(s) the duplicate maps to from the report's
   `detail` column (claim ids, wallet, tx_sig/asset_id).
2. Decide the canonical claim (usually the earliest `tx_sig`) and correct
   the others by hand in the Supabase SQL editor — e.g. null out a
   stray `tx_sig`/`asset_id` on a bookkeeping duplicate, or leave both if
   two *legitimately different* mints just happen to share metadata.
3. If `minted_count` is desynced afterward, correct it to match
   `count(status in ('pending','minted'))` for that event (the documented
   invariant — see `supabase/migrations/0002_attendance.sql`).
4. If this is reproducible (not a one-off), it points at a bug in the
   reserve/mint path, not just bad data — flag it for a code fix, don't
   just patch the row and move on.

---

## Claim-link leaked

**Symptom:** The event's `/attend/<token>` link got posted somewhere public
(wrong Discord channel, indexed by a search engine, etc.) and people
outside the intended audience are claiming.

**Run:**
```bash
npx tsx scripts/admin/event-control.ts invalidate <eventId>
# review the dry-run output, then:
npx tsx scripts/admin/event-control.ts invalidate <eventId> --execute
```
`invalidate` pauses the event AND rotates its claim token in one step — the
old link stops working immediately either way (pause alone is enough to
stop new claims, but rotating means even re-opening later doesn't revive
the leaked link).

**Read the output:** On `--execute`, the new `claim_token` prints in full
(and the full `/attend/<token>` link if `NEXT_PUBLIC_APP_URL` is set) — copy
it now, it is not shown again. The old token only ever prints masked.

**Fix:**
1. Run `invalidate --execute` as above.
2. Re-share the new link with the intended audience only.
3. When ready, `event-control.ts resume <eventId> --execute` re-opens
   claims under the new token (claims stay closed after `invalidate` until
   you explicitly resume).

---

## Tree near / at capacity

**Symptom:** Mints start failing event-wide (not just one event) with an
on-chain error, or you're simply getting close to 16,384 total attendance
mints ever.

**Run:**
```bash
npx tsx scripts/admin/tree-capacity.ts
```

**Read the output:** Used/capacity and a percentage. WARN at 80%, CRITICAL
at 95% (exit code 1 either way — check the printed status for which).

**Fix — the tree is un-resettable, this is permanent capacity, not a
per-event limit:**
1. Create a new tree: `pnpm tree:attendance` (`scripts/create-attendance-tree.ts`).
   It prints a new `ATTENDANCE_MERKLE_TREE=<address>` line.
2. Update `ATTENDANCE_MERKLE_TREE` in `.env` **and** in Vercel's project env.
3. Redeploy.
4. Existing events do **not** need any DB changes — each event's NFT
   collection is independent of the tree, and `mintV2` reads
   `ATTENDANCE_MERKLE_TREE` fresh at mint time. Old and new events both
   mint into the new tree going forward.
5. Re-run `tree-capacity.ts` (add `--tree <old-address>` to keep an eye on
   the retired one if you still care about its final count).

---

## Stale reservations stranding supply

**Symptom:** An event's `minted_count` is climbing toward `max_supply` but
fewer NFTs than that are actually showing up as claimed — people reserved a
slot (started a claim) and never came back, and nobody retried, so the slot
never freed itself.

**Run:**
```bash
npx tsx scripts/admin/reserve-sweep.ts --event <eventId>
# review, then:
npx tsx scripts/admin/reserve-sweep.ts --event <eventId> --execute
```
(Omit `--event` to sweep all events. Default `--max-age` is 5 minutes —
comfortably past the 90-second window the app itself uses to tell a
crashed mint from one still in progress, so this never races a legitimate
retry.)

**Read the output:** List of stale claim ids with wallet + how long they've
been reserved, and a per-event count of slots that would free up.

**Fix:** Run with `--execute`. Each released claim marks `failed` and frees
one capacity slot back to the event — the participant can simply try
claiming again afterward if they come back.

---

## Nonce table growth

**Symptom:** No user-visible symptom — this is routine hygiene.
`attendance_nonces` rows are single-use, 5-minute-TTL wallet-proof
challenges with no automatic cleanup job.

**Run:**
```bash
npx tsx scripts/admin/nonce-sweep.ts
# then:
npx tsx scripts/admin/nonce-sweep.ts --execute
```
Default `--older-than` is 24 hours.

**Fix:** `--execute` deletes them. Safe to run any time — it only ever
touches already-expired rows.

---

## OPERATOR_SECRET_KEY rotation

Whether routine or because the key may be compromised.

1. **Generate** a new keypair: `solana-keygen new --outfile .keys/operator-new.json --no-bip39-passphrase`.
2. **Fund** it — devnet: `solana airdrop 1 <new-pubkey> --url devnet`;
   mainnet: transfer from the old operator wallet or another funded source.
   Use `operator-balance.ts` to confirm the new key's balance once it's
   wired in.
3. **Swap** `OPERATOR_SECRET_KEY` in `.env` and in Vercel's project env to
   point at the new key (inline JSON array or a file path — see
   `.env.example`).
4. **Redeploy.** A redeploy replaces all running server instances, so this
   is the actual cutover moment — an env-var change alone doesn't take
   effect for already-warm instances.
5. **In-flight mints during the cutover window:** a mint that was already
   submitted with the old key keeps its old signature and is unaffected. A
   request that hits a server instance mid-redeploy may simply fail — this
   is safe by design: `attendance_reserve_claim`'s pending/retry logic
   means the participant's next claim attempt just tries again, never a
   double-mint. No manual reconciliation needed for this specific window.
6. **Retire** the old key — remove `.keys/operator.json` (or wherever it
   lived) from the server's filesystem once you've confirmed the new one is
   live. `OPERATOR_SECRET_KEY` is designed to stay server-resident (unlike
   `DEPLOYER_SECRET_KEY` — see `WAKEUP.md` "Custody"); rotating it doesn't
   change that posture, it just changes which key is resident.
7. Run `npx tsx scripts/admin/preflight.ts` to confirm the new key is live
   and funded.
