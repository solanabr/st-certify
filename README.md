# Superteam Certify

An on-chain certificate system for Superteam Brasil — "DocuSign on Solana."
Sysadmins draft certificate **editions** (a course, cohort, or turma),
invite 2–6 named signers by email, and — once every seat is accepted — push
the edition on-chain. Students request a certificate, and once every signer
has signed, claim a **soulbound NFT** into their wallet forever, with a
sealed **PDF export** alongside it. Signers get a mass-sign dashboard (one
wallet popup for many certificates) behind a consent ceremony. Anyone can
verify a certificate publicly — by link, by its 8-character verify code, by
its SHA-256 hash, or by uploading the image or the PDF itself. Email
notifications (Resend) cover every hand-off: invited, pending, ready,
rejected, revoked, claimed.

The app has two front doors — certificates and attendance — each with its
own role-gated entry points; see "Page map" below.

Built devnet-first, autonomously. See `WAKEUP.md` for what a human needs to
do before this is fully live, and `CHANGELOG.md` for the
milestone-by-milestone history.

## Architecture

Three pieces, one rule: **the chain is authoritative.**

```
programs/certify/   Pinocchio program (Solana). Owns: signatures, statuses,
                     certificate/edition state, the artifact hash, the
                     multisig-style admin/signer thresholds. Nothing about
                     "is this certificate valid" is ever decided anywhere
                     but here.

packages/certify-client/
                     Hand-written @solana/kit codec client (no Anchor IDL —
                     there's no Anchor). Instruction builders, PDA
                     derivation, account decoders, an error-code map.
                     Golden-vector tested against real on-chain account
                     dumps, not just against the Rust source.

apps/web/            Next.js 15 app. Supabase Postgres is a READ CACHE / UX
                     layer, never a source of truth — every public and
                     student-facing page does a live on-chain re-check
                     (see "Chain-authoritative model" below) before trusting
                     a status the mirror shows. Auth is Privy (email ->
                     embedded Solana wallet, or a native wallet); Supabase
                     has no auth role at all.
```

### Chain-authoritative model, concretely

The DB mirror exists so pages paint instantly and so you can query
"all pending certificates for signer X" without an RPC round trip per row —
none of that would be reasonably fast against the chain directly. But the
mirror can lag (a revoke that landed on-chain 2 seconds ago might not be
synced yet), so every surface where trusting a stale "valid" would be a
real problem does a browser-side chain re-check on top of the server-painted
page:

- `/verify/[id]`: the server-rendered page paints instantly from the DB
  mirror (also gives you the OG tags); a client island
  (`VerifyChainStamp` + `VerifyStatusBanner`) then re-fetches the
  `Certificate` account directly and, if chain disagrees with the mirror
  toward Revoked, **overrides the banner** — a stale-mirror-revoked
  certificate never shows a misleadingly-green "válido" verdict, even for
  the few hundred milliseconds before the chain-check resolves.
- The NFT link on the verify page is never taken from the mirror — it's the
  live on-chain `Certificate.asset` field, checked against the actual
  minted asset (the "back-reference doctrine": an NFT is legitimate iff
  `Certificate.asset` points back at it — this is the only rogue-mint
  defense, since all certificates share one global Metaplex Core
  collection).
- The mass-sign dashboard resumes from a chain re-query on every page load,
  never from client-held batch state — a partially-completed batch just
  shows a smaller inbox next time, nothing to reconcile.

### Two server-held keys, deliberately narrow scope

- **NOTARY** — co-signs `claim_certificate` only, attesting that the
  artifact hash matches what the server itself rendered. A leaked notary
  key can, at absolute worst, collude with a student to poison that
  student's own certificate hash — it cannot forge a signer's approval, a
  name, or a revocation.
- **OPERATOR** — single-signs the "creation class" of admin ops
  (`create_edition`, `set_edition_status`, `set_max_supply`,
  `record_asset`) after the API has already verified the caller is an
  allowlisted sysadmin. The **destructive class**
  (`revoke_certificate`, `set_notary`, `add_admin`, `remove_admin`) requires
  **2 pairwise-distinct admin signatures** — see `WAKEUP.md` "Custody" for
  why that matters and what to do about it.

## Tech stack

| Layer | Choice |
|---|---|
| Program | Pinocchio 0.11 (`#![no_std]`, zero `unsafe`, zero heap allocation) |
| Program tests | LiteSVM (real-transaction integration tests) + Mollusk (per-instruction CU regression gates) |
| Client codec | Hand-written `@solana/kit` ^6.10 codecs (no Anchor IDL) |
| NFT | Metaplex Core 1.10, server-side mint via Umi (soulbound: permanent-freeze + permanent-burn-delegate plugins) |
| Web app | Next.js 15.5 (App Router, React 19, TS strict), Tailwind 4 + shadcn/ui |
| Auth | Privy v3 (`@privy-io/react-auth`) — embedded Solana wallets + external wallet-standard adapters |
| Database | Supabase Postgres (RLS everywhere) + Storage (public, content-addressed buckets) |
| Rendering | satori + `@resvg/resvg-js`, pinned exact versions for byte-determinism |
| Data fetching | TanStack Query for authed dashboards; RSC reads for public pages |
| Forms | react-hook-form + zod 4 |
| Email | Resend, behind a degrade-gracefully wrapper (`lib/email/`) — skips + logs when unconfigured, never throws |
| PDF export | pdf-lib 1.17.1 (deterministic, byte-identical builds) + `@signpdf`/`node-forge` for an optional pluggable cryptographic seal |
| Designer | `@dnd-kit` + `react-moveable` + `react-selecto` + `@scena/react-guides`, touch-first rebuild (dependencies landed, canvas wiring in progress) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) — typecheck/lint/vitest/`next build` on every PR, plus a paths-gated program job (fmt/clippy/build-sbf/test) that only runs when `programs/**`/`tests/**` changed |

## Page map

The 2026-08 overhaul split the app into two front doors — the certificate
product and the attendance product — and renamed every certificate-side
route. Old links keep working: `next.config.ts` 301-redirects every renamed
route permanently, so printed QRs, bookmarks, and links already handed to
students/signers all still resolve. Routes under `/api/**` did not move.

| Route | Old route | Purpose | Auth |
|---|---|---|---|
| `/` | `/` | Landing — three intent cards: Emitir certificados, Verificar documento, Eventos & presença | none |
| `/certificates` | `/editions` | Public catalog of open editions | none |
| `/certificates/[slug]` | `/editions/[slug]` | Edition page + certificate request form | form gated on Privy |
| `/verify`, `/verify/[id]` | same | Verification — link, 8-char verify code, SHA-256 hash, or PNG/PDF upload; `?lang=` override; "Detalhes técnicos" disclosure | none |
| `/me` | same | "Meus documentos" — certificates and attendance claims together, claim ceremony, Baixar PDF | `requireUser` |
| `/sign` | `/certificator` | Signer inbox — consent panel, batch signing, completion summary | `requireCertifier` |
| `/studio` | `/admin` | Issuer dashboard — stat cards, edition list, Atividade feed | `requireSysadmin` |
| `/studio/editions/new` | `/admin/editions/new` | Creation wizard — draft autosave, seats/invites, designer, explicit "Criar on-chain" step | sysadmin |
| `/studio/editions/[id]` | — (new) | Edition management — seat/invite status, distribution kit, per-certificate pipeline, reminders | sysadmin |
| `/invite/[token]` | — (new, **page not yet in the tree**) | Signer invite acceptance — Privy login, wallet binding. APIs live (`/api/invite/[token]`, `.../accept`); the page itself isn't. See "Known limitations." | token + Privy |
| `/events` | same | Attendance event creation/dashboard | creator-wallet check |
| `/attend/[token]` | same | Attendance claim link | token |
| `/nft/[assetId]` | same | Attendance NFT detail | none |

New API surface (all under the existing `apiRoute()` + auth helpers — see
each route file for request/response shapes):

- `/api/studio/drafts`, `/api/studio/drafts/[id]`, `.../invites`,
  `.../invites/[inviteId]`, `.../invites/[inviteId]/remind`,
  `.../create-onchain` — draft-first edition lifecycle + signer invites.
- `/api/certificates/[addr]/pdf` — sealed PDF export (claimed certificates only).
- `/api/verify/resolve-code/[code]` — 8-char verify code lookup.
- `/api/me/attendance` — attendance claims for the session's linked wallets, feeding `/me`.
- `/api/cron/digest` — daily signer digest (Vercel Cron; see "Environment variables").

## Repo layout

```
programs/certify/     the Pinocchio program
tests/                LiteSVM + Mollusk test suite (separate crate — cargo
                       build-sbf must NOT include this; see below)
packages/certify-client/  the hand-written TS client, golden-vector tested
apps/web/              the Next.js app
scripts/                deploy/seed/E2E/RLS-probe scripts (isolated
                       node_modules — see "Why scripts/ has its own
                       package.json" below)
supabase/migrations/    0001_init.sql — schema + RLS policies
.superpowers/sdd/       every milestone's brief + report + review, the full
                       build history, in more detail than this file has room for
```

## Getting started

```bash
pnpm install         # apps/ + packages/ (workspace-managed)
pnpm dev              # http://localhost:3000
```

First time, or waking this project up after a break: read `WAKEUP.md`. It's
short, ordered, and is the actual list of things only a human can do
(paste the Supabase URL, flip two Privy dashboard toggles, log in once with
a real OTP).

### Why `apps/web/.env.local` is a symlink

Next.js/Turbopack only inlines `NEXT_PUBLIC_*` vars from `.env*` files inside
the app's own directory (`apps/web/`), not the repo root, even though this is
a pnpm workspace. `apps/web/.env.local -> ../../.env` makes the root `.env`
the one canonical file without duplicating it. If you ever see a
`NEXT_PUBLIC_*` var behaving as if it's empty despite being set in `.env`,
check this symlink still exists first.

### Why `scripts/` has its own `package.json`

Adding a dependency to the workspace root or `apps/web` mid-build triggers
pnpm's "remove all modules and reinstall from scratch" prompt — a full
`node_modules` purge, disruptive if anything else is mid-build. `scripts/`
gets its own isolated `pnpm install --ignore-workspace` (own
`node_modules` + lockfile) so its dependencies (kit, Umi, mpl-core,
`@supabase/supabase-js`, the workspace-local `@certify/client` via a `file:`
dependency) never touch the root install. `tsx` still runs these scripts
from the repo root (`pnpm deploy`, `pnpm seed`, etc.) — module resolution is
based on each script file's own location, not the invoking shell's cwd, so
this works transparently.

## Environment variables

One `.env` file at the repo root (the symlink above makes it the app's
too). `.env.example` is the template — copy it to `.env` and fill in real
values; never commit `.env` itself. Every var below is read somewhere in
`apps/web` unless noted otherwise (confirmed by grepping `process.env.`
across the app).

### Chain

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_RPC_URL` | Devnet RPC endpoint |
| `NEXT_PUBLIC_WS_URL` | Devnet websocket endpoint |
| `NEXT_PUBLIC_PROGRAM_ID` | Certify program id (filled by `pnpm seed:onchain`) |
| `NEXT_PUBLIC_APP_URL` | Canonical origin — builds every absolute link the server sends out (invite emails, verify links, the PDF's verify URL) |
| `CORE_COLLECTION_ADDRESS` | The one global Metaplex Core collection (filled by `pnpm seed:onchain`) |

### Auth (Privy)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app id |
| `PRIVY_APP_SECRET` | Privy server secret |

### Database (Supabase)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key — RLS-restricted, see "Security posture" |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — server routes only, never sent to the client |
| `SUPABASE_DB_URL` | Optional; lets `pnpm setup:supabase` apply migrations directly (Dashboard → Connect → URI). Without it, paste `supabase/migrations/*.sql` into the SQL editor by hand. Read by `scripts/`, not by the app itself. |

### Server keys

Path to a solana-keygen JSON file, or the JSON array itself. See "Security
posture" below and `WAKEUP.md` "Custody" before using any of these in
production.

| Var | Purpose |
|---|---|
| `NOTARY_SECRET_KEY` | Co-signs `claim_certificate` only |
| `OPERATOR_SECRET_KEY` | Single-signs the admin "creation class" ops; one of the two required signers for the destructive class |
| `DEPLOYER_SECRET_KEY` | Program upgrade authority; doubles as the 2nd destructive-op admin signer until a real admin wallet registers |

### Roles

| Var | Purpose |
|---|---|
| `ADMIN_EMAILS` | Comma-separated sysadmin allowlist, by Privy email |
| `ADMIN_WALLETS` | Comma-separated sysadmin allowlist, by wallet |

### Email (Resend) — new in the 2026-08 overhaul

| Var | Purpose | Unset behavior |
|---|---|---|
| `RESEND_API_KEY` | Resend API key | `emailConfigured()` (`lib/email/send.ts`) returns false; `sendEmail()` logs one warning and returns `{ sent: false, reason: "unconfigured" }` instead of throwing. Every notification trigger (invite, cert-ready, rejected, revoked, claim receipt, reminder, digest) becomes a no-op, never a failed request. |
| `EMAIL_FROM` | Verified sender, e.g. `Superteam Certify <no-reply@certify.superteam.com.br>` | Required together with the key above — either missing disables sending |

### Cron — new in the 2026-08 overhaul

| Var | Purpose | Unset behavior |
|---|---|---|
| `CRON_SECRET` | Bearer token `GET /api/cron/digest` requires (Vercel Cron calls it daily at 12:00 UTC per `apps/web/vercel.json`) | **Fails closed** — every request 401s, including Vercel's own trigger. Unlike the vars above, this is not a graceful degrade; set it before relying on the digest. |

Vercel only reads `vercel.json` from the project's configured Root
Directory (`apps/web` here) — a copy at the repo root is silently ignored,
which is exactly what happened until commit `289ee4c` moved it. Set
`CRON_SECRET` in the Vercel project's environment variables (not just
locally): Vercel then sends it automatically as the `Authorization: Bearer`
header on every cron invocation, so there is no separate webhook-secret
step to configure.

### PDF export seal — optional, new in the 2026-08 overhaul

| Var | Purpose | Unset behavior |
|---|---|---|
| `SEAL_P12_BASE64` | Base64 of a self-managed org `.p12`/`.pfx` (`base64 -i seal.p12`) | `sealConfigured()` (`lib/pdf/seal.ts`) returns false; `GET /api/certificates/[addr]/pdf` ships the PDF unsealed — still valid, still verifiable, just without the cryptographic signature panel |
| `SEAL_P12_PASSPHRASE` | Passphrase for the `.p12` above | Ignored when `SEAL_P12_BASE64` is unset |

An ICP-Brasil **A1** (file) certificate is deliberately not supported this
way — Adobe reports an A1 used outside its issued device as invalid. The
upgrade path is a PSC-hosted cloud A3 certificate behind the same
`CertificateSource` interface (`lib/pdf/seal.ts`), not yet implemented.

### Issuer identity — optional, new in the 2026-08 overhaul

Shown on `/verify/[id]` and printed in the PDF footer/evidence page and the
email footer (`lib/issuer.ts`, `lib/email/templates.ts`).

| Var | Purpose | Unset behavior |
|---|---|---|
| `ISSUER_NAME` | Issuer display name | Hides the issuer identity block on `/verify/[id]` entirely; the PDF and email footer fall back to the platform name |
| `ISSUER_CONTACT_URL` | Optional issuer contact link | Omitted when unset |
| `ISSUER_CNPJ` | Optional issuer CNPJ | Omitted when unset |

### UI mock mode

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_UI_MOCK` | `1` renders every screen from fixtures — no Privy, Supabase or RPC. See `apps/web/README.md` "UI mock mode". Ignored whenever `NODE_ENV=production`. |

### Attendance NFTs

`ATTENDANCE_MERKLE_TREE`, `ATTENDANCE_CREATOR_WALLETS`,
`ATTENDANCE_SESSION_SECRET` — see "Attendance NFTs" below.

### Optional dev tooling

| Var | Purpose |
|---|---|
| `HELIUS_API_KEY` | Powers the Helius MCP dev tool only — the app itself reads RPC from `NEXT_PUBLIC_RPC_URL`/`NEXT_PUBLIC_WS_URL` |

## Development commands

```bash
# App
pnpm --filter web dev / build / lint / typecheck / test

# Program (from repo root)
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build-sbf --manifest-path programs/certify/Cargo.toml   # NOT a bare
    # workspace-root `cargo build-sbf` — that also tries to SBF-compile the
    # tests/ crate, whose LiteSVM/Mollusk deps pull in `getrandom`, which
    # doesn't support the SBF target and fails the build.

# Devnet operational scripts (see scripts/ — all idempotent / skip-if-exists)
pnpm deploy           # cargo build-sbf + program deploy/upgrade
pnpm seed:onchain      # init_config + the one global Core collection
pnpm e2e               # full request->sign->claim->mint->record_asset E2E
pnpm setup:supabase    # apply migrations + create storage buckets
pnpm rls-probe         # security gate — proves the anon key can't write
                       # anywhere and can't read profiles/events
pnpm seed              # demo data: 1 edition, 5 certificates covering
                       # every dashboard/verify status
```

## Manual test pass

See `WAKEUP.md` step 4 — the 5-minute walkthrough (login through revoke)
that can't be automated in this build environment (Privy email OTP needs a
real inbox; there's no Chrome binary in the sandbox for a headless
keyboard-only Playwright run either). Everything upstream of "click login"
is covered by the automated gates below.

## Automated verification (current state)

- **Program**: `cargo fmt` clean, `cargo clippy --all-targets -- -D
  warnings` clean, `cargo test --workspace` — 44/44 passing across
  `tests/*.rs` (batch, bug-class, claim/reject backfill matrices, CU gates,
  edition/supply boundaries, golden-vector decode equality, full lifecycle,
  smoke, threshold/aliasing).
- **App**: `pnpm --filter web test` (vitest) — 159/159 passing. `tsc
  --noEmit` clean. `eslint` clean. `next build` — 31/31 routes compile.
- **RLS**: `pnpm rls-probe` — not runnable tonight (Supabase URL pending);
  see `WAKEUP.md` step 1.5. The migration's policies were read closely (only
  `editions`/`edition_signers`/`certificates` have an anon SELECT policy;
  `profiles`/`events` have zero policies, meaning RLS-enabled-with-no-policy
  denies everything to non-service-role) but the probe script itself is the
  actual gate, not this sentence — run it.

A transient CU-gate test failure was observed exactly once, during a
workspace-wide `cargo test` run under heavy concurrent load (this sandbox
had other agents building at the same time) — not reproducible in isolation
or on immediate retry, and the CU numbers involved (LiteSVM-simulated
compute-unit counts) have no legitimate source of run-to-run variance. Noted
here for transparency, not treated as a real finding.

## Security posture (what's actually implemented, tonight)

Full detail lives in the plan (`.claude`-adjacent
`you-are-going-to-foamy-stallman.md`) and the milestone reviews; this is the
condensed, "what actually shipped" version.

- **Name impersonation** (the top human risk — a signer rubber-stamping a
  fake name): the sign UI shows the student's name as the loudest element on
  every row; `lib/schemas.ts`'s name sanitizer strips bidi-override and
  zero-width characters, NFC-normalizes, enforces a letters/marks/numbers/
  space/'/-/. charset (blocks emoji and most symbols), caps length at 64,
  and — added in M7 — rejects names mixing Latin with Cyrillic or Greek
  letters (the classic homoglyph substitution, e.g. a Cyrillic "а" standing
  in for Latin "a"). This runs identically on the client (live preview) and
  the server (`prepare-request`, same schema, same code) — see
  `lib/__tests__/schemas.test.ts` for the fixture set.
- **Onchain admin gating**: every privileged instruction checks the
  program's own `Config.admins` registry — client/API checks are UX only,
  never the actual authorization boundary.
- **RLS**: enabled on every table; only `editions`/`edition_signers`/
  `certificates` have an anon SELECT policy; all writes are service-role
  only, from server route handlers, after the caller's ownership/authority
  has already been checked. `pnpm rls-probe` is the negative-test gate for
  this (see above).
- **HashIndex anti-squat**: created only inside the notary-cosigned claim
  instruction (`init`, never `init_if_needed`) — a program's own PDAs
  cannot be created from outside the program, so pre-squatting an artifact
  hash is structurally impossible, not just discouraged.
- **LGPD**: the plaintext student name and its salt live only in
  off-chain, deletable layers (the `certificates` mirror row, the rendered
  PNG, the metadata JSON) — the on-chain `Certificate` account stores only
  `sha256(salt ‖ NFC(name))`. Erasure = null the two DB columns + delete the
  storage objects + (if already minted) revoke and burn. Not yet automated
  into a one-click admin action — see "Known limitations."
- **Destructive-op threshold**: 2 pairwise-distinct admin signatures for
  `revoke_certificate` / `set_notary` / `add_admin` / `remove_admin`.
  Tonight that's deployer+operator (acknowledged bootstrap theater — see
  `WAKEUP.md` "Custody"); becomes operator+a-real-human's-wallet the moment
  an allowlisted admin logs in once.

## Attendance NFTs

A second, self-contained flow living alongside the certificate system:
whitelisted wallets create attendance **events** at `/events`
(wallet-standard sign-in, Privy email as a no-wallet fallback); each event
mints its own per-event Metaplex Core collection with the BubblegumV2
plugin. Participants open a secret per-event link at `/attend/<token>`,
connect any wallet-standard wallet (or Privy email), prove ownership with a
signed message (or their existing Privy session), and the server mints a
Bubblegum v2 **compressed NFT** straight to them — the operator pays every
fee, participants pay nothing. Creators get supply caps, claim deadlines,
pause/resume, and link rotation (invalidates the old link immediately).
Copy says "attendance NFT" (pt: "NFT de presença") throughout, deliberately
avoiding the more common but trademarked term for this pattern.

Each event's shared metadata JSON follows that pattern's conventions
(adapted to the Metaplex standard): optional **location**, **end date**
(multi-day events) and **event URL** from the creation form become
Title-Case attributes (`Location`, `Event Date`, `End Date`, `Year`,
`Event URL`, `Issuer`, `Event ID`) plus `external_url` and
`properties.files`. Every attendee's cNFT also carries a per-mint **serial
in its on-chain leaf name** ("Meetup SP #42") — assigned atomically by the
claim reservation, truncated byte-aware to Bubblegum's 32-byte name cap
(`lib/attendance/metadata.ts#attendanceLeafName`). Events created before
migration `0004` keep their original JSONs.

Three env vars, all server-only:

| Var | What |
|---|---|
| `ATTENDANCE_MERKLE_TREE` | Shared Bubblegum v2 tree address, created once by `pnpm tree:attendance` (depth 14 / buffer 64 / canopy 8) |
| `ATTENDANCE_CREATOR_WALLETS` | Comma-separated, exact-case base58 allowlist of wallets that may create events |
| `ATTENDANCE_SESSION_SECRET` | HMAC secret for the creator session cookie (32+ random bytes, e.g. `openssl rand -base64 32`) |

```bash
pnpm tree:attendance   # one-time: creates the shared Merkle tree, prints
                        # the ATTENDANCE_MERKLE_TREE line to add to .env
pnpm e2e:attendance    # devnet: createCollection + mintV2 + parseLeaf round trip
```

Measured cost per `mintV2` on devnet (`pnpm e2e:attendance`, 2026-08-19):
**95,000 lamports** (~0.000095 SOL) — Bubblegum protocol fee + base tx fee,
paid entirely by the operator.

**Admin / incident scripts** (`scripts/admin/`, run with `npx tsx`; mutating
ones default to dry-run and need `--execute`; see
`docs/runbooks/attendance-incident-playbook.md`):

```bash
npx tsx scripts/admin/preflight.ts        # run before every event: Supabase, operator balance, RPC, tree capacity
npx tsx scripts/admin/operator-balance.ts # operator SOL vs a mint-floor
npx tsx scripts/admin/integrity-report.ts # reconcile minted_count vs claims; flag double-mints/desync
npx tsx scripts/admin/reserve-sweep.ts    # release stale pending reservations (--execute)
npx tsx scripts/admin/event-control.ts    # pause/resume/rotate/invalidate an event from the CLI (--execute)
npx tsx scripts/admin/tree-capacity.ts    # on-chain leaf usage vs the 16,384 cap
npx tsx scripts/admin/nonce-sweep.ts      # delete expired nonces (--execute)
```

**Security migration `supabase/migrations/0003_hardening.sql` must be applied**
(`pnpm setup:supabase`, or paste into the Supabase SQL editor to see the
NOTICEs). It closes a verified-live anon read of `name_salt`/`owner_did`/
`owner_wallet` on every certificate, revokes anon EXECUTE on the attendance
RPCs, and adds idempotency indexes/constraints. Apply it before relying on the
RLS boundary.

## Known limitations / tomorrow

**Signer invite links 404 (overhaul branch, being fixed alongside this
commit).** The invite email and the wizard's "convidar" step send signers to
`/invite/[token]`. The API side is live — `GET /api/invite/[token]`
(resolves the invite, including distinct "already accepted"/"expired"
states) and `POST /api/invite/[token]/accept` (binds the signer's wallet,
requires a Privy session) — but the `/invite/[token]` **page** that would
call them doesn't exist yet, so the link is still a dead end for now. The
wizard's manual "inserir carteira manualmente" fallback is unaffected and
works today.

Ledger-triage dispositions (every `deferred minor` / `parked` line from the
build's SDD progress log) are folded in here; the full detail for each is in
`.superpowers/sdd/you-are-going-to-foamy-stallman/task-m7-hardening-report.md`.

**Before mainnet — read this one first:**

- **Persistent-tombstone reject-grief (program, parked, not fixed
  tonight).** An edition signer or admin can, in a single transaction,
  bundle `reject_request` with a small `System.transfer` to the just-freed
  certificate PDA — funding the "tombstone" account above zero defeats the
  transaction-end garbage collection, so the PDA survives program-owned
  across transactions. Result: a permanent, irreversible block on that
  (edition, student) pair ever requesting again, for about 0.0009 SOL of
  griefer cost. Ruled acceptable to ship devnet-with tonight because (a) the
  only actor who can do it is an already-trusted certifier or admin, who has
  strictly worse griefing options available anyway (deny every request
  outright, commit fraud), and (b) the correct fix — a new admin-only
  reclaim-tombstone instruction, deliberately **not** composable in the same
  transaction as `reject` — needed more time than was safe to spend at 3am
  without risking reopening the already-fixed same-transaction revival bug
  it's adjacent to. Design direction is written down; hand to
  `solana-architect` or a red-team pass before mainnet.
- **Anon SELECT on `certificates` returns `owner_did` (PII) to anyone.**
  `anon_select_certificates` (`supabase/migrations/0001_init.sql`) is
  `using (true)` with no column allowlist, so any anonymous PostgREST
  `select("*")` against `certificates` — not just the verify page's own
  narrower query — can read `owner_did` (the student's Privy DID) alongside
  `owner_wallet` and `name_salt`. Devnet-acceptable (no real student data on
  this cluster); a real PII exposure once mainnet holds real students. Fix:
  restrict the anon policy to a column-limited view (drop
  `owner_did`/`owner_wallet`/`name_salt` from the anon projection — the
  verify page only needs the public fields it already renders) before
  mainnet. Not attempted blind tonight; needs a live Supabase instance to
  test the RLS/view change against.

**Explicitly deferred in M7 (documented rather than fixed — see the M7
report for the reasoning behind each):**

- **Revoked-certificate OG image**: `generateMetadata` currently omits
  `openGraph.images` entirely for a revoked certificate rather than pointing
  at a static "revoked" card — a share of a revoked cert's link today shows
  no image preview instead of a clearly-labeled revoked one.
- **Signer-table timestamps prefer the mirror over the chain**: the verify
  page's signer table shows `signedAt` from the DB mirror
  (`certificates.signer_txs`), even on the same page where
  `VerifyChainStamp` has already fetched the authoritative on-chain
  `sig_timestamps` for its own verdict. Not wired through to the table yet.

**Carried forward from earlier milestones (still true, not M7's to fix):**

- **Cross-platform render determinism unverified.** The satori/resvg
  double-render byte-identity proof has only ever run on this one dev
  machine. Trust model note: the renderer never re-runs to verify an
  existing certificate (the on-chain hash is the permanent source of
  truth), so this only matters if a render host migration or a retried
  claim ever re-renders on a *different* platform. Pin the render host, or
  do a Linux smoke test, before any host migration.
- **Live Privy -> role resolution** and **silent embedded-wallet batch
  signing** were both verified only by source-reading + a partial spike
  (headless OTP can't complete; embedded batch-sign was inferred from the
  SDK's documented behavior, not observed live). Covered by `WAKEUP.md`
  step 4's manual pass.
- CU-simulation uses a static fallback rather than an actual
  `simulateTransaction` round trip before setting the compute budget
  (brief-permitted shortcut, M4).
- The app hardcodes the devnet cluster in a few places rather than reading
  it everywhere from `NEXT_PUBLIC_CLUSTER` (M4).

**Attendance NFTs (see `.superpowers/sdd/2026-08-19-attendance-nft/`):**

- **Mint idempotency (hardened 2026-08-20).** The mint-succeeds-then-DB-write-fails
  interleaving no longer double-mints: `app/api/attendance/claim` splits its
  catch so `releaseClaim` runs only when the on-chain mint itself throws, and
  `markClaimMintedWithRetry` retries the DB write with backoff (logging a
  greppable `[attendance:reconcile]` line with claimId/txSig/wallet on
  exhaustion instead of releasing). Migration `0003` adds a `failed -> minted`
  slot-retake trigger so even a released claim whose mint later lands keeps the
  counter honest. The certificate flow got the parallel fix: `mintCertificateAsset`
  writes its idempotency event before the visibility wait, and
  `getMintedAssetFromEvents` now fails closed (throws retryable) instead of
  reading a DB error as "never minted". **Still accepted:** a `pending`
  reservation older than 90 seconds is treated as a crashed attempt and
  re-mintable even if merely slow — bounded to a duplicate collectible
  (~0.0001 SOL of operator-paid fees, never fund loss or wrong owner);
  `scripts/admin/reserve-sweep.ts` + `integrity-report.ts` detect and
  reconcile it.

**Deliberately out of scope tonight (per the plan's stretch/later list, not
regressions):**

- CSV pre-approval for names (the structural fix for impersonation, beyond
  tonight's sanitizer mitigation).
- Signature drawing pad (a rendered cursive font stands in tonight).
- Rust CPI mint via `mpl-core`'s `CpiBuilder` (server-side Umi mint stands;
  this would close the "back-reference is the only rogue-mint defense"
  caveat by binding mint authority into the program itself).
- Admin add/remove UI (env-configured allowlist + day-1 auto-registration
  stands in).
- Automated LGPD-erasure tooling (the manual runbook — null 2 columns,
  delete 2-3 storage objects, optionally revoke+burn — works today; no
  one-click admin action for it yet).
- Unrevoke policy — undecided, no instruction for it either way.
- Squads v4 as mainnet upgrade authority + moving the deployer key off the
  server-readable path — see `WAKEUP.md` "Custody" and "Before mainnet."

## License

MIT — see `LICENSE`.
