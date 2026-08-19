# Attendance NFTs — design spec

**Date:** 2026-08-19 · **Status:** approved (design approved in-session; spec transcribes it)
**Scope:** new subsection of the st-certify web app (`apps/web`) for POAP-like event collectibles.
**Naming rule:** UI copy says **"attendance NFT"** (pt: "NFT de presença") everywhere. Never "POAP".

## 1. Product summary

Whitelisted wallets ("creators") create attendance events. Creating an event generates a
**secret claim link** (`/attend/<token>`) the creator shares with participants. Anyone with
the link connects a wallet (Wallet Standard picker by default; Privy email login as
fallback), signs a message proving address ownership, and the **server mints a compressed
NFT to that wallet** — the operator key pays every fee. Participants need zero SOL.

Creator whitelist (env, initial values):

```
ATTENDANCE_CREATOR_WALLETS=ENn4h8RZGXfXhmU6LQKZtujWjddpvYhT4NXWhNacvHsb,B6pK7Txek2fcQDmNVBCQNB7WvbBfE1qZTWTHE8Bwqb2M
```

## 2. On-chain shape

- **Bubblegum v2 cNFTs** (`@metaplex-foundation/mpl-bubblegum@^5`, Umi-based like the
  existing cert mint). One **shared Merkle tree** owned by OPERATOR: depth 14, buffer 64,
  canopy 8 → 16,384 mints, ≈0.34 SOL one-time. Created by `scripts/create-attendance-tree.ts`
  (same style as existing deploy scripts); address in env `ATTENDANCE_MERKLE_TREE`.
- **Per-event MPL-Core collection** with the `BubblegumV2` plugin (required by `mintV2`),
  created server-side at event creation. `mpl-core` is already a dependency. OPERATOR is
  update/collection authority and signs mints. ≈0.003 SOL per event.
- `mintV2(umi, { collectionAuthority, leafOwner, merkleTree, coreCollection, metadata })`,
  `sellerFeeBasisPoints: 0`, no creators array, **transferable** (POAP semantics — no
  freeze/soulbound plugins in MVP).
- Event image + metadata JSON uploaded to Supabase storage (existing `lib/render/storage.ts`
  bucket pattern); metadata URI is the cNFT `uri`.
- **Asset ID resolves lazily.** `parseLeafFromMintV2Transaction` is only valid after
  finalization, so claim success returns on *confirmed* with the tx signature; a
  best-effort follow-up records the asset id (`attendance_claims.asset_id`) when available.
  The claim page links the explorer tx immediately and never blocks on the asset id.
- Reads: no DAS dependency in MVP. Claim state lives in our DB; wallets render the cNFT
  themselves. (Helius DAS remains available for future surfaces.)
- Devnet now, mainnet later — mirrors the rest of the project. Note: Bubblegum charges
  protocol fees on *certain* instructions; verify the current `mintV2` fee at
  implementation time and record it in `.env.example` comments.

## 3. Wallet connection & auth

- **New `lib/wallet/` client adapter** — the ONLY module importing `@wallet-standard/*`
  (`@wallet-standard/app` registry + `@wallet-standard/base` types; amended at plan time
  from `@wallet-standard/react`/`@solana/react` — the raw registry returns wallets whose
  features are directly callable, the exact pattern `hooks/useClaim.ts` already proves,
  and no client-side transactions exist to justify kit signers). Extends the ESLint
  `no-restricted-imports` fence the same way `@solana/*` is fenced to `lib/chain`.
  Exposes: wallet discovery hook, a small branded `<WalletPicker/>`, and message-sign
  helpers that work for both wallet-standard accounts and the Privy embedded wallet
  fallback (Privy registers embedded wallets on the same wallet-standard registry).
- **Privy fallback:** "No wallet? Continue with email" routes into the existing app-wide
  `PrivyProvider` (embedded Solana wallet, `useSignMessage`). No provider changes needed.
- **Ownership proof (SIWS-style):** server-issued single-use nonce (DB table, 5-minute TTL) →
  client signs a canonical message (domain, wallet, purpose, nonce, issued-at) →
  server verifies ed25519 signature. Server ALSO accepts a valid Privy identity-token
  session whose linked wallet matches the target wallet. Both forms normalize through one
  server helper `resolveProvedWallet()` — one trust boundary.
- **Creator sessions:** after SIWS verify, if the wallet is in `ATTENDANCE_CREATOR_WALLETS`,
  set an httpOnly HMAC-signed cookie (`attendance_session`: wallet + exp; secret
  `ATTENDANCE_SESSION_SECRET`). Server helper `requireAttendanceCreator()` gates creator
  routes. Wallets compare exact-case (base58), same as `lib/auth.ts`.
- **Participants get no attendance session** — the claim POST carries `{token, wallet,
  nonce, signature}`, or relies on the app-wide Privy cookie as the ownership proof.

## 4. Pages & API

Routes (new):

| Route | Kind | Purpose |
|---|---|---|
| `/events` | page (dynamic) | Creator dashboard: sign-in screen when no session; else event list + create form |
| `/attend/[token]` | page (dynamic) | Participant claim page |
| `POST /api/attendance/auth/nonce` | API | Issue SIWS nonce |
| `POST /api/attendance/auth/verify` | API | Verify signature; set creator session cookie |
| `GET /api/attendance/events` | API | List ALL events (whitelist is org-level, not multi-tenant) |
| `POST /api/attendance/events` | API | Create event (creator) |
| `POST /api/attendance/events/[id]` | API | Mutate via zod-validated body `{action: 'pause' \| 'resume' \| 'rotate'}` (creator) |
| `GET /api/attendance/claim/[token]` | API | Public event-card info by token (name, description, image, date, claimed/max, state) |
| `POST /api/attendance/claim` | API | The mint (see §6) |

- **Creator dashboard:** per event show claimed count, copy-link button, QR code
  (`qrcode` dep already present), open/paused toggle, rotate-link action (regenerates the
  token; old link dies). Create form fields: name, description, event date, image upload,
  optional max supply, optional claim deadline. Client-side React Query with
  focus-refetch (live-data rung 2); no polling.
- **Claim page:** event card → connect (WalletPicker, Privy fallback) → one
  "Mint attendance NFT" button → truthful pending ("Confirmando…") → success with explorer
  tx link + "check your wallet". Distinct states: invalid/rotated link, paused, supply
  exhausted, deadline passed, already claimed (with original tx link).
- **Nav:** add an "Events" item (i18n'd) pointing at `/events`.
- Both pages read Supabase per-request → must be dynamic (`force-dynamic` or
  request-scoped fetch) per the Vercel prerender gotcha already hit on `/editions`.
- Validation: zod schemas in `lib/attendance/schemas.ts`, imported by forms AND route
  handlers (parse at both trust boundaries; sanitization in schema transforms).

## 5. Data model — migration `0002_attendance.sql`

```
attendance_events
  id uuid pk, name text, description text, image_url text, metadata_uri text,
  collection_address text, event_date date, max_supply int null,
  claim_deadline timestamptz null, claim_open bool not null default true,
  claim_token text not null unique,        -- 16 random bytes, base64url (~128 bits)
  created_by_wallet text not null, minted_count int not null default 0,
  created_at timestamptz default now()

attendance_claims
  id uuid pk, event_id uuid fk, wallet text not null,
  status text not null check (status in ('pending','minted','failed')),
  tx_sig text null, asset_id text null, created_at timestamptz default now(),
  UNIQUE (event_id, wallet)

attendance_nonces
  nonce text pk, wallet text not null, expires_at timestamptz not null,
  used_at timestamptz null
```

- `claim_token` stored plaintext (dashboard must re-display "copy link" anytime); rotation
  is the leak remedy. Low-stakes collectibles justify retrievability over hash-at-rest.
- RLS: follow the `0001_init.sql` posture (service-role only access from the server).
- **Counter invariant:** `minted_count` counts claims in `{pending, minted}`. Increment
  atomically with `... SET minted_count = minted_count + 1 WHERE id = $1 AND claim_open
  AND (max_supply IS NULL OR minted_count < max_supply) RETURNING ...` on transition into
  `pending`; decrement on `pending → failed`. `UNIQUE(event_id, wallet)` is the
  one-per-wallet guard; supply enforcement never relies on `COUNT(*)`.

## 6. Claim flow (the critical write path)

1. `POST /api/attendance/claim` with `{token, wallet, nonce, signature}` (or Privy cookie).
2. Schema parse → `resolveProvedWallet()` → load event by token → check `claim_open`,
   deadline.
3. Upsert claim row: existing `minted` → `ATTENDANCE_ALREADY_CLAIMED` (returns original tx);
   existing `pending`/`failed` → adopt as retry (no second counter increment for `pending`;
   `failed` re-increments per the invariant); new → insert `pending` + atomic counter
   increment (failure → `ATTENDANCE_SUPPLY_EXHAUSTED` / `ATTENDANCE_CLOSED`).
4. `mintV2` … `sendAndConfirm` (operator pays; reuse retry-with-backoff from `mint.ts`).
5. Success: claim → `minted` + `tx_sig`; respond. Fire-and-forget asset-id resolution after
   finalization updates `asset_id`.
6. Mint failure: claim → `failed`, counter decrement, `AppError` with `retryable: true`.
   Retry re-derives nonce + signature client-side (redo closure, never replay a stale
   signed payload).

## 7. Errors & i18n

- `AppError` codes at throw sites: `ATTENDANCE_LINK_INVALID`, `ATTENDANCE_CLOSED`,
  `ATTENDANCE_SUPPLY_EXHAUSTED`, `ATTENDANCE_ALREADY_CLAIMED`, `ATTENDANCE_NOT_CREATOR`,
  `SIWS_NONCE_EXPIRED`, `SIWS_INVALID_SIGNATURE`. Server messages in pt-BR (existing API
  convention); client toasts/states i18n'd.
- New `attendance` dictionary domain in `apps/web/lib/i18n/dict/*` (pt source of truth,
  en/es typed against it), including all claim-page states and creator-dashboard copy.

## 8. Module layout (adapter law)

```
lib/chain/attendance.ts     server-only; ONLY importer of mpl-bubblegum;
                            createEventCollection(), mintAttendanceAsset();
                            reuses Umi/operator singleton + backoff from mint.ts
lib/wallet/                 client; ONLY importer of @wallet-standard/* (app + base)
lib/attendance/             use-cases, zod schemas, SIWS message build/verify (pure core)
lib/db/attendance-*.ts      queries/mutations (Supabase, service role)
components/attendance/      WalletPicker, event form, event list, claim card, states
```

New deps (in `apps/web/package.json`, NOT the workspace root — pnpm purge gotcha):
`@metaplex-foundation/mpl-bubblegum@^5`, `@metaplex-foundation/mpl-account-compression@^1`,
`@wallet-standard/app@^1`, `@wallet-standard/base@^1`.
New env: `ATTENDANCE_MERKLE_TREE`, `ATTENDANCE_CREATOR_WALLETS`,
`ATTENDANCE_SESSION_SECRET` (+ `.env.example` entries).

## 9. Testing

- Vitest units (existing `lib/__tests__` pattern): SIWS message canonicalization +
  signature verify (pure parts), claim-gating decision logic (open/deadline/supply/dedupe
  as a pure function), zod schemas, token generation length/charset.
- Devnet e2e script `scripts/e2e-attendance-devnet.ts` (existing e2e pattern): create tree
  (idempotent) → create event → claim-mint to a fresh wallet → assert claim row + tx.
- Gates: `pnpm typecheck`, `lint`, `test`, `build` all clean.

## 10. Non-goals (MVP)

Public event gallery; per-participant unique codes; soulbound enforcement
(`setNonTransferableV2` exists in Bubblegum v2 if wanted later); mainnet deploy; email
delivery of links; DAS-powered gallery of owned attendance NFTs.

## 11. Cost summary (mainnet-projected, all operator-paid)

Tree ≈0.34 SOL once (16,384 mints) · collection ≈0.003 SOL per event · mint ≈0.00001 SOL
+ tx fee per attendee. A 10,000-attendee year ≈ under 0.5 SOL total. Devnet today: free.
