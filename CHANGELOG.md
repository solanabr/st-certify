# Changelog

Milestone history for Superteam Certify's initial build. Each milestone was
gate-verified (build/test/review) before the next started; full briefs,
reports, and reviews are in
`.superpowers/sdd/you-are-going-to-foamy-stallman/`.

## 2026-08-20 — Attendance metadata (POAP-informed) + published-salt removal

Second wave of the day, after the hardening pass below landed. Gates green:
production build, typecheck + lint clean, 269 vitest tests (37 files).
`0003_hardening.sql` and `0004_attendance_metadata.sql` are **applied to
production** (43/43 `rls-probe` checks pass); the devnet program was
**upgraded in place** (same program id, `solana program deploy` +
`ExtendProgram`) with the `init_config` takeover guard.

**Privacy**

- fix(certificates): the published metadata JSON no longer contains
  `render_spec.values.name_salt` — an archived salt+name pair would
  permanently prove the on-chain `sha256(salt‖name)` commitment binding,
  defeating post-erasure unlinkability (LGPD). The PNG stays reproducible
  from `render_spec`; commitment verification is served by `/verify`, which
  holds the salt server-side. `scripts/admin/scrub-metadata-salt.ts` rewrites
  any pre-fix JSONs in place (production scan 2026-08-20: zero published, so
  nothing to scrub).

**Attendance metadata**

- feat(attendance): events gain optional **location**, **end date** and
  **event URL** (form + zod + DB, migration `0004`); the shared metadata
  JSON follows POAP's attribute conventions in this platform's Title-Case
  style — `Location`, `Event Date`, `End Date`, `Year`, `Event URL`,
  `Issuer`, `Event ID` — plus `symbol: "ATTEND"` (type-named like `CERT`),
  `external_url`, and `properties.files`/`category` for wallet display.
  Certificates additionally gain numeric `Serial`/`Edition Size` attributes
  (machine-sortable) alongside the human `Cert Number` string. Claim page
  shows the location and date range.
- feat(attendance): per-attendee **mint serial in the cNFT leaf name**
  ("Meetup SP #42") — `attendance_reserve_claim` now assigns and returns
  `mint_serial` atomically with the capacity slot (no extra write on the
  mint path); `attendanceLeafName` truncates byte-aware to Bubblegum's
  32-byte cap (multibyte pt-BR names never split mid-character).

**Build / ops**

- fix(web): the production build was failing on two latent issues — the
  sha256 spec-hash helpers moved out of `lib/render/layout.ts` (imported by
  client components; `node:crypto` breaks the client webpack bundle) into
  `lib/render/spec-hash.ts`, and `toEventView` moved out of the events route
  file (route modules may only export handlers) into
  `lib/attendance/event-view.ts`.
- fix(deploy): `deploy.sh` pre-extends the program allocation
  (`solana program extend`, ≥10240-byte floor) when the new `.so` outgrows
  the on-chain account — the CLI's own auto-extend requests the exact
  deficit and the runtime rejects it.

## 2026-08-20 — Security hardening + attendance UX

Adjudicated from a parallel, adversarially-verified audit (9 domains, 96
confirmed findings) plus a Chrome UX pass. Full suite green afterward:
typecheck + lint clean, 263 vitest tests (37 files), 47 program tests.

**Security / correctness**

- fix(attendance): split the claim route's catch so `releaseClaim` runs only
  on an on-chain mint failure; `markClaimMintedWithRetry` retries the DB write
  and logs `[attendance:reconcile]` on exhaustion instead of freeing the slot
  (closes the mint-success + DB-write-fail double-mint).
- fix(certificates): `getMintedAssetFromEvents` now fails closed (throws
  retryable) instead of reading a DB error as "never minted";
  `mintCertificateAsset` persists its idempotency event before the visibility
  wait (closes the parallel certificate double-mint window).
- fix(db): **`0003_hardening.sql`** — column-restrict anon SELECT on
  `certificates` (was leaking `name_salt`/`owner_did`/`owner_wallet` for every
  row to the public anon key — verified live-exploitable), pin `search_path` +
  revoke anon EXECUTE on the attendance RPCs, `failed -> minted` slot-retake
  trigger, partial-unique idempotency indexes, counter CHECK constraints.
  **Must be applied** (`pnpm setup:supabase`).
- fix(certificator): `certificator-queries.ts` reads via the service-role
  client (needs `owner_wallet`, now withheld from anon).
- fix(program): gate `init_config` on a `BOOTSTRAP_ADMIN` signer and block
  removal of the bootstrap admin — closes a permissionless-init takeover.
  Source + tests only; **not redeployed** (devnet config already initialized;
  a pre-mainnet cutover item).
- fix(api): redact raw internal exception messages from the client error
  envelope and log them server-side (`[api:error]`); prefer a server-side
  Helius RPC URL over the public one with `server-only` on `rpc.ts`; wallet-
  keyed rate limit on the nonce route; security headers + Report-Only CSP;
  `checkClaimGate` fails closed on an unparseable deadline.

**Attendance UX**

- feat(attendance): claim-card v2 — asset reveal + "view your NFT", signing-
  stage copy, wallet-switch, inline (not toast) mint errors; instant SSR paint
  for the QR-scan path.
- feat(attendance): public `/nft/[assetId]` share page (indexable, OG preview,
  `claim_token` never exposed); `/verify` miss falls back to it.
- feat(attendance): mobile creator dashboard (card layout — actions were
  clipped off-screen), tree-capacity meters, attendee drawer + CSV export,
  Phantom deep-link for wallet-less mobile, i18n'd file input, richer QR
  dialog.

**Ops**

- feat(ops): `scripts/admin/*` incident tools (preflight, operator-balance,
  integrity-report, reserve-sweep, event-control, tree-capacity, nonce-sweep)
  + `docs/runbooks/attendance-incident-playbook.md`; `deploy.sh` cluster guard.
- fix(chore): dead-animation CSS utilities restored; `getServerSnapshot`
  stability fix; explorer URLs derive their cluster; a11y (Progress value,
  contrast, radiogroup keyboard nav); i18n gaps closed.

## 2026-08-19 — Attendance NFTs

- feat(attendance): attendance NFT events — creator dashboard, secret claim
  links, subsidized Bubblegum v2 mints.
- Whitelisted wallets create events at `/events`; each event mints its own
  per-event Metaplex Core collection carrying the BubblegumV2 plugin.
  Participants claim at a secret `/attend/<token>` link — a wallet-standard
  signature or an existing Privy session proves ownership, then the server
  mints a Bubblegum v2 compressed NFT straight to them, fully
  operator-subsidized (measured 95,000 lamports per mint on devnet).
- Creator controls: supply cap, claim deadline, pause/resume, and link
  rotation (invalidates the old link immediately).
- `pnpm tree:attendance` (one-time shared Merkle tree bootstrap, depth 14 /
  buffer 64 / canopy 8) and `pnpm e2e:attendance` (devnet
  createCollection + mintV2 + parseLeaf round trip).
- New env vars: `ATTENDANCE_MERKLE_TREE`, `ATTENDANCE_CREATOR_WALLETS`,
  `ATTENDANCE_SESSION_SECRET`.

## M7 — Hardening, seed data, docs, wake-up runbook

- Name-sanitization hardening: `studentNameSchema` now rejects Latin/
  Cyrillic and Latin/Greek script mixing (homoglyph impersonation
  mitigation), with a full fixture suite covering RTL-override, zero-width,
  emoji, and over-length cases at both the client schema and the server
  `prepare-request` boundary.
- Fixed a real validation bug found while writing those fixtures:
  `editionMetaSchema`/`editionSignerFormSchema`'s UTF-8-byte-length checks
  never actually rejected anything (zod 4's `.refine()` treats any truthy
  return, including a fallback error-message string, as "valid") — an
  overlong edition/signer name or role silently truncated on-chain with no
  warning. Fixed and covered by regression tests.
- `scripts/rls-probe.ts`: negative-probe security gate proving the anon
  Supabase key can't write anywhere and can't read `profiles`/`events`.
- `scripts/seed-demo.ts`: idempotent demo-data seed — one edition, five
  certificates spanning every dashboard/verify status, wired into `pnpm
  seed`.
- Fixed `@supabase/supabase-js` never actually being installed for the
  `scripts/` package despite `setup-supabase.ts` importing it — would have
  crashed with `MODULE_NOT_FOUND` the moment someone ran it with a real
  Supabase URL.
- `isUserRejection()` de-duplicated from 4 separate hook-local copies into
  `lib/chain/errors.ts`.
- `/verify`'s hero status banner now respects a live on-chain Revoked
  verdict even when the DB mirror is stale, instead of showing a
  contradictory green "válido" banner above `VerifyChainStamp`'s red
  on-chain line.
- `/api/tx/submit` derives its post-confirmation sync targets from the
  ownership-checked DB row rather than the request body.
- The verify page's search input has a persistent visible label (was
  placeholder + `aria-label` only).
- `MintingStatus`'s auto-resume retry chain no longer calls `setState` after
  the card has unmounted.
- `README.md`, `WAKEUP.md`, `CHANGELOG.md`, updated `.env.example`.

## M6 — Custom template designer

- Upload flow: PNG validation, client-side downscale to ≤2400px, WebCrypto
  hash, content-addressed upload.
- Hand-rolled drag/resize canvas (Pointer Events, no third-party library)
  for positioning `student_name`/`date`/`cert_id`/`qr`/signature fields.
- Required WCAG 2.5.7 keyboard alternative: numeric X/Y/W/H inputs with
  arrow-key nudge, sharing the exact same geometry math as the drag
  interaction (one source of truth, not two implementations that could
  drift).
- Live browser preview using the same fonts/CSS variables the server
  renderer uses.
- Wired into the existing wizard as step 4 (custom path) alongside the
  unchanged M3 default-template one-click path.

## M5 — Claim, mint, verify, revoke

- Idempotent claim-submit pipeline: render -> notary co-sign -> student
  sign -> confirm -> mint (Metaplex Core, soulbound: permanent-freeze +
  permanent-burn-delegate plugins) -> `record_asset` -> mirror sync. Safely
  re-POSTable at any step.
- Public verify page: smart input (address / SHA-256 hash / uploaded PNG,
  with jsQR fallback for re-encoded screenshots), OG tags, browser-side
  chain re-check layered over the server-painted verdict.
- Admin revoke flow (2-distinct-admin, plus a best-effort NFT burn that
  never blocks the REVOKED verdict on failure).
- Fix round 1: the verify chain-stamp previously could show a green banner
  on a revoked-but-stale-mirror certificate (the root of the bug M7's
  `VerifyStatusBanner` closed more completely); a stuck "Emitindo NFT…"
  terminal state now retries automatically.

## M4 — Mass sign

- `/certificator` inbox, grouped by edition, with select-all and per-row
  selection.
- Batched `sign_certificate` instructions, chunked to fit one transaction
  (≤20 certs, size-guarded against the 1232-byte transaction limit),
  submitted as one wallet interaction per distinct signer wallet — one
  Phantom popup for a whole batch in the common single-wallet case.
- Chain-truthful progress (refetch-driven, never a client-side counter);
  resuming after a partial failure just re-queries a smaller inbox.
- Fix round 1: checkbox hit target raised to the WCAG 2.5.8 24px minimum;
  a batch spanning editions with different signer wallets now signs each
  wallet's chunks correctly instead of using the first edition's wallet for
  everything.

## M3 — App core

- Privy auth wired end-to-end (`/api/auth/sync`, `/api/me` role resolution).
- Editions browse/detail (public, RSC).
- Admin creation wizard, default-template one-click path.
- Request-certificate flow with the shared name-sanitization schema.
- `/me` student dashboard with a per-signer status timeline.
- Fix round 1: server-side key-path resolution (`.keys/*.json` is
  repo-root-relative; the app's runtime cwd is `apps/web/`) and an
  auth-cookie naming mismatch between the middleware and the identity-token
  verification.

## M2 — Renderer

- `lib/render.ts`: satori -> resvg pipeline, deterministic (pinned engine
  versions, committed fonts, no clock reads, canonicalized layout JSON).
  Verified via a double-render byte-identity test.
- Committed default Superteam BR template (1600×1131, generated once,
  hash pinned) with a pre-positioned default layout.
- Canonical layout JSON schema + `spec_hash` computation (the single
  on-chain pin for template + layout + signer identity).

## M1 — Program, client, deploy

- `programs/certify`: the full Pinocchio program — `Config`/`Edition`/
  `Certificate`/`HashIndex` accounts, 13 instructions, the merged
  reject-with-refund flow, notary-cosigned claim, 2-distinct-admin
  destructive-op threshold, per-instruction CU budgets asserted as
  regression gates in tests. Zero `unsafe`, zero heap allocation,
  `#![no_std]`.
- `packages/certify-client`: hand-written `@solana/kit` codec client (no
  Anchor IDL exists under Pinocchio) — instruction builders, PDA helpers,
  account decoders, golden-vector tested against real on-chain account
  dumps.
- Deployed to devnet: program `5Wx1mNKSgtu1pnwHgLe5duYK9xcFhEhsd1zoeJi9EiUZ`,
  Config PDA `9CSuxJvqPh3j6WYbyAxryCoBfEVCs6YgYnHqzm98gNeZ`, global Metaplex
  Core collection `H19Fbhh3ubVvisRauUrcsU2ZnAe6S8U46PQYFRsbmc5z`.
- Fix round 1 (opus review): blocked a same-transaction `[reject,
  re-request]` revival exploit (closing an account by zeroing its owner to
  the System Program let it be reinitialized within the same transaction;
  fixed by leaving the tombstone program-owned instead of closing it — the
  root cause the M7-documented "persistent-tombstone reject-grief" finding
  is a deliberate, adjudicated-acceptable side effect of).
- End-to-end devnet proof: request -> sign×2 -> claim (notary co-sign) ->
  mint -> `record_asset`, full round trip, real transactions.

## M0 — Foundation + de-risking spikes

- Pinocchio program workspace, pnpm monorepo, Next 15.5 + Tailwind 4 +
  shadcn scaffold, ESLint import fences enforcing the `lib/chain`/`lib/db`
  layering rules, dark-theme semantic tokens with contrast verified against
  the plan's two hard rules.
- Three de-risking spikes, all accepted: (A) Metaplex Core soulbound mint —
  freeze + burn-while-frozen delegate proven on devnet; (B) Privy embedded +
  external wallet batch-signing (partial — headless OTP can't complete, by
  design; the rest proven); (C) satori/resvg deterministic double-render.
- Two durable Claude Code skills authored for the rest of the build:
  `webapp-architecture` and `webapp-polish`.

---

Devnet only throughout. Mainnet deploy requires a separate session and
explicit user confirmation, per this repo's `CLAUDE.md` — not done, not
attempted.
