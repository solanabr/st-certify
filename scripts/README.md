# scripts/

Operational scripts: deploy, seed, E2E, the RLS security gate, plus
`scripts/admin/` incident/maintenance tools. This directory has its own
isolated `pnpm install --ignore-workspace` (own `node_modules` + lockfile) —
see the root README's "Why `scripts/` has its own `package.json`". Run
everything from the repo root; `tsx` resolves each script by its own file
location, not the invoking shell's cwd.

Most `pnpm <name>` shortcuts below are defined in the root `package.json`;
scripts without one are run directly with `npx tsx`.

## Setup / deploy

| Command | Script | What it does |
|---|---|---|
| `pnpm setup:supabase` | `setup-supabase.ts` | Applies every `supabase/migrations/*.sql` file and creates the storage buckets (`templates`, `certs`, `metadata`, `attendance`). Needs `SUPABASE_DB_URL` to apply migrations directly; without it, paste the SQL into the dashboard's SQL editor by hand. |
| `pnpm deploy` | `deploy.sh` | `cargo build-sbf` + `solana program deploy` for `programs/certify`, scoped to the program crate only — a workspace-root `build-sbf` would also try to SBF-compile `tests/`, whose LiteSVM/Mollusk deps pull in `getrandom` and don't support the SBF target. Idempotent (upgrades in place when the program id already exists); pre-extends the on-chain program account when the new `.so` outgrows it. |
| `pnpm seed:onchain` | `seed.ts` | `init_config` + creates the one global Metaplex Core collection. Run once per cluster, after `deploy`. |
| `pnpm tree:attendance` | `create-attendance-tree.ts` | One-time: creates the shared Bubblegum v2 Merkle tree (depth 14 / buffer 64 / canopy 8, 16,384-leaf capacity) for attendance mints. Idempotent — skips if `ATTENDANCE_MERKLE_TREE` already points at a live account. Prints the line to add to `.env`; does not write files itself. |

## Seed / demo data

| Command | Script | What it does |
|---|---|---|
| `pnpm seed` | `seed-demo.ts` | Demo data: 1 edition + 5 certificates covering every dashboard/verify status (pending, partially signed, fully signed, claimed, revoked). |
| `npx tsx scripts/gen-default-template.ts` | `gen-default-template.ts` | Regenerates the committed default Superteam BR certificate template (`apps/web/assets/templates/default-superteam-br.png` + `default-layout.json`) through the same satori → resvg pipeline the app uses at runtime, then validates its own output against the shared layout schema. |

## E2E (devnet, real transactions)

| Command | Script | What it does |
|---|---|---|
| `pnpm e2e` | `e2e-devnet.ts` | Full certificate happy path against the deployed devnet program: fund student → `create_edition` → `request_certificate` → `sign_certificate` ×2 → `claim_certificate` (mint + `record_asset`). Prints every tx signature. |
| `pnpm e2e:attendance` | `e2e-attendance-devnet.ts` | Full attendance happy path: `createCollection` → `mintV2` → parse the leaf back from the finalized tx → assert ownership. Also measures and prints the real per-mint lamport cost, for documenting in `.env.example`. |
| `npx tsx scripts/e2e-overhaul-devnet.ts` | `e2e-overhaul-devnet.ts` | The wizard-era happy path (wave 5 of the 2026-08 overhaul): draft → signer invites (both accepted) → create-onchain → request ×2 → batch sign (2 instructions per signer tx) → claim (+ soulbound Core asset) → `GET /api/certificates/[addr]/pdf`. The closing assertion is the point of the script: the exported PDF starts with `%PDF-` and its XMP packet carries the same artifact sha256 that `claim_certificate` committed on-chain and that's stored as the certificate PNG in the `certs` bucket — chain, storage and document proven equal in one pass. No `pnpm` shortcut yet; run with `npx tsx`. |

## Security

| Command | Script | What it does |
|---|---|---|
| `pnpm rls-probe` | `rls-probe.ts` | The RLS negative-test gate: seeds probe rows with the service-role client, then proves the **anon** key can't read `profiles`/`events`/withheld `certificates` columns, can't write anywhere, and can't call the attendance RPCs — against the live Supabase project, through PostgREST, the way a real attacker or a client-side bug would hit it. Missing env is a hard failure, not a skip. Covers every table through migration 0008 (0006–0008 add columns/indexes, no new tables): `edition_drafts`, `signer_invites` and `notification_log` each get the same select/insert/update/delete probe as the original tables, and `certificates.verify_code` is included in the probe's hand-synced copy of `CERT_PUBLIC_COLUMNS`. |

## Admin — certificates / verification

| Command | What it does |
|---|---|
| `npx tsx scripts/admin/backfill-verify-codes.ts [--execute] [--json]` | Fills `certificates.verify_code` for rows issued before migration 0005 (new rows get theirs at insert time). Dry-run by default (prints a count + sample); `--execute` writes. Before writing anything, re-derives a sample of already-stamped rows and refuses to proceed if its Crockford-base32 derivation has drifted from `apps/web/lib/verify-code.ts` — a silent mismatch here would print codes the app could never look up again, and a verify code is permanent once it's printed on an issued PDF. Run once right after applying `0005_overhaul.sql`. |
| `npx tsx scripts/admin/scrub-metadata-salt.ts` | Rewrites any published certificate metadata JSON that still contains `render_spec.values.name_salt` (a pre-2026-08-20 bug). An archived salt+name pair would permanently defeat the LGPD unlinkability the on-chain `sha256(salt‖name)` commitment relies on after erasure. |

## Admin — attendance incidents

Run with `npx tsx scripts/admin/<script>.ts` from the repo root. Mutating
scripts default to dry-run and need `--execute`; see
`docs/runbooks/attendance-incident-playbook.md` for the full flag reference
and incident procedures.

| Script | What it does |
|---|---|
| `preflight.ts` | Run before every event: Supabase reachability, operator balance, RPC health, tree capacity. |
| `operator-balance.ts` | Operator SOL balance vs. a mint-floor threshold. |
| `integrity-report.ts` | Reconciles `minted_count` against actual claims; flags double-mints or desync. |
| `reserve-sweep.ts` | Releases stale `pending` claim reservations (`--execute` to write). |
| `event-control.ts` | Pause/resume/rotate/invalidate an event from the CLI (`--execute` to write). |
| `tree-capacity.ts` | On-chain Merkle leaf usage vs. the 16,384-leaf cap. |
| `nonce-sweep.ts` | Deletes expired auth nonces (`--execute` to write). |
| `_shared.ts` | Not a runnable script — shared helpers (env loading, the Supabase admin client, `--execute`/`--json`/`--help` flag parsing, exit-code constants) that every script above imports. |

## Exit codes (admin scripts)

`0` nothing to do / clean run, `1` findings in dry-run or a partial write
failure, `2` couldn't run the check at all (bad env, unreachable Supabase,
derivation drift). Matches the `EXIT` constants in `scripts/admin/_shared.ts`.
