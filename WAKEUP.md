# Wake-up runbook

Read this first. Everything here is a human-required action — nothing on
this list can be automated further from inside the sandbox. Steps are
ordered; do them top to bottom. See `README.md` for the full picture and
`CHANGELOG.md` for what shipped overnight.

## 1. Paste the Supabase project URL

The build ran all night with `NEXT_PUBLIC_SUPABASE_URL` empty — everything
that doesn't need it is done; everything that does is written, tested where
possible, and waiting.

1. Open your Supabase project dashboard -> Settings -> API.
2. Copy the **Project URL** (`https://<ref>.supabase.co`) into `.env` as
   `NEXT_PUBLIC_SUPABASE_URL`.
3. Also recommended: Settings -> Database -> Connect -> URI, paste into
   `SUPABASE_DB_URL`. Without it, `pnpm setup:supabase` will skip applying
   migrations automatically and you'll need to paste
   `supabase/migrations/0001_init.sql` into the SQL editor by hand.
4. Run:
   ```bash
   pnpm setup:supabase
   ```
   This applies the migration (creates `profiles`/`editions`/`edition_signers`/
   `certificates`/`events` with RLS) and creates the three storage buckets
   (`templates`, `certs`, `metadata`). Safe to re-run — every step is
   skip-if-exists.
5. Verify RLS is actually locked down (this is a security gate, not
   decoration):
   ```bash
   pnpm rls-probe
   ```
   Every row should print `[PASS]`. If anything prints `[FAIL]`, **stop and
   fix `supabase/migrations/0001_init.sql` before letting anyone touch this
   deployment** — it means the anon key can read or write something it
   shouldn't.
6. Populate demo data so the app has something to look at:
   ```bash
   pnpm seed
   ```
   Creates one edition ("Solana Bootcamp — Turma 2026") with certificates in
   every status. Idempotent — re-running after the first success is a no-op.
   Prints verify URLs for each certificate at the end.

## 2. Privy dashboard sanity check

App id `cmsifiqnq008t0cjryxeg93j5` (dashboard.privy.io). Confirm both are ON:

- Solana embedded wallets
- "Return user data in identity token"

If either was off, the server-side identity-token verification
(`@privy-io/node`, used by every authenticated API route) silently loses
wallet/email data it expects to have.

## 3. Optional: HELIUS_API_KEY

Recommended, not required. The public devnet RPC rate-limits under load
(airdrops especially). Get a key at dev.helius.xyz and paste it into `.env`
as `HELIUS_API_KEY`.

## 4. Log in and run the 5-minute manual pass

This is the one thing that genuinely cannot be automated: Privy email login
requires a real OTP code sent to a real inbox, and there's no Chrome binary
in the build sandbox to drive a headless keyboard pass either (both are
noted as sandbox limitations in the M6/M7 reports, not skipped by choice).

```bash
pnpm dev
```

1. Go to `http://localhost:3000`, log in with `kaue@superteam.com.br`
   (email OTP) -> confirm you land in the admin view (`/admin`).
2. **Immediately after this login**, check that your embedded wallet was
   auto-registered as an on-chain admin (day-1 behavior, see "Custody"
   below) — `/admin` should show you and Kuka in the admins list once both
   of you have logged in once. This is the step that turns off the
   deployer+operator bootstrap threshold.
3. Create a test edition through the wizard (either template path).
4. As a certifier (one of the edition's 2 signers), open `/certificator`,
   select the test cert(s), sign — confirm Phantom/embedded shows exactly
   **one** popup for the batch, not one per certificate.
5. As a student (a second browser profile or an embedded wallet), request a
   certificate, wait for both signatures, claim it — confirm the NFT shows
   up in a wallet UI (Phantom's "Collectibles" tab, or the Explorer link
   `/me` gives you).
6. Open `/verify/<the cert address>` in an incognito window — confirm it
   shows the right status, and that the "verificado onchain" stamp appears
   a moment after the page paints (that's the live chain-check; the
   instant-paint content above it comes from the DB mirror).
7. As admin, revoke that same certificate with a reason — reload the verify
   page, confirm it flips to the red REVOKED banner (not a stale green one —
   this exact bug was fixed in M7, see `CHANGELOG.md`).

If any step fails, the relevant milestone report in
`.superpowers/sdd/you-are-going-to-foamy-stallman/` has the implementation
detail; `README.md` "Known limitations" lists everything already known not
to be airtight.

## 5. Custody: move the deployer key off the server-readable path

Tonight, `revoke_certificate` / `set_notary` / `add_admin` / `remove_admin`
(the "destructive" op class) require 2 pairwise-distinct admin signatures,
and both of tonight's signers — **deployer** and **operator** — live as
plaintext-JSON keys under `.keys/` on this machine, readable by the app
server. That's acknowledged bootstrap theater: whoever can read this box's
filesystem effectively controls both signatures.

Once you and Kuka have each logged in once (step 4.2 above), your embedded
wallets are registered as admins 4 and 5, and destructive ops start
requiring **operator + a human's wallet** — a box compromise alone can no
longer revoke certificates, rotate the notary, or capture the admin
registry. At that point:

- Move `DEPLOYER_SECRET_KEY` out of the server's reachable filesystem (it's
  only needed for that 2nd bootstrap signature and for the demo/E2E
  scripts — it does not need to be live in production).
- `NOTARY_SECRET_KEY` and `OPERATOR_SECRET_KEY` stay server-resident by
  design (see README "Security posture" — their blast radius is bounded by
  what those two keys can actually do).

## 6. Before mainnet (do not skip)

Read `README.md` -> "Known limitations" -> **"Persistent-tombstone
reject-grief"** first. It's a parked, adjudicated-acceptable-for-devnet
finding in the on-chain program: any edition signer or admin can grief a
specific (edition, student) pair out of ever requesting again, for about
0.0009 SOL, by bundling a `reject` with a small `System.transfer` to the
freed certificate PDA in the same transaction. The fix (a dedicated
admin-only reclaim instruction, deliberately NOT composable in the same
transaction as `reject` — rushing that combination risks reopening the
already-fixed revival bug) was not implemented tonight. Hand this to
`solana-architect` or a red-team pass before mainnet; it is not a reason to
delay devnet use.

Also before mainnet, per the plan (none of this is new information, just
collected here):

- Fresh program id, separate deploy session, **explicit confirmation**
  required (per this repo's `CLAUDE.md` — no exceptions).
- Upgrade authority -> a Squads v4 vault (not the raw deployer key).
- Re-run the render determinism check on whatever host will actually serve
  renders in production — the double-render byte-identity proof was only
  ever run on this dev machine (see README "Known limitations" ->
  "Cross-platform render determinism").

## 7. Attendance NFTs — on Supabase unpause

The attendance-NFT flow (`/events` create, `/attend/<token>` claim) shares
the same Supabase project as the certificate flow and was built the same
way: everything that doesn't need `NEXT_PUBLIC_SUPABASE_URL` is done,
everything that does is written and waiting. Once step 1 above is complete:

1. `pnpm setup:supabase` already covers this migration too — it applies
   every file under `supabase/migrations/` in order, so `0002_attendance.sql`
   (the `attendance_events`/`attendance_claims`/`attendance_nonces` tables,
   RLS, and the `attendance_reserve_claim`/`attendance_release_claim`
   functions) lands alongside `0001_init.sql`. It also creates the fourth
   storage bucket, `attendance`. No separate command needed.
2. Verify the migration actually landed — via the Supabase SQL editor, or
   `psql "$SUPABASE_DB_URL"`:
   ```sql
   select count(*) from attendance_events;
   select proname from pg_proc where proname like 'attendance_%';
   ```
   The first should run without error (0 rows is fine, pre-launch). The
   second should list `attendance_reserve_claim` and
   `attendance_release_claim`.
3. Confirm RLS is actually locked down on the three new tables — same
   anon-key-must-be-denied pattern `scripts/rls-probe.ts` uses for the M7
   tables (seed a row with the service-role client, then attempt
   `select`/`insert`/`update` with the anon client and confirm every
   attempt is denied — an explicit error or 0 rows affected, never a
   visible change). The three attendance tables aren't wired into that
   script yet, so run the equivalent by hand (Supabase SQL editor's "test
   as anon role", or a throwaway script using `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   against `attendance_events`, `attendance_claims`, and `attendance_nonces`
   before trusting this in front of real participants.
4. The three attendance env vars are already set in this machine's `.env`
   (`ATTENDANCE_MERKLE_TREE=4aUhooMis8VtCaAKNyo2NHLmmENHhYu1nNHPNpQcF2hp`,
   `ATTENDANCE_CREATOR_WALLETS`, `ATTENDANCE_SESSION_SECRET`) — nothing to
   regenerate. Vercel's project env needs the same three added by hand;
   they don't ride along with a git push.
5. Live smoke test: create an event at `/events` (sign in with a wallet
   from `ATTENDANCE_CREATOR_WALLETS`), open the printed `/attend/<token>`
   link in a different browser profile, connect a wallet, claim — confirm
   the mint succeeds and reloading the claim page still shows the claimed
   state (not a re-claimable one).
