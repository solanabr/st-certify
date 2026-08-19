# Attendance NFTs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new st-certify subsection where whitelisted wallets create attendance events and participants mint compressed NFTs through a secret claim link, with every fee paid by the operator key.

**Architecture:** Server-custodial minting (Bubblegum v2 cNFTs into one shared operator-owned Merkle tree; one MPL-Core collection per event). Participants prove wallet ownership with a SIWS-style signed message (wallet-standard `solana:signMessage` feature) or a matching Privy session; creators additionally get an HMAC-signed session cookie. All chain writes live in `lib/chain/attendance.ts`; all wallet-standard access lives in `lib/wallet/`; Supabase holds events/claims/nonces with an atomic SQL reserve function guarding supply.

**Tech Stack:** Next 15.5 (App Router, POST route handlers + `apiRoute` envelope), `@metaplex-foundation/mpl-bubblegum@^5` + existing Umi/mpl-core, `@wallet-standard/app` + `@wallet-standard/base`, Privy v3 (fallback only), Supabase (service role), zod 4, React Query 5, vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-attendance-nft-design.md`

## Global Constraints

- UI copy says **"attendance NFT"** (pt-BR: **"NFT de presença"**). The string "POAP" must not appear in UI or docs copy.
- Creator whitelist env (exact initial value): `ATTENDANCE_CREATOR_WALLETS=ENn4h8RZGXfXhmU6LQKZtujWjddpvYhT4NXWhNacvHsb,B6pK7Txek2fcQDmNVBCQNB7WvbBfE1qZTWTHE8Bwqb2M`
- New env vars: `ATTENDANCE_MERKLE_TREE`, `ATTENDANCE_CREATOR_WALLETS`, `ATTENDANCE_SESSION_SECRET`.
- Dependencies are added ONLY to `apps/web/package.json` or `scripts/package.json` (isolated install). NEVER to the workspace root `package.json` dependencies (pnpm full-purge trap). Root `package.json` **scripts** entries are safe to add.
- One write mechanism app-wide: POST route handlers wrapped in `apiRoute` from `apps/web/lib/api.ts`. No server actions.
- Error messages are written pt-BR at the throw site via `fail(code, message)`. Client-visible strings go through i18n dictionaries (pt-BR is source of truth; en/es typed against it).
- Import fences (ESLint `no-restricted-imports`): `@metaplex-foundation/mpl-bubblegum` + `@metaplex-foundation/mpl-account-compression` only under `lib/chain/**`; `@wallet-standard/*` only under `lib/wallet/**`; existing fences unchanged.
- Wallet addresses compare exact-case (base58). Never case-fold.
- Every new page that reads Supabase per-request declares `export const dynamic = "force-dynamic"`.
- Chain: devnet. Chain id string `"solana:devnet"`. Explorer link base: `https://explorer.solana.com/tx/<sig>?cluster=devnet`.
- Commands run from repo root: `pnpm --filter web typecheck`, `pnpm --filter web lint`, `pnpm --filter web test`, `pnpm --filter web build`. All must pass before each commit.
- Tests: vitest, colocated per-directory `__tests__/` (existing convention: `lib/__tests__`, `lib/chain/__tests__`, …).
- Conventional commits, scope `attendance`: e.g. `feat(attendance): siws message core`.
- Supabase project may be PAUSED (free tier). If `pnpm setup:supabase` cannot connect, STOP and ask the user to unpause the project in the Supabase dashboard — do not skip migration application silently.

## File Map

```
Create:
  supabase/migrations/0002_attendance.sql
  apps/web/lib/attendance/siws.ts, token.ts, gate.ts, verify-signature.ts,
    session.ts, metadata.ts, schemas.ts, storage.ts, proof.ts, require-creator.ts
  apps/web/lib/attendance/__tests__/*.test.ts
  apps/web/lib/chain/umi.ts            (extracted operator-Umi singleton)
  apps/web/lib/chain/attendance.ts     (ONLY importer of mpl-bubblegum)
  apps/web/lib/db/attendance-queries.ts, attendance-mutations.ts
  apps/web/lib/wallet/registry.ts, features.ts, index.ts, __tests__/features.test.ts
  apps/web/hooks/useWalletProof.ts, useAttendanceEvents.ts, useAttendanceClaim.ts
  apps/web/components/attendance/wallet-picker.tsx, creator-signin.tsx,
    event-form.tsx, event-list.tsx, claim-card.tsx
  apps/web/app/events/page.tsx
  apps/web/app/attend/[token]/page.tsx
  apps/web/app/api/attendance/auth/nonce/route.ts, auth/verify/route.ts
  apps/web/app/api/attendance/events/route.ts, events/[id]/route.ts
  apps/web/app/api/attendance/claim/route.ts, claim/[token]/route.ts
  apps/web/lib/i18n/dict/attendance.ts
  scripts/create-attendance-tree.ts, scripts/e2e-attendance-devnet.ts
Modify:
  apps/web/package.json                 (deps)
  apps/web/eslint.config.mjs            (fences)
  apps/web/lib/errors.ts                (codes) + apps/web/lib/api.ts (status map)
  apps/web/lib/chain/mint.ts            (consume lib/chain/umi.ts)
  apps/web/lib/db/types.ts              (row types)
  apps/web/lib/i18n/dictionaries.ts     (merge dict) + dict/common.ts (nav.events)
  apps/web/components/nav.tsx           (Events link)
  scripts/setup-supabase.ts             (add "attendance" bucket)
  scripts/package.json                  (bubblegum deps)
  package.json (root)                   (scripts entries ONLY)
  .env.example, .env.vercel             (new envs)
  README.md, CHANGELOG.md               (ripple, final task)
```

---

### Task 1: Dependencies, env, ESLint fences, error codes

**Files:**
- Modify: `apps/web/package.json` (via pnpm)
- Modify: `apps/web/eslint.config.mjs`
- Modify: `apps/web/lib/errors.ts`
- Modify: `apps/web/lib/api.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `AppErrorCode` gains `"ATTENDANCE_LINK_INVALID" | "ATTENDANCE_CLOSED" | "ATTENDANCE_SUPPLY_EXHAUSTED" | "ATTENDANCE_ALREADY_CLAIMED" | "ATTENDANCE_NOT_CREATOR" | "SIWS_NONCE_EXPIRED" | "SIWS_INVALID_SIGNATURE"` — every later task throws these via `fail()`.

- [ ] **Step 1: Install web deps**

```bash
pnpm --filter web add @metaplex-foundation/mpl-bubblegum@^5 @metaplex-foundation/mpl-account-compression@^1 @wallet-standard/app@^1 @wallet-standard/base@^1
```

- [ ] **Step 2: Extend ESLint fences**

In `apps/web/eslint.config.mjs`, add next to the existing `RESTRICTED_*` consts:

```js
const RESTRICTED_BUBBLEGUM = {
  name: "@metaplex-foundation/mpl-bubblegum",
  message: "Import mpl-bubblegum only under lib/chain/**.",
};
const RESTRICTED_ACCOUNT_COMPRESSION = {
  name: "@metaplex-foundation/mpl-account-compression",
  message: "Import mpl-account-compression only under lib/chain/**.",
};
const RESTRICTED_WALLET_STANDARD = {
  group: ["@wallet-standard/*"],
  message: "Import @wallet-standard/* only under lib/wallet/**.",
};
```

Wire them in (patterns is a sibling of paths in the same rule options object):

```js
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            RESTRICTED_KIT,
            RESTRICTED_CLIENT,
            RESTRICTED_SUPABASE,
            RESTRICTED_BUBBLEGUM,
            RESTRICTED_ACCOUNT_COMPRESSION,
          ],
          patterns: [RESTRICTED_WALLET_STANDARD],
        },
      ],
    },
  },
  {
    files: ["lib/chain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [RESTRICTED_SUPABASE], patterns: [RESTRICTED_WALLET_STANDARD] },
      ],
    },
  },
  {
    files: ["lib/db/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [RESTRICTED_KIT, RESTRICTED_CLIENT, RESTRICTED_BUBBLEGUM, RESTRICTED_ACCOUNT_COMPRESSION],
          patterns: [RESTRICTED_WALLET_STANDARD],
        },
      ],
    },
  },
  {
    files: ["lib/wallet/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            RESTRICTED_KIT,
            RESTRICTED_CLIENT,
            RESTRICTED_SUPABASE,
            RESTRICTED_BUBBLEGUM,
            RESTRICTED_ACCOUNT_COMPRESSION,
          ],
        },
      ],
    },
  },
```

(The `lib/chain` and `lib/db` scoped blocks REPLACE the existing two so bubblegum stays importable under `lib/chain` and nothing else changes.)

- [ ] **Step 3: Add error codes**

In `apps/web/lib/errors.ts`, extend the union after `"STORAGE_FAILED"`:

```ts
  | "ATTENDANCE_LINK_INVALID"
  | "ATTENDANCE_CLOSED"
  | "ATTENDANCE_SUPPLY_EXHAUSTED"
  | "ATTENDANCE_ALREADY_CLAIMED"
  | "ATTENDANCE_NOT_CREATOR"
  | "SIWS_NONCE_EXPIRED"
  | "SIWS_INVALID_SIGNATURE"
```

In `apps/web/lib/api.ts` `STATUS_BY_CODE`, add:

```ts
  ATTENDANCE_LINK_INVALID: 404,
  ATTENDANCE_CLOSED: 409,
  ATTENDANCE_SUPPLY_EXHAUSTED: 409,
  ATTENDANCE_ALREADY_CLAIMED: 409,
  ATTENDANCE_NOT_CREATOR: 403,
  SIWS_NONCE_EXPIRED: 401,
  SIWS_INVALID_SIGNATURE: 401,
```

- [ ] **Step 4: Env examples**

Append to `.env.example`:

```
# --- Attendance NFTs ---
# Shared Bubblegum v2 Merkle tree (created by `pnpm tree:attendance`; depth 14 / buffer 64 / canopy 8)
ATTENDANCE_MERKLE_TREE=
# Wallets allowed to create attendance events (comma-separated, exact-case base58)
ATTENDANCE_CREATOR_WALLETS=ENn4h8RZGXfXhmU6LQKZtujWjddpvYhT4NXWhNacvHsb,B6pK7Txek2fcQDmNVBCQNB7WvbBfE1qZTWTHE8Bwqb2M
# HMAC secret for the creator session cookie (32+ random bytes, e.g. `openssl rand -base64 32`)
ATTENDANCE_SESSION_SECRET=
```

Also generate a real `ATTENDANCE_SESSION_SECRET` into the local `.env` (`openssl rand -base64 32`) and copy `ATTENDANCE_CREATOR_WALLETS` there.

- [ ] **Step 5: Gates + commit**

```bash
pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test
git add apps/web/package.json apps/web/eslint.config.mjs apps/web/lib/errors.ts apps/web/lib/api.ts .env.example pnpm-lock.yaml
git commit -m "feat(attendance): deps, import fences, error codes, env scaffolding"
```

---

### Task 2: Migration 0002 — tables, reserve/release functions, bucket

**Files:**
- Create: `supabase/migrations/0002_attendance.sql`
- Modify: `apps/web/lib/db/types.ts`
- Modify: `scripts/setup-supabase.ts` (BUCKETS const)

**Interfaces:**
- Produces (SQL): `attendance_events`, `attendance_claims`, `attendance_nonces` tables; `attendance_reserve_claim(p_event_id uuid, p_wallet text) → (outcome text, claim_id uuid, existing_tx_sig text)`; `attendance_release_claim(p_claim_id uuid) → void`.
- Produces (TS, in `lib/db/types.ts`):

```ts
export type AttendanceClaimStatus = "pending" | "minted" | "failed";
export type ReserveOutcome = "reserved" | "retry" | "already_claimed" | "exhausted";

export interface AttendanceEventRow {
  id: string;
  name: string;
  description: string;
  image_url: string;
  metadata_uri: string;
  collection_address: string;
  event_date: string;           // ISO date
  max_supply: number | null;
  claim_deadline: string | null; // ISO timestamptz
  claim_open: boolean;
  claim_token: string;
  created_by_wallet: string;
  minted_count: number;
  created_at: string;
}

export interface AttendanceClaimRow {
  id: string;
  event_id: string;
  wallet: string;
  status: AttendanceClaimStatus;
  tx_sig: string | null;
  asset_id: string | null;
  created_at: string;
}
```

- [ ] **Step 1: Write the migration** (idempotent — `setup-supabase.ts` re-runs every file)

```sql
-- Attendance NFTs: events, claims, SIWS nonces.
-- Counter invariant: attendance_events.minted_count counts claims in
-- {pending, minted}. It is only changed by the two functions below.
-- Access is service-role only (same posture as 0001).

create table if not exists attendance_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  image_url text not null,
  metadata_uri text not null,
  collection_address text not null,
  event_date date not null,
  max_supply integer,
  claim_deadline timestamptz,
  claim_open boolean not null default true,
  claim_token text not null unique,
  created_by_wallet text not null,
  minted_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists attendance_claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references attendance_events (id) on delete cascade,
  wallet text not null,
  status text not null default 'pending'
    check (status in ('pending', 'minted', 'failed')),
  tx_sig text,
  asset_id text,
  created_at timestamptz not null default now(),
  unique (event_id, wallet)
);

create index if not exists attendance_claims_event_idx
  on attendance_claims (event_id);

create table if not exists attendance_nonces (
  nonce text primary key,
  wallet text not null,
  purpose text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Atomically reserve a claim slot. Outcomes:
--   'reserved'        → new/retried pending claim; caller mints
--   'retry'           → a pending claim already exists (mint in flight or crashed); caller mints again
--   'already_claimed' → returns the original tx_sig
--   'exhausted'       → no capacity left (or claiming closed via claim_open=false is checked in TS)
create or replace function attendance_reserve_claim(p_event_id uuid, p_wallet text)
returns table (outcome text, claim_id uuid, existing_tx_sig text)
language plpgsql
as $$
declare
  v_claim attendance_claims%rowtype;
  v_updated int;
begin
  select * into v_claim from attendance_claims
    where event_id = p_event_id and wallet = p_wallet
    for update;

  if found then
    if v_claim.status = 'minted' then
      return query select 'already_claimed'::text, v_claim.id, v_claim.tx_sig;
      return;
    elsif v_claim.status = 'pending' then
      return query select 'retry'::text, v_claim.id, null::text;
      return;
    else
      -- failed → needs a fresh capacity slot (it was released on failure)
      update attendance_events
        set minted_count = minted_count + 1
        where id = p_event_id
          and (max_supply is null or minted_count < max_supply);
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        return query select 'exhausted'::text, null::uuid, null::text;
        return;
      end if;
      update attendance_claims
        set status = 'pending', tx_sig = null
        where id = v_claim.id;
      return query select 'reserved'::text, v_claim.id, null::text;
      return;
    end if;
  end if;

  update attendance_events
    set minted_count = minted_count + 1
    where id = p_event_id
      and (max_supply is null or minted_count < max_supply);
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return query select 'exhausted'::text, null::uuid, null::text;
    return;
  end if;

  insert into attendance_claims (event_id, wallet, status)
    values (p_event_id, p_wallet, 'pending')
    returning * into v_claim;
  return query select 'reserved'::text, v_claim.id, null::text;
end;
$$;

-- Release a pending claim after a failed mint: mark failed + free the slot.
create or replace function attendance_release_claim(p_claim_id uuid)
returns void
language plpgsql
as $$
declare
  v_event uuid;
begin
  update attendance_claims set status = 'failed'
    where id = p_claim_id and status = 'pending'
    returning event_id into v_event;
  if v_event is not null then
    update attendance_events
      set minted_count = greatest(minted_count - 1, 0)
      where id = v_event;
  end if;
end;
$$;
```

Concurrency note (document as a comment in `attendance-mutations.ts`, Task 8): two first-time claims for the same `(event, wallet)` can both pass the `for update` lookup (no row yet); the loser's `insert` hits the unique constraint and its whole function transaction (including its counter increment) rolls back. The TS wrapper catches Postgres error `23505` and calls the function once more — the second call finds the row and returns `retry`/`already_claimed`.

- [ ] **Step 2: Add the storage bucket**

In `scripts/setup-supabase.ts` change `BUCKETS` to include the new public bucket:

```ts
const BUCKETS = ["templates", "certs", "metadata", "attendance"] as const;
```

- [ ] **Step 3: Add the row types** to `apps/web/lib/db/types.ts` exactly as in the Interfaces block above.

- [ ] **Step 4: Apply**

```bash
pnpm setup:supabase
```

Expected: `Aplicando migration: 0001_init.sql`, `Aplicando migration: 0002_attendance.sql`, bucket creation logs. If the connection fails (Supabase free tier pauses when idle), STOP and ask the user to unpause project `lgqrcnitebagfawyawcq` in the dashboard, then re-run.

- [ ] **Step 5: Gates + commit**

```bash
pnpm --filter web typecheck && pnpm --filter web lint
git add supabase/migrations/0002_attendance.sql apps/web/lib/db/types.ts scripts/setup-supabase.ts
git commit -m "feat(attendance): schema, atomic reserve/release, attendance bucket"
```

---

### Task 3: SIWS message core (pure, TDD)

**Files:**
- Create: `apps/web/lib/attendance/siws.ts`
- Test: `apps/web/lib/attendance/__tests__/siws.test.ts`

**Interfaces:**
- Produces:

```ts
export type SiwsPurpose = "attendance-claim" | "attendance-creator";
export interface SiwsFields {
  domain: string;
  wallet: string;
  purpose: SiwsPurpose;
  nonce: string;
  issuedAt: string; // ISO
}
export const SIWS_MAX_AGE_MS = 300_000;
export function buildSiwsMessage(fields: SiwsFields): string;
export function parseSiwsMessage(message: string): SiwsFields | null;
export function isSiwsFresh(issuedAt: string, now?: Date): boolean;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildSiwsMessage,
  isSiwsFresh,
  parseSiwsMessage,
  SIWS_MAX_AGE_MS,
} from "../siws";

const FIELDS = {
  domain: "certify.superteam.digital",
  wallet: "ENn4h8RZGXfXhmU6LQKZtujWjddpvYhT4NXWhNacvHsb",
  purpose: "attendance-claim" as const,
  nonce: "abc123nonce",
  issuedAt: "2026-08-19T12:00:00.000Z",
};

describe("siws", () => {
  it("round-trips build → parse", () => {
    expect(parseSiwsMessage(buildSiwsMessage(FIELDS))).toEqual(FIELDS);
  });

  it("rejects a tampered wallet line", () => {
    const msg = buildSiwsMessage(FIELDS).replace(FIELDS.wallet, "Attacker111");
    const parsed = parseSiwsMessage(msg);
    expect(parsed?.wallet).toBe("Attacker111"); // parse is honest…
    expect(parsed).not.toEqual(FIELDS); // …comparison happens at the caller
  });

  it("rejects garbage and unknown purposes", () => {
    expect(parseSiwsMessage("hello")).toBeNull();
    const msg = buildSiwsMessage({ ...FIELDS }).replace(
      "attendance-claim",
      "other-thing",
    );
    expect(parseSiwsMessage(msg)).toBeNull();
  });

  it("freshness window", () => {
    const now = new Date("2026-08-19T12:04:59.000Z");
    expect(isSiwsFresh(FIELDS.issuedAt, now)).toBe(true);
    const stale = new Date(Date.parse(FIELDS.issuedAt) + SIWS_MAX_AGE_MS + 1);
    expect(isSiwsFresh(FIELDS.issuedAt, stale)).toBe(false);
    expect(isSiwsFresh("not-a-date", now)).toBe(false);
    // future-dated messages are not fresh
    expect(isSiwsFresh("2026-08-19T13:00:00.000Z", now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter web test -- lib/attendance/__tests__/siws.test.ts`
Expected: FAIL (module `../siws` not found).

- [ ] **Step 3: Implement**

```ts
// SIWS-style ownership-proof message. Pure: no I/O, unit-tested. The server
// builds this exact text (auth/nonce route), the wallet signs it, and the
// server re-parses + verifies on submit. pt-BR on purpose — it is shown
// verbatim inside wallet signing prompts to Brazilian users.
export type SiwsPurpose = "attendance-claim" | "attendance-creator";

export interface SiwsFields {
  domain: string;
  wallet: string;
  purpose: SiwsPurpose;
  nonce: string;
  issuedAt: string;
}

export const SIWS_MAX_AGE_MS = 300_000;

const PURPOSES: readonly SiwsPurpose[] = [
  "attendance-claim",
  "attendance-creator",
];

export function buildSiwsMessage(f: SiwsFields): string {
  return [
    `${f.domain} quer confirmar a posse da sua carteira.`,
    "",
    `Carteira: ${f.wallet}`,
    `Proposito: ${f.purpose}`,
    `Nonce: ${f.nonce}`,
    `Emitido em: ${f.issuedAt}`,
  ].join("\n");
}

export function parseSiwsMessage(message: string): SiwsFields | null {
  const lines = message.split("\n");
  if (lines.length !== 6) return null;
  const domain = lines[0]?.match(
    /^(.+) quer confirmar a posse da sua carteira\.$/,
  )?.[1];
  const wallet = lines[2]?.match(/^Carteira: (.+)$/)?.[1];
  const purpose = lines[3]?.match(/^Proposito: (.+)$/)?.[1];
  const nonce = lines[4]?.match(/^Nonce: (.+)$/)?.[1];
  const issuedAt = lines[5]?.match(/^Emitido em: (.+)$/)?.[1];
  if (!domain || !wallet || !purpose || !nonce || !issuedAt) return null;
  if (!PURPOSES.includes(purpose as SiwsPurpose)) return null;
  return { domain, wallet, purpose: purpose as SiwsPurpose, nonce, issuedAt };
}

export function isSiwsFresh(issuedAt: string, now: Date = new Date()): boolean {
  const t = Date.parse(issuedAt);
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  return age >= 0 && age <= SIWS_MAX_AGE_MS;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter web test -- lib/attendance/__tests__/siws.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/attendance/siws.ts apps/web/lib/attendance/__tests__/siws.test.ts
git commit -m "feat(attendance): siws message core"
```

---

### Task 4: Token generation + claim gate + ed25519 verify (pure, TDD)

**Files:**
- Create: `apps/web/lib/attendance/token.ts`, `apps/web/lib/attendance/gate.ts`, `apps/web/lib/attendance/verify-signature.ts`
- Test: `apps/web/lib/attendance/__tests__/token.test.ts`, `gate.test.ts`, `verify-signature.test.ts`

**Interfaces:**
- Produces:

```ts
// token.ts
export function generateClaimToken(): string; // 16 random bytes, base64url (~22 chars)
export function generateNonce(): string;      // same shape

// gate.ts
export interface GateInput { claim_open: boolean; claim_deadline: string | null; }
export type ClaimGate =
  | { ok: true }
  | { ok: false; code: "ATTENDANCE_CLOSED"; message: string };
export function checkClaimGate(event: GateInput, now?: Date): ClaimGate;

// verify-signature.ts
export function decodeBase58(value: string): Uint8Array; // throws on bad chars
export function verifyWalletSignature(
  walletBase58: string,
  message: Uint8Array,
  signature: Uint8Array,
): boolean;
```

- [ ] **Step 1: Write the failing tests**

`token.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateClaimToken, generateNonce } from "../token";

describe("token", () => {
  it("is base64url and long enough", () => {
    const t = generateClaimToken();
    expect(t.length).toBeGreaterThanOrEqual(22);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("does not collide over 1000 draws", () => {
    const seen = new Set(Array.from({ length: 1000 }, generateClaimToken));
    expect(seen.size).toBe(1000);
    expect(generateNonce()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
```

`gate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkClaimGate } from "../gate";

const NOW = new Date("2026-08-19T12:00:00Z");

describe("checkClaimGate", () => {
  it("open event with no deadline passes", () => {
    expect(checkClaimGate({ claim_open: true, claim_deadline: null }, NOW)).toEqual({ ok: true });
  });

  it("paused event fails ATTENDANCE_CLOSED", () => {
    const r = checkClaimGate({ claim_open: false, claim_deadline: null }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ATTENDANCE_CLOSED");
  });

  it("passed deadline fails, future deadline passes", () => {
    expect(
      checkClaimGate({ claim_open: true, claim_deadline: "2026-08-19T11:59:59Z" }, NOW).ok,
    ).toBe(false);
    expect(
      checkClaimGate({ claim_open: true, claim_deadline: "2026-08-19T12:00:01Z" }, NOW).ok,
    ).toBe(true);
  });
});
```

`verify-signature.test.ts` (node:crypto can generate ed25519 keys; a Solana address is the base58 of the raw 32-byte public key):

```ts
import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeBase58, verifyWalletSignature } from "../verify-signature";

// base58-encode for the test only (inverse of decodeBase58)
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(bytes: Uint8Array): string {
  let n = BigInt(0);
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b === 0) out = "1" + out; else break; }
  return out;
}

describe("verifyWalletSignature", () => {
  it("accepts a valid signature and rejects tampering", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const raw = new Uint8Array(
      publicKey.export({ format: "der", type: "spki" }).subarray(-32),
    );
    const wallet = encodeBase58(raw);
    const message = new TextEncoder().encode("hello attendance");
    const signature = new Uint8Array(edSign(null, message, privateKey));

    expect(verifyWalletSignature(wallet, message, signature)).toBe(true);
    expect(
      verifyWalletSignature(wallet, new TextEncoder().encode("tampered"), signature),
    ).toBe(false);
  });

  it("decodeBase58 round-trips and rejects bad chars", () => {
    expect(decodeBase58("11")).toEqual(new Uint8Array([0, 0]));
    expect(() => decodeBase58("0OIl")).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter web test -- lib/attendance/__tests__/`
Expected: FAIL — three new files, modules not found (siws tests keep passing).

- [ ] **Step 3: Implement**

`token.ts`:

```ts
import { randomBytes } from "node:crypto";

/** ~128 bits of entropy, URL-safe — the whole security of a claim link. */
export function generateClaimToken(): string {
  return randomBytes(16).toString("base64url");
}

export function generateNonce(): string {
  return randomBytes(16).toString("base64url");
}
```

`gate.ts`:

```ts
export interface GateInput {
  claim_open: boolean;
  claim_deadline: string | null;
}

export type ClaimGate =
  | { ok: true }
  | { ok: false; code: "ATTENDANCE_CLOSED"; message: string };

/** Pure gating decisions; supply + one-per-wallet are enforced atomically in SQL. */
export function checkClaimGate(
  event: GateInput,
  now: Date = new Date(),
): ClaimGate {
  if (!event.claim_open) {
    return {
      ok: false,
      code: "ATTENDANCE_CLOSED",
      message: "As reivindicações deste evento estão pausadas.",
    };
  }
  if (
    event.claim_deadline !== null &&
    now.getTime() > Date.parse(event.claim_deadline)
  ) {
    return {
      ok: false,
      code: "ATTENDANCE_CLOSED",
      message: "O período de reivindicação deste evento terminou.",
    };
  }
  return { ok: true };
}
```

`verify-signature.ts`:

```ts
import { createPublicKey, verify as edVerify } from "node:crypto";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX = new Map(Array.from(ALPHABET, (c, i) => [c, BigInt(i)]));
/** SPKI DER prefix for a raw ed25519 public key (RFC 8410). */
const DER_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function decodeBase58(value: string): Uint8Array {
  let n = 0n;
  for (const c of value) {
    const i = INDEX.get(c);
    if (i === undefined) throw new Error(`caractere base58 inválido: ${c}`);
    n = n * 58n + i;
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const c of value) {
    if (c === "1") bytes.unshift(0);
    else break;
  }
  return new Uint8Array(bytes);
}

/** Verifies an ed25519 signature against a base58 Solana address. Never throws. */
export function verifyWalletSignature(
  walletBase58: string,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    const raw = decodeBase58(walletBase58);
    if (raw.length !== 32 || signature.length !== 64) return false;
    const key = createPublicKey({
      key: Buffer.concat([DER_PREFIX, Buffer.from(raw)]),
      format: "der",
      type: "spki",
    });
    return edVerify(null, Buffer.from(message), key, Buffer.from(signature));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter web test -- lib/attendance/__tests__/`
Expected: PASS (all attendance tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/attendance/token.ts apps/web/lib/attendance/gate.ts apps/web/lib/attendance/verify-signature.ts apps/web/lib/attendance/__tests__/
git commit -m "feat(attendance): claim token, gate logic, ed25519 verification"
```

---

### Task 5: Zod schemas + metadata builder (pure, TDD)

**Files:**
- Create: `apps/web/lib/attendance/schemas.ts`, `apps/web/lib/attendance/metadata.ts`
- Test: `apps/web/lib/attendance/__tests__/schemas.test.ts`, `metadata.test.ts`

**Interfaces:**
- Produces:

```ts
// schemas.ts — shared by forms AND route handlers (parse at both boundaries)
export const createEventSchema: z.ZodType<...>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
// { name: string(1..32, trimmed); description: string(0..500, trimmed);
//   eventDate: string (YYYY-MM-DD); imageDataUrl: string (data:image/png|jpeg|webp;base64, ≤ 2MB decoded);
//   maxSupply?: number int 1..10000; claimDeadline?: string ISO datetime }

export const claimSchema: ...;   // { token: string(10..); wallet: base58(32..44); message?: string; signatureBase64?: string }
export type ClaimInput = z.infer<typeof claimSchema>;

export const eventActionSchema: ...; // { action: "pause" | "resume" | "rotate" }
export const authNonceSchema: ...;   // { wallet: base58; purpose: "attendance-claim" | "attendance-creator" }
export const authVerifySchema: ...;  // { wallet: base58; message: string; signatureBase64: string }

export const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// metadata.ts
export interface AttendanceMetadataInput {
  name: string; description: string; imageUrl: string;
  eventDate: string; eventId: string;
}
export function buildAttendanceMetadata(i: AttendanceMetadataInput): {
  name: string; description: string; image: string;
  attributes: { trait_type: string; value: string }[];
};
```

- [ ] **Step 1: Write the failing tests**

`schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { claimSchema, createEventSchema, eventActionSchema } from "../schemas";

const WALLET = "ENn4h8RZGXfXhmU6LQKZtujWjddpvYhT4NXWhNacvHsb";
const TINY_PNG = `data:image/png;base64,${Buffer.from("png!").toString("base64")}`;

describe("createEventSchema", () => {
  const valid = {
    name: "  Meetup SP  ",
    description: "Encontro mensal",
    eventDate: "2026-09-01",
    imageDataUrl: TINY_PNG,
    maxSupply: 100,
  };

  it("trims and accepts a valid input", () => {
    const r = createEventSchema.parse(valid);
    expect(r.name).toBe("Meetup SP");
    expect(r.claimDeadline).toBeUndefined();
  });

  it("rejects >32-char names, bad dates, oversized/wrong-type images", () => {
    expect(createEventSchema.safeParse({ ...valid, name: "x".repeat(33) }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...valid, eventDate: "01/09/2026" }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...valid, imageDataUrl: "data:image/gif;base64,AAAA" }).success).toBe(false);
    const big = `data:image/png;base64,${Buffer.alloc(2_100_000).toString("base64")}`;
    expect(createEventSchema.safeParse({ ...valid, imageDataUrl: big }).success).toBe(false);
  });
});

describe("claimSchema / eventActionSchema", () => {
  it("accepts signature and cookie-proof variants", () => {
    expect(claimSchema.safeParse({ token: "t".repeat(22), wallet: WALLET }).success).toBe(true);
    expect(
      claimSchema.safeParse({
        token: "t".repeat(22), wallet: WALLET, message: "m", signatureBase64: "aGk=",
      }).success,
    ).toBe(true);
    expect(claimSchema.safeParse({ token: "short", wallet: "not-base58" }).success).toBe(false);
  });

  it("action enum", () => {
    expect(eventActionSchema.safeParse({ action: "rotate" }).success).toBe(true);
    expect(eventActionSchema.safeParse({ action: "delete" }).success).toBe(false);
  });
});
```

`metadata.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAttendanceMetadata } from "../metadata";

describe("buildAttendanceMetadata", () => {
  it("shapes the offchain JSON", () => {
    const json = buildAttendanceMetadata({
      name: "Meetup SP",
      description: "Encontro mensal",
      imageUrl: "https://x/img.png",
      eventDate: "2026-09-01",
      eventId: "11111111-2222-3333-4444-555555555555",
    });
    expect(json).toEqual({
      name: "Meetup SP",
      description: "Encontro mensal",
      image: "https://x/img.png",
      attributes: [
        { trait_type: "event_date", value: "2026-09-01" },
        { trait_type: "event_id", value: "11111111-2222-3333-4444-555555555555" },
        { trait_type: "issuer", value: "Superteam Brasil" },
      ],
    });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter web test -- lib/attendance/__tests__/` → FAIL (new modules missing).

- [ ] **Step 3: Implement**

`schemas.ts`:

```ts
import { z } from "zod";

export const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const walletSchema = z.string().regex(BASE58_RE, "Carteira inválida.");

export const IMAGE_DATA_URL_RE =
  /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const imageDataUrlSchema = z.string().refine((v) => {
  const m = v.match(IMAGE_DATA_URL_RE);
  if (!m) return false;
  // base64 length → decoded byte estimate (no full decode on the hot path)
  return (m[2].length * 3) / 4 <= MAX_IMAGE_BYTES;
}, "Imagem inválida — use PNG, JPEG ou WebP de até 2MB.");

export const createEventSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(32, "Máximo de 32 caracteres."),
  description: z.string().trim().max(500, "Máximo de 500 caracteres.").default(""),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  imageDataUrl: imageDataUrlSchema,
  maxSupply: z.number().int().min(1).max(10_000).optional(),
  claimDeadline: z.iso.datetime({ offset: true }).optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const claimSchema = z.object({
  token: z.string().min(10),
  wallet: walletSchema,
  message: z.string().max(2_000).optional(),
  signatureBase64: z.string().max(200).optional(),
});
export type ClaimInput = z.infer<typeof claimSchema>;

export const eventActionSchema = z.object({
  action: z.enum(["pause", "resume", "rotate"]),
});
export type EventActionInput = z.infer<typeof eventActionSchema>;

export const authNonceSchema = z.object({
  wallet: walletSchema,
  purpose: z.enum(["attendance-claim", "attendance-creator"]),
});

export const authVerifySchema = z.object({
  wallet: walletSchema,
  message: z.string().max(2_000),
  signatureBase64: z.string().max(200),
});
```

(zod 4: `z.iso.datetime` is the v4 spelling — if typecheck complains in the installed version use `z.string().datetime({ offset: true })` instead.)

`metadata.ts`:

```ts
export interface AttendanceMetadataInput {
  name: string;
  description: string;
  imageUrl: string;
  eventDate: string;
  eventId: string;
}

/** Offchain JSON (Metaplex non-fungible standard) — the cNFT `uri` target. */
export function buildAttendanceMetadata(i: AttendanceMetadataInput): {
  name: string;
  description: string;
  image: string;
  attributes: { trait_type: string; value: string }[];
} {
  return {
    name: i.name,
    description: i.description,
    image: i.imageUrl,
    attributes: [
      { trait_type: "event_date", value: i.eventDate },
      { trait_type: "event_id", value: i.eventId },
      { trait_type: "issuer", value: "Superteam Brasil" },
    ],
  };
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm --filter web test -- lib/attendance/__tests__/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/attendance/schemas.ts apps/web/lib/attendance/metadata.ts apps/web/lib/attendance/__tests__/
git commit -m "feat(attendance): shared zod schemas and metadata builder"
```

---

### Task 6: Creator session cookie + proof resolution (TDD on pure parts)

**Files:**
- Create: `apps/web/lib/attendance/session.ts`, `apps/web/lib/attendance/proof.ts`, `apps/web/lib/attendance/require-creator.ts`
- Test: `apps/web/lib/attendance/__tests__/session.test.ts`, `proof.test.ts`

**Interfaces:**
- Consumes: `parseSiwsMessage`, `isSiwsFresh` (Task 3); `verifyWalletSignature` (Task 4); `parseAllowlist` from `@/lib/auth`; `getSessionUser` from `@/lib/auth`; `base64ToBytes` from `@/lib/bytes`; `consumeNonce` (Task 8 — injected as a dependency, so this task does NOT import it).
- Produces:

```ts
// session.ts (pure given a secret)
export const SESSION_COOKIE = "attendance_session";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export function sealSession(wallet: string, expiresAtMs: number, secret: string): string;
export function openSession(sealed: string, secret: string, now?: Date): { wallet: string } | null;

// proof.ts (server-only)
export interface ProofInput { wallet: string; message?: string; signatureBase64?: string; }
export interface ProofDeps {
  consumeNonce: (nonce: string, wallet: string) => Promise<boolean>;
  getSessionWallets: () => Promise<string[]>;
  expectedDomain: string;
  now?: Date;
}
export async function resolveProvedWallet(
  input: ProofInput, purpose: SiwsPurpose, deps: ProofDeps,
): Promise<string>; // returns wallet or throws AppError

// require-creator.ts (server-only)
export function creatorAllowlist(): Set<string>; // parseAllowlist(process.env.ATTENDANCE_CREATOR_WALLETS)
export async function getCreatorWallet(): Promise<string | null>; // cookie OR privy-session ∩ allowlist
export async function requireAttendanceCreator(): Promise<string>; // throws ATTENDANCE_NOT_CREATOR / UNAUTHORIZED
```

- [ ] **Step 1: Write the failing tests**

`session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { openSession, sealSession } from "../session";

const SECRET = "test-secret-please-rotate";
const WALLET = "ENn4h8RZGXfXhmU6LQKZtujWjddpvYhT4NXWhNacvHsb";

describe("session cookie", () => {
  it("round-trips", () => {
    const sealed = sealSession(WALLET, Date.now() + 60_000, SECRET);
    expect(openSession(sealed, SECRET)).toEqual({ wallet: WALLET });
  });

  it("rejects tampering, wrong secret, and expiry", () => {
    const sealed = sealSession(WALLET, Date.now() + 60_000, SECRET);
    expect(openSession(sealed.slice(0, -2) + "xx", SECRET)).toBeNull();
    expect(openSession(sealed, "other-secret")).toBeNull();
    const expired = sealSession(WALLET, Date.now() - 1, SECRET);
    expect(openSession(expired, SECRET)).toBeNull();
    expect(openSession("garbage", SECRET)).toBeNull();
  });
});
```

`proof.test.ts` (uses a real ed25519 keypair like Task 4's test; import `buildSiwsMessage` to make a valid message):

```ts
import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSiwsMessage } from "../siws";
import { resolveProvedWallet } from "../proof";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b === 0) out = "1" + out; else break; }
  return out;
}

function makeSigner() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = new Uint8Array(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
  return {
    wallet: encodeBase58(raw),
    sign: (msg: string) =>
      Buffer.from(edSign(null, new TextEncoder().encode(msg), privateKey)).toString("base64"),
  };
}

const DEPS = (over: Partial<Parameters<typeof resolveProvedWallet>[2]> = {}) => ({
  consumeNonce: async () => true,
  getSessionWallets: async () => [],
  expectedDomain: "unit.test",
  ...over,
});

describe("resolveProvedWallet", () => {
  it("accepts a valid signed message", async () => {
    const s = makeSigner();
    const message = buildSiwsMessage({
      domain: "unit.test", wallet: s.wallet, purpose: "attendance-claim",
      nonce: "n1", issuedAt: new Date().toISOString(),
    });
    await expect(
      resolveProvedWallet(
        { wallet: s.wallet, message, signatureBase64: s.sign(message) },
        "attendance-claim",
        DEPS(),
      ),
    ).resolves.toBe(s.wallet);
  });

  it("rejects wrong purpose, wrong domain, spent nonce, bad signature", async () => {
    const s = makeSigner();
    const mk = (purpose: "attendance-claim" | "attendance-creator", domain = "unit.test") =>
      buildSiwsMessage({ domain, wallet: s.wallet, purpose, nonce: "n1", issuedAt: new Date().toISOString() });

    const claimMsg = mk("attendance-claim");
    await expect(
      resolveProvedWallet({ wallet: s.wallet, message: mk("attendance-creator"), signatureBase64: s.sign(mk("attendance-creator")) }, "attendance-claim", DEPS()),
    ).rejects.toMatchObject({ code: "SIWS_INVALID_SIGNATURE" });
    await expect(
      resolveProvedWallet({ wallet: s.wallet, message: mk("attendance-claim", "evil.test"), signatureBase64: s.sign(mk("attendance-claim", "evil.test")) }, "attendance-claim", DEPS()),
    ).rejects.toMatchObject({ code: "SIWS_INVALID_SIGNATURE" });
    await expect(
      resolveProvedWallet({ wallet: s.wallet, message: claimMsg, signatureBase64: s.sign(claimMsg) }, "attendance-claim", DEPS({ consumeNonce: async () => false })),
    ).rejects.toMatchObject({ code: "SIWS_NONCE_EXPIRED" });
    await expect(
      resolveProvedWallet({ wallet: s.wallet, message: claimMsg, signatureBase64: Buffer.alloc(64).toString("base64") }, "attendance-claim", DEPS()),
    ).rejects.toMatchObject({ code: "SIWS_INVALID_SIGNATURE" });
  });

  it("falls back to the Privy session when no signature is sent", async () => {
    const s = makeSigner();
    await expect(
      resolveProvedWallet({ wallet: s.wallet }, "attendance-claim", DEPS({ getSessionWallets: async () => [s.wallet] })),
    ).resolves.toBe(s.wallet);
    await expect(
      resolveProvedWallet({ wallet: s.wallet }, "attendance-claim", DEPS()),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (modules missing).

- [ ] **Step 3: Implement**

`session.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "attendance_session";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function hmac(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

/** `base64url(wallet|expMs).base64url(hmac)` — no PII, nothing to decrypt. */
export function sealSession(
  wallet: string,
  expiresAtMs: number,
  secret: string,
): string {
  const payload = Buffer.from(`${wallet}|${expiresAtMs}`).toString("base64url");
  return `${payload}.${hmac(payload, secret).toString("base64url")}`;
}

export function openSession(
  sealed: string,
  secret: string,
  now: Date = new Date(),
): { wallet: string } | null {
  const [payload, mac] = sealed.split(".");
  if (!payload || !mac) return null;
  let given: Buffer;
  try {
    given = Buffer.from(mac, "base64url");
  } catch {
    return null;
  }
  const expected = hmac(payload, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  const [wallet, expRaw] = Buffer.from(payload, "base64url")
    .toString()
    .split("|");
  const exp = Number(expRaw);
  if (!wallet || !Number.isFinite(exp) || now.getTime() >= exp) return null;
  return { wallet };
}
```

`proof.ts` — NOTE: vitest imports this module, so do NOT add `import "server-only"` here (it touches no secrets itself; the secret-touching modules `require-creator.ts` and the routes carry it). This mirrors how `auth.ts` keeps `isAdminIdentity` testable.

```ts
import { fail } from "@/lib/errors";
import { base64ToBytes } from "@/lib/bytes";
import { isSiwsFresh, parseSiwsMessage, type SiwsPurpose } from "./siws";
import { verifyWalletSignature } from "./verify-signature";

export interface ProofInput {
  wallet: string;
  message?: string;
  signatureBase64?: string;
}

export interface ProofDeps {
  consumeNonce: (nonce: string, wallet: string) => Promise<boolean>;
  getSessionWallets: () => Promise<string[]>;
  expectedDomain: string;
  now?: Date;
}

/**
 * The ONE trust boundary for wallet ownership: either a SIWS-signed message
 * (wallet-standard signMessage) or a Privy session that links the wallet.
 */
export async function resolveProvedWallet(
  input: ProofInput,
  purpose: SiwsPurpose,
  deps: ProofDeps,
): Promise<string> {
  if (input.message !== undefined && input.signatureBase64 !== undefined) {
    const fields = parseSiwsMessage(input.message);
    if (
      !fields ||
      fields.purpose !== purpose ||
      fields.wallet !== input.wallet ||
      fields.domain !== deps.expectedDomain
    ) {
      fail("SIWS_INVALID_SIGNATURE", "Mensagem de assinatura inválida.");
    }
    if (!isSiwsFresh(fields.issuedAt, deps.now)) {
      fail("SIWS_NONCE_EXPIRED", "Assinatura expirada. Tente novamente.", {
        retryable: true,
      });
    }
    if (!(await deps.consumeNonce(fields.nonce, input.wallet))) {
      fail("SIWS_NONCE_EXPIRED", "Nonce expirado ou já utilizado. Tente novamente.", {
        retryable: true,
      });
    }
    const ok = verifyWalletSignature(
      input.wallet,
      new TextEncoder().encode(input.message),
      base64ToBytes(input.signatureBase64),
    );
    if (!ok) {
      fail("SIWS_INVALID_SIGNATURE", "Assinatura inválida para esta carteira.");
    }
    return input.wallet;
  }

  const sessionWallets = await deps.getSessionWallets();
  if (sessionWallets.includes(input.wallet)) {
    return input.wallet;
  }
  fail("UNAUTHORIZED", "Conecte e assine com sua carteira para continuar.", {
    action: "login",
  });
}
```

`require-creator.ts`:

```ts
import "server-only";

import { cookies } from "next/headers";
import { fail } from "@/lib/errors";
import { getSessionUser, parseAllowlist } from "@/lib/auth";
import { openSession, SESSION_COOKIE } from "./session";

export function creatorAllowlist(): Set<string> {
  return parseAllowlist(process.env.ATTENDANCE_CREATOR_WALLETS);
}

/** Creator identity: attendance session cookie, or a Privy session whose wallet is allowlisted. */
export async function getCreatorWallet(): Promise<string | null> {
  const allow = creatorAllowlist();
  const secret = process.env.ATTENDANCE_SESSION_SECRET;
  if (secret) {
    const jar = await cookies();
    const sealed = jar.get(SESSION_COOKIE)?.value;
    if (sealed) {
      const session = openSession(sealed, secret);
      if (session && allow.has(session.wallet)) return session.wallet;
    }
  }
  const privy = await getSessionUser();
  const match = privy?.wallets.find((w) => allow.has(w));
  return match ?? null;
}

export async function requireAttendanceCreator(): Promise<string> {
  const wallet = await getCreatorWallet();
  if (!wallet) {
    fail(
      "ATTENDANCE_NOT_CREATOR",
      "Apenas carteiras autorizadas podem gerenciar eventos.",
    );
  }
  return wallet;
}
```

(`parseAllowlist` is already exported from `apps/web/lib/auth.ts`. If `getSessionUser`'s `import "server-only"` breaks the vitest run for proof.test.ts, note that proof.ts does not import require-creator.ts — keep it that way.)

- [ ] **Step 4: Run to verify pass** — `pnpm --filter web test -- lib/attendance/__tests__/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/attendance/session.ts apps/web/lib/attendance/proof.ts apps/web/lib/attendance/require-creator.ts apps/web/lib/attendance/__tests__/
git commit -m "feat(attendance): creator session and wallet ownership proof"
```

---

### Task 7: Chain adapter — shared Umi + Bubblegum mint

**Files:**
- Create: `apps/web/lib/chain/umi.ts`, `apps/web/lib/chain/attendance.ts`
- Modify: `apps/web/lib/chain/mint.ts` (consume umi.ts; no behavior change)

**Interfaces:**
- Produces:

```ts
// lib/chain/umi.ts (server-only)
export function getOperatorUmi(): Umi; // operator identity+payer; mplCore + mplBubblegum + mplAccountCompression registered
export async function retryFetch<T>(fn: () => Promise<T>, attempts?: number, delayMs?: number): Promise<T>;

// lib/chain/attendance.ts (server-only; ONLY importer of mpl-bubblegum)
export async function createEventCollection(input: { name: string; metadataUri: string }): Promise<string>;
export async function mintAttendanceAsset(input: {
  coreCollection: string; owner: string; name: string; metadataUri: string;
}): Promise<{ txSig: string }>;
export async function resolveAttendanceAssetId(txSig: string): Promise<string | null>;
```

- [ ] **Step 1: Extract `lib/chain/umi.ts`**

Move `getUmi`, `retryFetch`, and `sleep` out of `mint.ts` VERBATIM (same env checks, same `fail` codes), renaming `getUmi` → `getOperatorUmi`, and register the two new plugins:

```ts
import "server-only";

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, type Umi } from "@metaplex-foundation/umi";
import { mplCore } from "@metaplex-foundation/mpl-core";
import { mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import { mplAccountCompression } from "@metaplex-foundation/mpl-account-compression";
import { fail } from "@/lib/errors";
import { loadKeypairBytes } from "@/lib/chain/server-tx";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;

let umiSingleton: Umi | null = null;

/** Umi with OPERATOR as identity + payer (funded; pays every attendance mint). */
export function getOperatorUmi(): Umi {
  if (!RPC_URL) {
    fail("CHAIN_RPC_UNAVAILABLE", "NEXT_PUBLIC_RPC_URL não configurado.");
  }
  const operatorEnv = process.env.OPERATOR_SECRET_KEY;
  if (!operatorEnv) {
    fail("INTERNAL", "OPERATOR_SECRET_KEY não configurado.");
  }
  if (!umiSingleton) {
    const umi = createUmi(RPC_URL)
      .use(mplCore())
      .use(mplBubblegum())
      .use(mplAccountCompression());
    const operatorKp = umi.eddsa.createKeypairFromSecretKey(
      loadKeypairBytes(operatorEnv),
    );
    umi.use(keypairIdentity(operatorKp));
    umiSingleton = umi;
  }
  return umiSingleton;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Spike-A read-after-write backoff: public devnet RPC needs ~7 tries at 1.5s. */
export async function retryFetch<T>(
  fn: () => Promise<T>,
  attempts = 8,
  delayMs = 1500,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
```

Update `mint.ts` to `import { getOperatorUmi, retryFetch } from "@/lib/chain/umi";`, delete its local `getUmi`/`retryFetch`/`sleep`, and replace `getUmi()` call sites with `getOperatorUmi()`. NOTHING else in mint.ts changes.

- [ ] **Step 2: Implement `lib/chain/attendance.ts`**

```ts
import "server-only";

// The ONLY module importing mpl-bubblegum. Server-custodial attendance mints:
// OPERATOR is tree creator, collection authority, and fee payer — participants
// pay nothing. Per-event MPL-Core collections carry the BubblegumV2 plugin
// (required by mintV2). Asset ids parse only after finalization, so
// resolveAttendanceAssetId is best-effort and callers never block on it.

import { generateSigner, publicKey, some } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { createCollection } from "@metaplex-foundation/mpl-core";
import {
  mintV2,
  parseLeafFromMintV2Transaction,
} from "@metaplex-foundation/mpl-bubblegum";
import { fail } from "@/lib/errors";
import { getOperatorUmi, retryFetch } from "@/lib/chain/umi";

function assertTreeConfigured(): string {
  const tree = process.env.ATTENDANCE_MERKLE_TREE;
  if (!tree) {
    fail(
      "CHAIN_PROGRAM_NOT_DEPLOYED",
      "Árvore de NFTs de presença não configurada (ATTENDANCE_MERKLE_TREE).",
      { retryable: true },
    );
  }
  return tree;
}

/** Creates the event's Core collection (BubblegumV2 plugin, operator authority). */
export async function createEventCollection(input: {
  name: string;
  metadataUri: string;
}): Promise<string> {
  const umi = getOperatorUmi();
  const collection = generateSigner(umi);
  await createCollection(umi, {
    collection,
    name: input.name,
    uri: input.metadataUri,
    plugins: [{ type: "BubblegumV2" }],
  }).sendAndConfirm(umi);
  return collection.publicKey.toString();
}

/** Mints one attendance cNFT to `owner`. Operator pays; participant signs nothing. */
export async function mintAttendanceAsset(input: {
  coreCollection: string;
  owner: string;
  name: string;
  metadataUri: string;
}): Promise<{ txSig: string }> {
  const tree = assertTreeConfigured();
  const umi = getOperatorUmi();
  const { signature } = await mintV2(umi, {
    collectionAuthority: umi.identity,
    leafOwner: publicKey(input.owner),
    merkleTree: publicKey(tree),
    coreCollection: publicKey(input.coreCollection),
    metadata: {
      name: input.name,
      uri: input.metadataUri,
      sellerFeeBasisPoints: 0,
      collection: some(publicKey(input.coreCollection)),
      creators: [],
    },
  }).sendAndConfirm(umi);
  return { txSig: base58.deserialize(signature)[0] };
}

/** Best-effort asset-id resolution — valid only after finalization; null until then. */
export async function resolveAttendanceAssetId(
  txSig: string,
): Promise<string | null> {
  try {
    const umi = getOperatorUmi();
    const leaf = await retryFetch(
      () => parseLeafFromMintV2Transaction(umi, base58.serialize(txSig)),
      3,
      4000,
    );
    return leaf.id.toString();
  } catch {
    return null;
  }
}
```

API-shape note for the implementer: `mintV2`/`createCollection`/`parseLeafFromMintV2Transaction` shapes above match mpl-bubblegum v5 docs and its test-suite usage (`collectionAuthority`, `leafOwner`, `merkleTree`, `coreCollection`, `MetadataArgsV2` with `collection: some(pubkey)`). If tsc disagrees on a field name, check `node_modules/@metaplex-foundation/mpl-bubblegum/dist/src/` types and adjust — do not fight the installed types.

- [ ] **Step 3: Gates** (no unit tests — chain I/O is covered by the devnet e2e in Task 15; the mint.ts refactor is covered by typecheck + existing suite)

Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test`
Expected: PASS, zero behavior diffs.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/chain/umi.ts apps/web/lib/chain/attendance.ts apps/web/lib/chain/mint.ts
git commit -m "feat(attendance): bubblegum chain adapter + shared operator umi"
```

---

### Task 8: DB queries/mutations + attendance storage

**Files:**
- Create: `apps/web/lib/db/attendance-mutations.ts`, `apps/web/lib/db/attendance-queries.ts`, `apps/web/lib/attendance/storage.ts`

**Interfaces:**
- Consumes: `getServiceClient`, `dbConfigured` from `@/lib/db/mutations`; row types from Task 2.
- Produces:

```ts
// attendance-mutations.ts (server-only)
export async function createNonce(wallet: string, purpose: string): Promise<{ nonce: string; issuedAt: string }>;
export async function consumeNonce(nonce: string, wallet: string): Promise<boolean>;
export async function insertEvent(input: {
  id?: string; // pre-generated UUID when metadata must reference it (see Task 9)
  name: string; description: string; imageUrl: string; metadataUri: string;
  collectionAddress: string; eventDate: string; maxSupply: number | null;
  claimDeadline: string | null; claimToken: string; createdByWallet: string;
}): Promise<AttendanceEventRow>;
export async function setClaimOpen(id: string, open: boolean): Promise<AttendanceEventRow>;
export async function rotateClaimToken(id: string, token: string): Promise<AttendanceEventRow>;
export interface ReserveResult { outcome: ReserveOutcome; claimId: string | null; existingTxSig: string | null; }
export async function reserveClaim(eventId: string, wallet: string): Promise<ReserveResult>;
export async function markClaimMinted(claimId: string, txSig: string): Promise<void>;
export async function releaseClaim(claimId: string): Promise<void>;
export async function updateClaimAsset(claimId: string, assetId: string): Promise<void>;

// attendance-queries.ts (server-only)
export async function listAttendanceEvents(): Promise<AttendanceEventRow[]>; // newest first
export async function getEventByToken(token: string): Promise<AttendanceEventRow | null>;
export async function getEventById(id: string): Promise<AttendanceEventRow | null>;
export async function getClaimByEventWallet(eventId: string, wallet: string): Promise<AttendanceClaimRow | null>;

// lib/attendance/storage.ts (server-only; uses getServiceClient like lib/render/storage.ts — does NOT import the supabase SDK)
export async function storeAttendanceImage(bytes: Buffer, contentType: "image/png" | "image/jpeg" | "image/webp"): Promise<string>; // public URL; throws STORAGE_FAILED
export async function storeAttendanceMetadata(json: unknown): Promise<string>;   // public URL; throws STORAGE_FAILED
```

- [ ] **Step 1: Implement mutations** — every function starts with `if (!dbConfigured) fail("INTERNAL", "Supabase não configurado.")`. Representative bodies (repeat the pattern for the rest):

```ts
import "server-only";

import { fail } from "@/lib/errors";
import { generateNonce } from "@/lib/attendance/token";
import { dbConfigured, getServiceClient } from "./mutations";
import type { AttendanceEventRow, ReserveOutcome } from "./types";

const NONCE_TTL_MS = 5 * 60 * 1000;

export async function createNonce(
  wallet: string,
  purpose: string,
): Promise<{ nonce: string; issuedAt: string }> {
  if (!dbConfigured) fail("INTERNAL", "Supabase não configurado.");
  const supabase = getServiceClient();
  const nonce = generateNonce();
  const issuedAt = new Date().toISOString();
  const { error } = await supabase.from("attendance_nonces").insert({
    nonce,
    wallet,
    purpose,
    expires_at: new Date(Date.now() + NONCE_TTL_MS).toISOString(),
  });
  if (error) fail("INTERNAL", "Falha ao emitir nonce.", { detail: error.message, retryable: true });
  return { nonce, issuedAt };
}

/** Single-use: flips used_at exactly once, only while unexpired and wallet-bound. */
export async function consumeNonce(nonce: string, wallet: string): Promise<boolean> {
  if (!dbConfigured) fail("INTERNAL", "Supabase não configurado.");
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("attendance_nonces")
    .update({ used_at: new Date().toISOString() })
    .eq("nonce", nonce)
    .eq("wallet", wallet)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("nonce");
  if (error) fail("INTERNAL", "Falha ao validar nonce.", { detail: error.message, retryable: true });
  return (data ?? []).length === 1;
}

/**
 * Atomic slot reservation via the SQL function (see 0002_attendance.sql).
 * A concurrent duplicate insert (23505) means another request won the row —
 * calling again returns its outcome.
 */
export async function reserveClaim(
  eventId: string,
  wallet: string,
): Promise<ReserveResult> {
  if (!dbConfigured) fail("INTERNAL", "Supabase não configurado.");
  const supabase = getServiceClient();
  const call = () =>
    supabase.rpc("attendance_reserve_claim", { p_event_id: eventId, p_wallet: wallet });
  let { data, error } = await call();
  if (error?.code === "23505") ({ data, error } = await call());
  if (error || !data?.[0]) {
    fail("INTERNAL", "Falha ao reservar reivindicação.", { detail: error?.message, retryable: true });
  }
  const row = data[0] as { outcome: ReserveOutcome; claim_id: string | null; existing_tx_sig: string | null };
  return { outcome: row.outcome, claimId: row.claim_id, existingTxSig: row.existing_tx_sig };
}
```

`insertEvent`/`setClaimOpen`/`rotateClaimToken` are single-table inserts/updates with `.select().single()` returning the row; `markClaimMinted` sets `{ status: "minted", tx_sig }`; `releaseClaim` calls `supabase.rpc("attendance_release_claim", { p_claim_id })`; `updateClaimAsset` sets `{ asset_id }`. All map errors with `fail("INTERNAL", "<pt-BR action> falhou.", { detail, retryable: true })`.

- [ ] **Step 2: Implement queries** — thin `.select("*")` wrappers: `listAttendanceEvents` ordered `created_at desc`; `getEventByToken` `.eq("claim_token", token).maybeSingle()`; `getEventById` `.eq("id", id).maybeSingle()`; `getClaimByEventWallet` `.eq("event_id",…).eq("wallet",…).maybeSingle()`. Return `null` when `dbConfigured` is false for queries (public claim page degrades to "indisponível"), but THROW in mutations (writes must not silently no-op).

- [ ] **Step 3: Implement `lib/attendance/storage.ts`** — mirror `lib/render/storage.ts`: sha256 content-address into the `attendance` bucket (`{sha256}.png|jpg|webp` and `{sha256}.json`), `upsert: true`, return `getPublicUrl(...)`. Throw `fail("STORAGE_FAILED", "Falha ao enviar imagem do evento.", { retryable: true, detail })` on upload error (unlike render's `{stored:false}` — event creation cannot proceed without storage).

- [ ] **Step 4: Gates + commit**

```bash
pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test
git add apps/web/lib/db/attendance-mutations.ts apps/web/lib/db/attendance-queries.ts apps/web/lib/attendance/storage.ts
git commit -m "feat(attendance): db access layer and event storage"
```

---

### Task 9: Auth + events API routes

**Files:**
- Create: `apps/web/app/api/attendance/auth/nonce/route.ts`, `apps/web/app/api/attendance/auth/verify/route.ts`, `apps/web/app/api/attendance/events/route.ts`, `apps/web/app/api/attendance/events/[id]/route.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–8.
- Produces (HTTP shapes the client hooks in Tasks 12–14 rely on):

```ts
// POST /api/attendance/auth/nonce   body: { wallet, purpose } → { message: string; nonce: string }
// POST /api/attendance/auth/verify  body: { wallet, message, signatureBase64 } → { wallet: string }  (sets attendance_session cookie)
// GET  /api/attendance/events       → AttendanceEventView[]
// POST /api/attendance/events       body: CreateEventInput → AttendanceEventView
// POST /api/attendance/events/[id]  body: { action } → AttendanceEventView
export interface AttendanceEventView {
  id: string; name: string; description: string; imageUrl: string;
  eventDate: string; maxSupply: number | null; claimDeadline: string | null;
  claimOpen: boolean; mintedCount: number; claimUrl: string; createdAt: string;
}
```

- [ ] **Step 1: Shared helpers** — at the top of `events/route.ts`, export a mapper used by all three event routes:

```ts
export function toEventView(row: AttendanceEventRow, origin: string): AttendanceEventView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    eventDate: row.event_date,
    maxSupply: row.max_supply,
    claimDeadline: row.claim_deadline,
    claimOpen: row.claim_open,
    mintedCount: row.minted_count,
    claimUrl: `${origin}/attend/${row.claim_token}`,
    createdAt: row.created_at,
  };
}
```

`origin` comes from `new URL(request.url).origin`; the SIWS `expectedDomain` from `new URL(request.url).host`.

- [ ] **Step 2: nonce route**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { apiRoute } from "@/lib/api";
import { fail } from "@/lib/errors";
import { authNonceSchema } from "@/lib/attendance/schemas";
import { buildSiwsMessage } from "@/lib/attendance/siws";
import { createNonce } from "@/lib/db/attendance-mutations";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return apiRoute(async () => {
    const body = authNonceSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) fail("VALIDATION", "Dados inválidos.", { detail: body.error.message });
    const { wallet, purpose } = body.data;
    const { nonce, issuedAt } = await createNonce(wallet, purpose);
    const message = buildSiwsMessage({
      domain: new URL(request.url).host,
      wallet,
      purpose,
      nonce,
      issuedAt,
    });
    return { message, nonce };
  });
}
```

- [ ] **Step 3: verify route** — parse `authVerifySchema` → `resolveProvedWallet(input, "attendance-creator", { consumeNonce, getSessionWallets: async () => (await getSessionUser())?.wallets ?? [], expectedDomain: host })` → check `creatorAllowlist().has(wallet)` else `fail("ATTENDANCE_NOT_CREATOR", "Esta carteira não está autorizada a criar eventos.")` → set cookie on the response:

```ts
    const secret = process.env.ATTENDANCE_SESSION_SECRET;
    if (!secret) fail("INTERNAL", "ATTENDANCE_SESSION_SECRET não configurado.");
    const sealed = sealSession(wallet, Date.now() + SESSION_MAX_AGE_MS, secret);
    const response = NextResponse.json({ wallet });
    response.cookies.set(SESSION_COOKIE, sealed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });
    return response;
```

NOTE: cookie-setting cannot use the plain `apiRoute` wrapper (it builds its own response). Structure this handler as `try { … return response } catch (err) { return apiError(err) }` using the exported `apiError` from `@/lib/api`.

- [ ] **Step 4: events routes**

GET: `requireAttendanceCreator()` → `listAttendanceEvents()` → map `toEventView`.

POST (create): `requireAttendanceCreator()` → parse `createEventSchema` → decode image (`const [, mime, b64] = imageDataUrl.match(IMAGE_DATA_URL_RE)`; export that regex from schemas.ts) → `storeAttendanceImage(Buffer.from(b64, "base64"), \`image/${mime}\`)` → `insertEvent` requires `metadataUri`+`collectionAddress` first, so the order is:

1. `const claimToken = generateClaimToken()`
2. `const imageUrl = await storeAttendanceImage(...)`
3. `const eventId = randomUUID()` (from `node:crypto`) — the metadata JSON references the event id, but the row is inserted last, so pre-generate the UUID and pass it BOTH to `buildAttendanceMetadata` and to `insertEvent` as its explicit `id` (Task 8's `id?: string`).
4. `const metadataUri = await storeAttendanceMetadata(buildAttendanceMetadata({ name, description, imageUrl, eventDate, eventId }))`
5. `const collectionAddress = await createEventCollection({ name, metadataUri })`
6. `const row = await insertEvent({ id: eventId, ... })`
7. return `toEventView(row, origin)`

If step 5 or 6 throws after uploads: uploads are content-addressed and idempotent — safe garbage. If step 6 throws after 5: the collection is an orphan on devnet (~0.003 SOL) — acceptable, log via `console.error`, rethrow.

POST [id] (action): `requireAttendanceCreator()` → parse `eventActionSchema` → `getEventById(id)` else `fail("NOT_FOUND", "Evento não encontrado.")` → `pause`→`setClaimOpen(id,false)`, `resume`→`setClaimOpen(id,true)`, `rotate`→`rotateClaimToken(id, generateClaimToken())` → `toEventView`.

- [ ] **Step 5: Gates + commit**

```bash
pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test
git add apps/web/app/api/attendance/
git commit -m "feat(attendance): auth and event management API routes"
```

---

### Task 10: Claim API routes (the critical write path)

**Files:**
- Create: `apps/web/app/api/attendance/claim/route.ts`, `apps/web/app/api/attendance/claim/[token]/route.ts`

**Interfaces:**
- Produces (HTTP shapes for Task 13):

```ts
// GET /api/attendance/claim/[token]?wallet=<optional> →
export interface ClaimPageInfo {
  name: string; description: string; imageUrl: string; eventDate: string;
  mintedCount: number; maxSupply: number | null;
  state: "open" | "paused" | "ended" | "exhausted";
  callerClaim: { status: AttendanceClaimStatus; txSig: string | null; assetId: string | null } | null;
}
// POST /api/attendance/claim  body: ClaimInput →
export interface ClaimResult { status: "minted" | "already"; txSig: string; assetId: string | null; }
```

- [ ] **Step 1: GET info route** (`claim/[token]/route.ts`)

```ts
import { NextResponse, type NextRequest } from "next/server";
import { apiRoute } from "@/lib/api";
import { fail } from "@/lib/errors";
import { checkClaimGate } from "@/lib/attendance/gate";
import { getClaimByEventWallet, getEventByToken } from "@/lib/db/attendance-queries";
import { updateClaimAsset } from "@/lib/db/attendance-mutations";
import { resolveAttendanceAssetId } from "@/lib/chain/attendance";
import { BASE58_RE } from "@/lib/attendance/schemas";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  return apiRoute(async () => {
    const { token } = await params;
    const event = await getEventByToken(token);
    if (!event) {
      fail("ATTENDANCE_LINK_INVALID", "Este link de presença não é válido ou foi substituído.");
    }

    const gate = checkClaimGate(event);
    const exhausted =
      event.max_supply !== null && event.minted_count >= event.max_supply;
    const state = !event.claim_open
      ? "paused"
      : !gate.ok
        ? "ended"
        : exhausted
          ? "exhausted"
          : "open";

    const walletParam = request.nextUrl.searchParams.get("wallet");
    let callerClaim = null;
    if (walletParam && BASE58_RE.test(walletParam)) {
      const claim = await getClaimByEventWallet(event.id, walletParam);
      if (claim) {
        // lazy asset-id backfill once finalized
        if (claim.status === "minted" && claim.asset_id === null && claim.tx_sig) {
          const assetId = await resolveAttendanceAssetId(claim.tx_sig);
          if (assetId) {
            await updateClaimAsset(claim.id, assetId);
            claim.asset_id = assetId;
          }
        }
        callerClaim = { status: claim.status, txSig: claim.tx_sig, assetId: claim.asset_id };
      }
    }

    return {
      name: event.name,
      description: event.description,
      imageUrl: event.image_url,
      eventDate: event.event_date,
      mintedCount: event.minted_count,
      maxSupply: event.max_supply,
      state,
      callerClaim,
    };
  });
}
```

(Lazy-backfill caveat: `resolveAttendanceAssetId` uses 3 attempts × 4s; that is fine for a status poll but do NOT increase attempts here.)

- [ ] **Step 2: POST claim route** (`claim/route.ts`)

```ts
import { after } from "next/server";
import { NextResponse, type NextRequest } from "next/server";
import { apiRoute } from "@/lib/api";
import { fail } from "@/lib/errors";
import { getSessionUser } from "@/lib/auth";
import { claimSchema } from "@/lib/attendance/schemas";
import { checkClaimGate } from "@/lib/attendance/gate";
import { resolveProvedWallet } from "@/lib/attendance/proof";
import { getEventByToken } from "@/lib/db/attendance-queries";
import {
  consumeNonce,
  markClaimMinted,
  releaseClaim,
  reserveClaim,
  updateClaimAsset,
} from "@/lib/db/attendance-mutations";
import {
  mintAttendanceAsset,
  resolveAttendanceAssetId,
} from "@/lib/chain/attendance";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return apiRoute(async () => {
    const parsed = claimSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      fail("VALIDATION", "Dados inválidos.", { detail: parsed.error.message });
    }
    const input = parsed.data;

    const event = await getEventByToken(input.token);
    if (!event) {
      fail("ATTENDANCE_LINK_INVALID", "Este link de presença não é válido ou foi substituído.");
    }

    const gate = checkClaimGate(event);
    if (!gate.ok) fail(gate.code, gate.message);

    const wallet = await resolveProvedWallet(input, "attendance-claim", {
      consumeNonce,
      getSessionWallets: async () => (await getSessionUser())?.wallets ?? [],
      expectedDomain: new URL(request.url).host,
    });

    const reserved = await reserveClaim(event.id, wallet);
    if (reserved.outcome === "already_claimed") {
      return {
        status: "already" as const,
        txSig: reserved.existingTxSig ?? "",
        assetId: null,
      };
    }
    if (reserved.outcome === "exhausted") {
      fail("ATTENDANCE_SUPPLY_EXHAUSTED", "Todas as vagas deste evento já foram reivindicadas.");
    }

    // outcome 'reserved' | 'retry' — we hold the slot; mint or release it.
    const claimId = reserved.claimId;
    if (!claimId) fail("INTERNAL", "Reserva inconsistente.");
    try {
      const { txSig } = await mintAttendanceAsset({
        coreCollection: event.collection_address,
        owner: wallet,
        name: event.name,
        metadataUri: event.metadata_uri,
      });
      await markClaimMinted(claimId, txSig);
      after(async () => {
        const assetId = await resolveAttendanceAssetId(txSig);
        if (assetId) await updateClaimAsset(claimId, assetId);
      });
      return { status: "minted" as const, txSig, assetId: null };
    } catch (err) {
      await releaseClaim(claimId).catch(() => {
        // Release must never mask the mint error; a stuck 'pending' row
        // resolves on the next retry via the 'retry' outcome.
      });
      fail(
        "CHAIN_PROGRAM_ERROR",
        "Falha ao emitir o NFT de presença. Tente novamente.",
        { retryable: true, detail: err instanceof Error ? err.message : String(err) },
      );
    }
  });
}
```

- [ ] **Step 3: Gates + commit**

```bash
pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test
git add apps/web/app/api/attendance/claim/
git commit -m "feat(attendance): claim endpoints with atomic reservation and subsidized mint"
```

---

### Task 11: lib/wallet — wallet-standard registry + typed features (TDD on pure parts)

**Files:**
- Create: `apps/web/lib/wallet/registry.ts`, `apps/web/lib/wallet/features.ts`, `apps/web/lib/wallet/index.ts`
- Test: `apps/web/lib/wallet/__tests__/features.test.ts`

**Interfaces:**
- Produces:

```ts
// index.ts re-exports:
export { useRegistryWallets } from "./registry";
export {
  connectWallet, getSolanaSignerWallets, signMessageWith,
  type WalletHandle, type WalletAccountHandle,
} from "./features";
```

- [ ] **Step 1: Write the failing test** (pure filter + wrappers against fake wallets)

```ts
import { describe, expect, it, vi } from "vitest";
import {
  connectWallet,
  getSolanaSignerWallets,
  signMessageWith,
} from "../features";

function fakeWallet(features: Record<string, unknown>, chains = ["solana:devnet"]) {
  return {
    name: "Fake",
    icon: "data:image/svg+xml;base64,",
    chains,
    accounts: [],
    features,
    version: "1.0.0",
  } as never;
}

describe("wallet features", () => {
  it("filters to solana wallets that can connect and sign messages", () => {
    const good = fakeWallet({ "standard:connect": {}, "solana:signMessage": {} });
    const noSign = fakeWallet({ "standard:connect": {} });
    const evm = fakeWallet(
      { "standard:connect": {}, "solana:signMessage": {} },
      ["eip155:1"],
    );
    expect(getSolanaSignerWallets([good, noSign, evm])).toEqual([good]);
  });

  it("connectWallet returns accounts; signMessageWith returns the signature", async () => {
    const account = { address: "abc" };
    const signature = new Uint8Array([1, 2, 3]);
    const connect = vi.fn(async () => ({ accounts: [account] }));
    const signMessage = vi.fn(async () => [{ signedMessage: new Uint8Array(), signature }]);
    const w = fakeWallet({
      "standard:connect": { connect },
      "solana:signMessage": { signMessage },
    });
    await expect(connectWallet(w)).resolves.toEqual([account]);
    await expect(
      signMessageWith(w, account as never, new Uint8Array([9])),
    ).resolves.toBe(signature);
    expect(signMessage).toHaveBeenCalledWith({ account, message: new Uint8Array([9]) });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter web test -- lib/wallet/__tests__/features.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`registry.ts`:

```ts
"use client";

// The ONLY module touching @wallet-standard/* (ESLint-fenced). Subscribes to
// the browser's wallet-standard registry — every installed wallet (Phantom,
// Solflare, Backpack, …) self-registers there, and so does Privy's embedded
// wallet once its user logs in, which is exactly how the fallback appears in
// the same picker.

import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";
import { useSyncExternalStore } from "react";

const api = typeof window === "undefined" ? null : getWallets();
let cached: readonly Wallet[] = api ? api.get() : [];

function subscribe(onChange: () => void): () => void {
  if (!api) return () => {};
  const offs = [
    api.on("register", () => { cached = api.get(); onChange(); }),
    api.on("unregister", () => { cached = api.get(); onChange(); }),
  ];
  return () => offs.forEach((off) => off());
}

const getSnapshot = (): readonly Wallet[] => cached;
const getServerSnapshot = (): readonly Wallet[] => [];

export function useRegistryWallets(): readonly Wallet[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

`features.ts`:

```ts
"use client";

import type { Wallet, WalletAccount } from "@wallet-standard/base";

export type WalletHandle = Wallet;
export type WalletAccountHandle = WalletAccount;

// Minimal local shapes of the two wallet-standard features we call —
// identical to how hooks/useClaim.ts drives "solana:signTransaction".
interface StandardConnectFeature {
  connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }>;
}
interface SolanaSignMessageFeature {
  signMessage(
    ...inputs: { account: WalletAccount; message: Uint8Array }[]
  ): Promise<readonly { signedMessage: Uint8Array; signature: Uint8Array }[]>;
}

export function getSolanaSignerWallets(
  wallets: readonly Wallet[],
): Wallet[] {
  return wallets.filter(
    (w) =>
      "standard:connect" in w.features &&
      "solana:signMessage" in w.features &&
      w.chains.some((c) => c.startsWith("solana:")),
  );
}

export async function connectWallet(
  wallet: Wallet,
): Promise<readonly WalletAccount[]> {
  const feature = wallet.features["standard:connect"] as StandardConnectFeature;
  const { accounts } = await feature.connect();
  return accounts;
}

export async function signMessageWith(
  wallet: Wallet,
  account: WalletAccount,
  message: Uint8Array,
): Promise<Uint8Array> {
  const feature = wallet.features["solana:signMessage"] as SolanaSignMessageFeature;
  const [result] = await feature.signMessage({ account, message });
  if (!result) throw new Error("carteira retornou assinatura vazia");
  return result.signature;
}
```

`index.ts` re-exports per the Interfaces block.

- [ ] **Step 4: Run to verify pass**, then full gates.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/wallet/
git commit -m "feat(attendance): wallet-standard registry adapter"
```

---

### Task 12: Client hooks — useWalletProof + events + claim

**Files:**
- Create: `apps/web/hooks/useWalletProof.ts`, `apps/web/hooks/useAttendanceEvents.ts`, `apps/web/hooks/useAttendanceClaim.ts`

**Interfaces:**
- Consumes: `lib/wallet` (Task 11), `api` from `@/lib/api-client`, `useMe` from `@/hooks/useMe`, `bytesToBase64` from `@/lib/bytes`, `isUserRejection` from `@/lib/chain/errors`, HTTP shapes from Tasks 9–10.
- Produces:

```ts
// useWalletProof.ts
export interface ProofPayload { wallet: string; message?: string; signatureBase64?: string; }
export function useWalletProof(): {
  wallets: WalletHandle[];                 // signer-capable solana wallets
  selected: { wallet: WalletHandle; account: WalletAccountHandle } | null;
  connect: (w: WalletHandle) => Promise<void>;
  disconnect: () => void;
  prove: (purpose: "attendance-claim" | "attendance-creator") => Promise<ProofPayload>;
  privyLogin: () => void;                  // fallback entry
};

// useAttendanceEvents.ts
export function useAttendanceEvents(): UseQueryResult<AttendanceEventView[]>;
export function useCreateEvent(): UseMutationResult<AttendanceEventView, Error, CreateEventInput>;
export function useEventAction(): UseMutationResult<AttendanceEventView, Error, { id: string; action: "pause" | "resume" | "rotate" }>;
export function useCreatorSignin(
  prove: (purpose: "attendance-creator") => Promise<ProofPayload>,
): UseMutationResult<{ wallet: string }, Error, void>; // prove('attendance-creator') + POST verify

// useAttendanceClaim.ts
export function useClaimInfo(token: string, wallet: string | null): UseQueryResult<ClaimPageInfo>;
export function useMintAttendance(
  token: string,
  prove: (purpose: "attendance-claim") => Promise<ProofPayload>,
): UseMutationResult<ClaimResult, Error, void> & { stage: "idle" | "signing" | "confirming" };
```

- [ ] **Step 1: Implement `useWalletProof`**

```ts
"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { api } from "@/lib/api-client";
import { fail } from "@/lib/errors";
import { isUserRejection } from "@/lib/chain/errors";
import { bytesToBase64 } from "@/lib/bytes";
import { useMe } from "@/hooks/useMe";
import { useT } from "@/lib/i18n";
import {
  connectWallet,
  getSolanaSignerWallets,
  signMessageWith,
  useRegistryWallets,
  type WalletAccountHandle,
  type WalletHandle,
} from "@/lib/wallet";

export interface ProofPayload {
  wallet: string;
  message?: string;
  signatureBase64?: string;
}

export function useWalletProof() {
  const registry = useRegistryWallets();
  const wallets = getSolanaSignerWallets(registry);
  const { data: me } = useMe();
  const { login } = usePrivy();
  const { t } = useT();
  const [selected, setSelected] = useState<{
    wallet: WalletHandle;
    account: WalletAccountHandle;
  } | null>(null);

  const connect = useCallback(async (wallet: WalletHandle) => {
    const accounts = await connectWallet(wallet);
    const account = accounts[0];
    if (!account) {
      fail("UNAUTHORIZED", t("attendance.walletNoAccount"));
    }
    setSelected({ wallet, account });
  }, [t]);

  const prove = useCallback(
    async (purpose: "attendance-claim" | "attendance-creator"): Promise<ProofPayload> => {
      if (!selected) fail("UNAUTHORIZED", t("attendance.walletNotConnected"));
      const address = selected.account.address;
      // Privy-session shortcut: the server verifies wallet linkage from the
      // identity-token cookie — no signature round-trip needed.
      if (me?.authenticated && me.wallets.includes(address)) {
        return { wallet: address };
      }
      const { message } = await api<{ message: string; nonce: string }>(
        "/api/attendance/auth/nonce",
        { json: { wallet: address, purpose } },
      );
      try {
        const signature = await signMessageWith(
          selected.wallet,
          selected.account,
          new TextEncoder().encode(message),
        );
        return { wallet: address, message, signatureBase64: bytesToBase64(signature) };
      } catch (err) {
        if (isUserRejection(err)) {
          fail("CHAIN_REJECTED_BY_USER", t("attendance.signatureCancelled"));
        }
        throw err;
      }
    },
    [selected, me, t],
  );

  return {
    wallets,
    selected,
    connect,
    disconnect: () => setSelected(null),
    prove,
    privyLogin: login,
  };
}
```

- [ ] **Step 2: Implement `useAttendanceEvents`** — standard React Query wrappers: `useQuery({ queryKey: ["attendance","events"], queryFn: () => api<AttendanceEventView[]>("/api/attendance/events"), retry: false })`; mutations POST via `api(url, { json })` and `invalidateQueries({ queryKey: ["attendance","events"] })` on success, `onAppError` on error (import from `@/lib/on-app-error`). `useCreatorSignin` takes the `prove` fn as an argument (`useCreatorSignin(prove)`) → `api("/api/attendance/auth/verify", { json: proof })` → invalidates events. Type the view/input imports from the route/schemas modules (`import type { AttendanceEventView } from "@/app/api/attendance/events/route"`).

- [ ] **Step 3: Implement `useAttendanceClaim`** — `useClaimInfo(token, wallet)`: `queryKey: ["attendance","claim",token,wallet]`, GET `` `/api/attendance/claim/${token}${wallet ? `?wallet=${wallet}` : ""}` ``, `retry: false`, and `refetchInterval` as a function: poll every 5s ONLY while `data?.callerClaim?.status === "minted" && !data.callerClaim.assetId` (asset-id backfill), else no interval. `useMintAttendance(token)` mirrors useClaim.ts's stage pattern: mutationFn takes `prove` result (accept `prove` as an argument: `useMintAttendance(token, prove)`), stage "signing" around prove(), "confirming" around POST `/api/attendance/claim` `{ token, ...proof }`, then invalidates the claim-info query; `onError` → `onAppError`; success toast `t("attendance.claim.success")`.

- [ ] **Step 4: Gates + commit**

```bash
pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test
git add apps/web/hooks/useWalletProof.ts apps/web/hooks/useAttendanceEvents.ts apps/web/hooks/useAttendanceClaim.ts
git commit -m "feat(attendance): wallet-proof, events, and claim hooks"
```

---

### Task 13: i18n dictionary + claim page (`/attend/[token]`)

**Files:**
- Create: `apps/web/lib/i18n/dict/attendance.ts`, `apps/web/components/attendance/wallet-picker.tsx`, `apps/web/components/attendance/claim-card.tsx`, `apps/web/app/attend/[token]/page.tsx`
- Modify: `apps/web/lib/i18n/dictionaries.ts`

**Interfaces:**
- Consumes: hooks from Task 12, GET/POST shapes from Task 10.
- Produces: `attendanceKey` dict domain; `<WalletPicker onDone={() => void}>` (also reused by Task 14).

- [ ] **Step 1: Dictionary** — mirror `dict/verify.ts`'s structure exactly (`const pt = {...}`, `export type attendanceKey = keyof typeof pt`, `export const attendanceDict: Record<Locale, Record<attendanceKey, string>>`). Full pt keyset (en/es translate 1:1; en shown after; es analogous):

```ts
const pt = {
  "attendance.nav": "Eventos",
  "attendance.walletNoAccount": "A carteira não retornou nenhuma conta.",
  "attendance.walletNotConnected": "Conecte uma carteira para continuar.",
  "attendance.signatureCancelled": "Assinatura cancelada.",
  "attendance.picker.title": "Conectar carteira",
  "attendance.picker.empty": "Nenhuma carteira detectada neste navegador.",
  "attendance.picker.fallback": "Sem carteira? Continue com e-mail",
  "attendance.picker.connected": "Conectado como {address}",
  "attendance.picker.change": "Trocar carteira",
  "attendance.claim.title": "NFT de presença",
  "attendance.claim.claimed": "{count} reivindicados",
  "attendance.claim.claimedOf": "{count} de {max} reivindicados",
  "attendance.claim.mint": "Emitir NFT de presença",
  "attendance.claim.confirming": "Confirmando na rede…",
  "attendance.claim.success": "NFT de presença emitido!",
  "attendance.claim.successBody": "Confira na sua carteira — pode levar alguns segundos para aparecer.",
  "attendance.claim.viewTx": "Ver transação",
  "attendance.claim.already": "Você já reivindicou este NFT.",
  "attendance.claim.invalid.title": "Link inválido",
  "attendance.claim.invalid.body": "Este link de presença não é válido ou foi substituído pelo organizador.",
  "attendance.claim.paused.title": "Reivindicações pausadas",
  "attendance.claim.paused.body": "O organizador pausou as reivindicações deste evento.",
  "attendance.claim.ended.title": "Período encerrado",
  "attendance.claim.ended.body": "O período de reivindicação deste evento terminou.",
  "attendance.claim.exhausted.title": "Vagas esgotadas",
  "attendance.claim.exhausted.body": "Todas as vagas deste evento já foram reivindicadas.",
  "attendance.claim.free": "Gratuito — as taxas de rede são por nossa conta.",
  "attendance.events.title": "Eventos",
  "attendance.events.subtitle": "Crie eventos e distribua NFTs de presença por link secreto.",
  "attendance.events.new": "Novo evento",
  "attendance.events.empty": "Nenhum evento ainda. Crie o primeiro!",
  "attendance.events.copyLink": "Copiar link",
  "attendance.events.copied": "Link copiado!",
  "attendance.events.qr": "QR code",
  "attendance.events.pause": "Pausar",
  "attendance.events.resume": "Retomar",
  "attendance.events.rotate": "Gerar novo link",
  "attendance.events.rotateConfirmTitle": "Gerar novo link?",
  "attendance.events.rotateConfirmBody": "O link atual deixará de funcionar imediatamente.",
  "attendance.events.paused": "Pausado",
  "attendance.events.open": "Aberto",
  "attendance.signin.title": "Área do organizador",
  "attendance.signin.body": "Conecte uma carteira autorizada e assine para entrar.",
  "attendance.signin.cta": "Entrar com carteira",
  "attendance.signin.denied": "Esta carteira não está autorizada a criar eventos.",
  "attendance.form.name": "Nome do evento",
  "attendance.form.description": "Descrição",
  "attendance.form.date": "Data do evento",
  "attendance.form.image": "Imagem (PNG, JPEG ou WebP, até 2MB)",
  "attendance.form.maxSupply": "Limite de participantes (opcional)",
  "attendance.form.deadline": "Prazo de reivindicação (opcional)",
  "attendance.form.submit": "Criar evento",
  "attendance.form.creating": "Criando evento…",
  "attendance.form.created": "Evento criado! Compartilhe o link secreto.",
} as const;
```

en (full):

```ts
const en: Record<attendanceKey, string> = {
  "attendance.nav": "Events",
  "attendance.walletNoAccount": "The wallet returned no accounts.",
  "attendance.walletNotConnected": "Connect a wallet to continue.",
  "attendance.signatureCancelled": "Signature cancelled.",
  "attendance.picker.title": "Connect wallet",
  "attendance.picker.empty": "No wallets detected in this browser.",
  "attendance.picker.fallback": "No wallet? Continue with email",
  "attendance.picker.connected": "Connected as {address}",
  "attendance.picker.change": "Change wallet",
  "attendance.claim.title": "Attendance NFT",
  "attendance.claim.claimed": "{count} claimed",
  "attendance.claim.claimedOf": "{count} of {max} claimed",
  "attendance.claim.mint": "Mint attendance NFT",
  "attendance.claim.confirming": "Confirming on-chain…",
  "attendance.claim.success": "Attendance NFT minted!",
  "attendance.claim.successBody": "Check your wallet — it may take a few seconds to appear.",
  "attendance.claim.viewTx": "View transaction",
  "attendance.claim.already": "You already claimed this NFT.",
  "attendance.claim.invalid.title": "Invalid link",
  "attendance.claim.invalid.body": "This attendance link is not valid or was replaced by the organizer.",
  "attendance.claim.paused.title": "Claims paused",
  "attendance.claim.paused.body": "The organizer paused claims for this event.",
  "attendance.claim.ended.title": "Claim period over",
  "attendance.claim.ended.body": "The claim period for this event has ended.",
  "attendance.claim.exhausted.title": "Fully claimed",
  "attendance.claim.exhausted.body": "All spots for this event have been claimed.",
  "attendance.claim.free": "Free — network fees are on us.",
  "attendance.events.title": "Events",
  "attendance.events.subtitle": "Create events and hand out attendance NFTs via a secret link.",
  "attendance.events.new": "New event",
  "attendance.events.empty": "No events yet. Create the first one!",
  "attendance.events.copyLink": "Copy link",
  "attendance.events.copied": "Link copied!",
  "attendance.events.qr": "QR code",
  "attendance.events.pause": "Pause",
  "attendance.events.resume": "Resume",
  "attendance.events.rotate": "Rotate link",
  "attendance.events.rotateConfirmTitle": "Rotate link?",
  "attendance.events.rotateConfirmBody": "The current link stops working immediately.",
  "attendance.events.paused": "Paused",
  "attendance.events.open": "Open",
  "attendance.signin.title": "Organizer area",
  "attendance.signin.body": "Connect an authorized wallet and sign in.",
  "attendance.signin.cta": "Sign in with wallet",
  "attendance.signin.denied": "This wallet is not authorized to create events.",
  "attendance.form.name": "Event name",
  "attendance.form.description": "Description",
  "attendance.form.date": "Event date",
  "attendance.form.image": "Image (PNG, JPEG or WebP, up to 2MB)",
  "attendance.form.maxSupply": "Attendee cap (optional)",
  "attendance.form.deadline": "Claim deadline (optional)",
  "attendance.form.submit": "Create event",
  "attendance.form.creating": "Creating event…",
  "attendance.form.created": "Event created! Share the secret link.",
};
```

es (full):

```ts
const es: Record<attendanceKey, string> = {
  "attendance.nav": "Eventos",
  "attendance.walletNoAccount": "La billetera no devolvió ninguna cuenta.",
  "attendance.walletNotConnected": "Conecta una billetera para continuar.",
  "attendance.signatureCancelled": "Firma cancelada.",
  "attendance.picker.title": "Conectar billetera",
  "attendance.picker.empty": "No se detectaron billeteras en este navegador.",
  "attendance.picker.fallback": "¿Sin billetera? Continúa con e-mail",
  "attendance.picker.connected": "Conectado como {address}",
  "attendance.picker.change": "Cambiar billetera",
  "attendance.claim.title": "NFT de asistencia",
  "attendance.claim.claimed": "{count} reclamados",
  "attendance.claim.claimedOf": "{count} de {max} reclamados",
  "attendance.claim.mint": "Emitir NFT de asistencia",
  "attendance.claim.confirming": "Confirmando en la red…",
  "attendance.claim.success": "¡NFT de asistencia emitido!",
  "attendance.claim.successBody": "Revisa tu billetera — puede tardar unos segundos en aparecer.",
  "attendance.claim.viewTx": "Ver transacción",
  "attendance.claim.already": "Ya reclamaste este NFT.",
  "attendance.claim.invalid.title": "Enlace inválido",
  "attendance.claim.invalid.body": "Este enlace de asistencia no es válido o fue reemplazado por el organizador.",
  "attendance.claim.paused.title": "Reclamos en pausa",
  "attendance.claim.paused.body": "El organizador pausó los reclamos de este evento.",
  "attendance.claim.ended.title": "Período finalizado",
  "attendance.claim.ended.body": "El período de reclamo de este evento terminó.",
  "attendance.claim.exhausted.title": "Cupos agotados",
  "attendance.claim.exhausted.body": "Todos los cupos de este evento ya fueron reclamados.",
  "attendance.claim.free": "Gratis — las tarifas de red corren por nuestra cuenta.",
  "attendance.events.title": "Eventos",
  "attendance.events.subtitle": "Crea eventos y distribuye NFTs de asistencia por enlace secreto.",
  "attendance.events.new": "Nuevo evento",
  "attendance.events.empty": "Aún no hay eventos. ¡Crea el primero!",
  "attendance.events.copyLink": "Copiar enlace",
  "attendance.events.copied": "¡Enlace copiado!",
  "attendance.events.qr": "Código QR",
  "attendance.events.pause": "Pausar",
  "attendance.events.resume": "Reanudar",
  "attendance.events.rotate": "Generar nuevo enlace",
  "attendance.events.rotateConfirmTitle": "¿Generar nuevo enlace?",
  "attendance.events.rotateConfirmBody": "El enlace actual dejará de funcionar de inmediato.",
  "attendance.events.paused": "Pausado",
  "attendance.events.open": "Abierto",
  "attendance.signin.title": "Área del organizador",
  "attendance.signin.body": "Conecta una billetera autorizada y firma para entrar.",
  "attendance.signin.cta": "Entrar con billetera",
  "attendance.signin.denied": "Esta billetera no está autorizada a crear eventos.",
  "attendance.form.name": "Nombre del evento",
  "attendance.form.description": "Descripción",
  "attendance.form.date": "Fecha del evento",
  "attendance.form.image": "Imagen (PNG, JPEG o WebP, hasta 2MB)",
  "attendance.form.maxSupply": "Límite de participantes (opcional)",
  "attendance.form.deadline": "Plazo de reclamo (opcional)",
  "attendance.form.submit": "Crear evento",
  "attendance.form.creating": "Creando evento…",
  "attendance.form.created": "¡Evento creado! Comparte el enlace secreto.",
};
```

Merge into `dictionaries.ts` (import `attendanceDict, type attendanceKey`, add to the `TranslationKey` union and all three locale spreads).

- [ ] **Step 2: `wallet-picker.tsx`** — client component using existing `Dialog`/`Button` ui primitives:

Props: `{ open: boolean; onOpenChange: (o: boolean) => void; proof: ReturnType<typeof useWalletProof> }`. Body: list `proof.wallets` as buttons (wallet `icon` <img> + `name`), onClick → `await proof.connect(wallet)` → `onOpenChange(false)`; below a separator, a ghost button `t("attendance.picker.fallback")` → `proof.privyLogin()`. Empty state: `t("attendance.picker.empty")` + the fallback button. Errors → `onAppError`.

- [ ] **Step 3: `claim-card.tsx`** — client component. Props: `{ token: string }`. Uses `useWalletProof()`, `useClaimInfo(token, proof.selected?.account.address ?? null)`, `useMintAttendance(token, proof.prove)`. Render by state:
  - info loading → `Skeleton`s; info error with code `ATTENDANCE_LINK_INVALID` → invalid card (title/body from dict).
  - event card: image (`<img className="max-w-full rounded-lg">`), name, date, `claimedOf`/`claimed` counter, `t("attendance.claim.free")` note.
  - `state === "paused" | "ended" | "exhausted"` → the matching title/body block, no mint button.
  - `callerClaim?.status === "minted"` → success block: `t("attendance.claim.already")` + explorer link `https://explorer.solana.com/tx/${txSig}?cluster=devnet`.
  - else: not connected → button opening `WalletPicker`; connected → `t("attendance.picker.connected")` (truncated address) + mint button; `stage === "confirming"` → disabled button with spinner + `t("attendance.claim.confirming")` (truthful pending, no optimism).
  - on mutation success → success block with `viewTx` link + `successBody`.

- [ ] **Step 4: `app/attend/[token]/page.tsx`**

```tsx
import { ClaimCard } from "@/components/attendance/claim-card";

export const dynamic = "force-dynamic";

export default async function AttendPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <ClaimCard token={token} />
    </main>
  );
}
```

(All data flows through the GET endpoint so the page itself stays a thin shell; the token never renders into HTML beyond the client props it already came from.)

- [ ] **Step 5: Gates + commit**

```bash
pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test
git add apps/web/lib/i18n/ apps/web/components/attendance/ apps/web/app/attend/
git commit -m "feat(attendance): claim page, wallet picker, i18n dictionary"
```

---

### Task 14: Creator dashboard (`/events`) + nav

**Files:**
- Create: `apps/web/components/attendance/creator-signin.tsx`, `event-form.tsx`, `event-list.tsx`, `apps/web/app/events/page.tsx`
- Modify: `apps/web/components/nav.tsx`, `apps/web/lib/i18n/dict/common.ts`

**Interfaces:**
- Consumes: Task 12 hooks, Task 13 `WalletPicker` + dict keys, `qrcode` (existing dep), `react-hook-form` + `@hookform/resolvers/zod` (existing deps), ui primitives.

- [ ] **Step 1: `creator-signin.tsx`** — card with `t("attendance.signin.*")` copy; `useWalletProof()` + `WalletPicker`; primary button: connect if not connected, else "Entrar com carteira" → `useCreatorSignin(proof.prove).mutate()`. On `ATTENDANCE_NOT_CREATOR` error show `t("attendance.signin.denied")` inline (not just a toast).

- [ ] **Step 2: `event-form.tsx`** — `useForm<CreateEventInput>({ resolver: zodResolver(createEventSchema) })`; fields per dict keys; image `<input type="file" accept="image/png,image/jpeg,image/webp">` → `FileReader.readAsDataURL` → set `imageDataUrl` (client-side size check 2MB before submit, field error otherwise); `maxSupply` as `valueAsNumber`; `claimDeadline` from `<input type="datetime-local">` converted with `new Date(v).toISOString()`; submit → `useCreateEvent().mutateAsync` → toast `t("attendance.form.created")` + reset. Dialog-hosted, opened by the dashboard's "Novo evento" button.

- [ ] **Step 3: `event-list.tsx`** — table/cards from `useAttendanceEvents()`: name, `event_date`, `mintedCount`/`maxSupply`, open/paused `Badge`, actions: copy (`navigator.clipboard.writeText(claimUrl)` + toast), QR (popover with `<img src={dataUrl}>` from `QRCode.toDataURL(claimUrl, { width: 240 })` — `import QRCode from "qrcode"`), pause/resume (`useEventAction`), rotate behind the existing confirm-dialog pattern with `rotateConfirmTitle/Body`. Five states: loading skeletons, error (onAppError already toasts; show retry button), empty (`events.empty`), populated, mutation-pending (disable row actions).

- [ ] **Step 4: `app/events/page.tsx`** — `export const dynamic = "force-dynamic"`; thin client shell component that: runs `useAttendanceEvents()`; if error code is `ATTENDANCE_NOT_CREATOR` or `UNAUTHORIZED` → `<CreatorSignin onSignedIn={refetch}>`; else dashboard (title/subtitle, New-event dialog button, `<EventList/>`).

- [ ] **Step 5: Nav** — in `components/nav.tsx` `RoleLinks`, add after the `/verify` link:

```tsx
      <Link href="/events" onClick={onNavigate} className={NAV_LINK_CLASS}>
        {t("nav.events")}
      </Link>
```

Add `"nav.events"` to `dict/common.ts`: pt `"Eventos"`, en `"Events"`, es `"Eventos"`.

- [ ] **Step 6: Gates + manual smoke** — `pnpm dev`, then with the dev Privy app OR a wallet extension: visit `/events`, sign in with a whitelisted wallet (temporarily add your own test wallet to `ATTENDANCE_CREATOR_WALLETS` in `.env` if needed), create an event against devnet, copy the claim link, open it in a private window, connect + mint. Fix what breaks.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/attendance/ apps/web/app/events/ apps/web/components/nav.tsx apps/web/lib/i18n/dict/common.ts
git commit -m "feat(attendance): creator dashboard, event form, nav entry"
```

---

### Task 15: Tree script + devnet e2e script

**Files:**
- Create: `scripts/create-attendance-tree.ts`, `scripts/e2e-attendance-devnet.ts`
- Modify: `scripts/package.json` (deps), root `package.json` (scripts entries ONLY), `.env` + `.env.example` + `.env.vercel` (tree address)

**Interfaces:**
- Consumes: `OPERATOR_SECRET_KEY`, `NEXT_PUBLIC_RPC_URL` env (as the existing scripts do).
- Produces: a funded devnet Merkle tree address in `ATTENDANCE_MERKLE_TREE`.

- [ ] **Step 1: Add script deps** (isolated install — never at workspace root):

```bash
cd scripts && pnpm add @metaplex-foundation/mpl-bubblegum@^5 @metaplex-foundation/mpl-account-compression@^1 --ignore-workspace --prefer-offline && cd ..
```

- [ ] **Step 2: `create-attendance-tree.ts`** — follow `scripts/seed.ts`'s env-loading style (`process.loadEnvFile()`):

```ts
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  keypairIdentity,
  publicKey,
} from "@metaplex-foundation/umi";
import { createTreeV2, mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import { mplAccountCompression } from "@metaplex-foundation/mpl-account-compression";

try { process.loadEnvFile(); } catch { /* env already set */ }

const RPC = process.env.NEXT_PUBLIC_RPC_URL;
const OPERATOR = process.env.OPERATOR_SECRET_KEY;
if (!RPC || !OPERATOR) throw new Error("NEXT_PUBLIC_RPC_URL / OPERATOR_SECRET_KEY ausentes no .env");

const umi = createUmi(RPC).use(mplBubblegum()).use(mplAccountCompression());
umi.use(keypairIdentity(
  umi.eddsa.createKeypairFromSecretKey(new Uint8Array(JSON.parse(OPERATOR))),
));

const existing = process.env.ATTENDANCE_MERKLE_TREE;
if (existing) {
  const account = await umi.rpc.getAccount(publicKey(existing));
  if (account.exists) {
    console.log(`Árvore já existe: ${existing} — nada a fazer.`);
    process.exit(0);
  }
}

const merkleTree = generateSigner(umi);
console.log(`Criando árvore (depth 14 / buffer 64 / canopy 8)…`);
const builder = await createTreeV2(umi, {
  merkleTree,
  maxDepth: 14,
  maxBufferSize: 64,
  canopyDepth: 8,
});
await builder.sendAndConfirm(umi);
console.log(`ATTENDANCE_MERKLE_TREE=${merkleTree.publicKey.toString()}`);
console.log("Adicione a linha acima ao .env (e ao Vercel).");
```

(`OPERATOR_SECRET_KEY` in `.env` is a JSON array — the same format the web app's `loadKeypairBytes` reads. If the existing scripts share a keypair-loading helper, reuse it. If `createTreeV2` is not exported by the installed mpl-bubblegum, use `createTree` with the same options object — check `scripts/node_modules/@metaplex-foundation/mpl-bubblegum/dist` exports; V2 trees are required for `mintV2`.)

- [ ] **Step 3: Root script entries** in `package.json` `scripts` (safe — not deps):

```json
    "tree:attendance": "tsx scripts/create-attendance-tree.ts",
    "e2e:attendance": "tsx scripts/e2e-attendance-devnet.ts",
```

- [ ] **Step 4: Run it** — `pnpm tree:attendance` (retry on devnet flakiness; the operator key is funded). Add the printed `ATTENDANCE_MERKLE_TREE=` line to `.env`, `.env.vercel`, and leave the empty key documented in `.env.example` (Task 1 already did).

- [ ] **Step 5: `e2e-attendance-devnet.ts`** — proves the full chain path with the SAME shapes the web adapter uses: env-load; build umi exactly as above but also `.use(mplCore())`; then:

1. assert `ATTENDANCE_MERKLE_TREE` set + account exists;
2. `createCollection` with `plugins: [{ type: "BubblegumV2" }]` (name `E2E Attendance ${Date.now()}`, uri `https://example.com/e2e.json`);
3. `mintV2` to a fresh `generateSigner(umi).publicKey` with `sellerFeeBasisPoints: 0`, `collection: some(collection)`, `creators: []`, `sendAndConfirm(umi, { confirm: { commitment: "finalized" } })`;
4. `parseLeafFromMintV2Transaction(umi, signature)` → assert `leaf.owner` equals the fresh wallet; print `leaf.id` (asset id) + explorer link;
5. measure the real per-mint cost: read the operator's lamport balance (`umi.rpc.getBalance(umi.identity.publicKey)`) before and after the `mintV2`, print the delta, and record it as a comment on `ATTENDANCE_MERKLE_TREE` in `.env.example` (spec §2 requires the observed Bubblegum protocol fee to be documented);
6. exit non-zero on any failure.

- [ ] **Step 6: Run + commit**

```bash
pnpm e2e:attendance
git add scripts/create-attendance-tree.ts scripts/e2e-attendance-devnet.ts scripts/package.json scripts/pnpm-lock.yaml package.json .env.example
git commit -m "feat(attendance): merkle tree bootstrap and devnet e2e"
```

---

### Task 16: Full gates, polish pass, docs ripple

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `.env.vercel`

- [ ] **Step 1: Full gates**

```bash
pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build
```

All must pass. The build must not require a live DB (both new pages are `force-dynamic`).

- [ ] **Step 2: Polish pass** — invoke the `webapp-polish` skill and walk its checklist against `/events` and `/attend/[token]` (states, focus rings, contrast in both themes, aria labels on icon buttons, pt/en/es rendering). Fix findings.

- [ ] **Step 3: Docs ripple**
  - `README.md`: an "Attendance NFTs" subsection — what it is (secret-link claim, subsidized cNFT mints), the three env vars, `pnpm tree:attendance`, `pnpm e2e:attendance`, routes `/events` + `/attend/<token>`.
  - `CHANGELOG.md`: entry under the current date: `feat(attendance): attendance NFT events — creator dashboard, secret claim links, subsidized Bubblegum v2 mints`.
  - `.env.vercel`: append the three new vars with real values (tree address, whitelist, a fresh session secret).

- [ ] **Step 4: AI-slop / diff review** — run `/diff-review` per the repo Done Checklist; strip redundant comments and dead code it flags.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs(attendance): readme, changelog, env ripple"
```

---

## Self-review appendix (already applied)

- Spec §2 lazy asset-id: implemented twice (POST `after()` + GET backfill) — both in Task 10.
- Spec §4 route table: all seven routes have tasks (9, 10). `GET /api/attendance/claim/[token]` carries the public info + `callerClaim`.
- Spec §8 dep deviation: `@solana/react`/`@wallet-standard/react` replaced by `@wallet-standard/app` + `@wallet-standard/base` (raw registry + the feature-call pattern proven in `hooks/useClaim.ts`; no client-side transactions exist to justify kit signers). The spec file is amended in the same commit as this plan.
- Type names cross-checked: `AttendanceEventRow`/`AttendanceClaimRow`/`ReserveOutcome` (Task 2) are consumed by Tasks 8–10; `ProofPayload` (Task 12) matches `claimSchema`'s optional fields (Task 5); `toEventView` output matches `AttendanceEventView` (Tasks 9/12/14).
- Counter invariant honored end-to-end: reserve increments (SQL), release decrements (SQL), `retry` does NOT re-increment, `failed`→re-reserve does.
