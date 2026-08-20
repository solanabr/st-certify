# scripts/

The devnet operational scripts (`deploy.sh`, `seed*.ts`, `e2e*.ts`,
`rls-probe.ts`, `create-attendance-tree.ts`, `setup-supabase.ts`) are
documented in the root `README.md` ("Development commands", "Attendance
NFTs"). This file documents the admin/incident-response scripts only.

## Admin / incident scripts

All in `scripts/admin/`, run from the repo root with
`npx tsx scripts/admin/<file>.ts` (`_shared.ts` is a helper module, not a
script). Every script has `--help`. Every mutating script defaults to
**dry-run** and requires an explicit `--execute` flag to write anything.
None of them accept new dependencies — `scripts/` has an isolated
`pnpm --ignore-workspace` install; see "Why `scripts/` has its own
`package.json`" in the root README.

**Exit code convention**, shared by all eight: `0` = OK / nothing to do,
`1` = the condition the script looks for was found (stale reservations,
anomalies, a capacity or balance warning, a failed release), `2` = the
script couldn't complete the check at all (bad args, unreachable
Supabase/RPC, event not found).

For symptom -> script -> remediation walkthroughs, see
`docs/runbooks/attendance-incident-playbook.md`.

| Script | Purpose |
|---|---|
| `operator-balance.ts` | Checks OPERATOR's SOL balance against a mint-floor (default: 50 mints x 95,000 lamports); also reports DEPLOYER/NOTARY if configured. Read-only. |
| `reserve-sweep.ts` | Finds `attendance_claims` reservations stuck `pending` past `--max-age` minutes (default 5) and releases them via `attendance_release_claim`, freeing the capacity slot. |
| `integrity-report.ts` | Reconciles `attendance_events.minted_count` against claim rows, flags claims missing `tx_sig`, duplicate `tx_sig`/`asset_id`, duplicate `(event, wallet)` rows, and stuck reservations. Read-only; the double-mint triage tool. |
| `event-control.ts` | `pause` / `resume` / `rotate-token` / `invalidate` (pause+rotate) a single event by id — the CLI kill-switch for when the creator dashboard is unreachable. |
| `nonce-sweep.ts` | Deletes `attendance_nonces` rows expired more than `--older-than` hours ago (default 24). Plain hygiene. |
| `tree-capacity.ts` | Reads the shared Merkle tree's on-chain leaf usage (`sequenceNumber`) against its 16,384-leaf capacity; warns at 80%, critical at 95% (matches `apps/web/lib/attendance/constants.ts`). Read-only. |
| `preflight.ts` | Composes all the read-only checks above (plus RPC reachability and, with `--with-rls`, `rls-probe.ts`) into one green/red summary. Run this before every event. |
| `scrub-metadata-salt.ts` | One-shot remediation: strips `render_spec.values.name_salt` from certificate metadata JSONs published before 2026-08-20 (the builder no longer emits it) and rewrites them in place in the `metadata` bucket. |

Example:

```bash
npx tsx scripts/admin/preflight.ts
npx tsx scripts/admin/reserve-sweep.ts --max-age 10
npx tsx scripts/admin/event-control.ts invalidate <eventId> --execute
```
