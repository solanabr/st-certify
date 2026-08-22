-- Records which Solana cluster a certificate was claimed on.
--
-- Applied by scripts/setup-supabase.ts, which runs each file in
-- supabase/migrations/ as a single statement batch — so, per the 0003/0004/0005
-- convention, every statement here is re-runnable.
--
-- Why a column and not `NEXT_PUBLIC_RPC_URL`: the exported PDF prints the
-- network and builds its explorer link from it (apps/web/lib/pdf/build.ts),
-- and a document must say where its transaction was actually recorded, not
-- where the process reprinting it happens to be pointed. Repointing the app at
-- mainnet would otherwise silently re-attribute every devnet certificate ever
-- issued, and the explorer link would 404. The claim pipeline
-- (apps/web/lib/chain/claim.ts) writes this at claim time; readers fall back to
-- the environment when it is null, which is what they all did before, so this
-- migration can land at any time — before or after the code that fills it.
--
-- Existing rows are backfilled to 'devnet': every certificate issued before
-- this migration was issued against the devnet deployment (the program has
-- never been deployed to mainnet — .env.example still ships the devnet RPC).

alter table certificates add column if not exists cluster text;

update certificates set cluster = 'devnet' where cluster is null;

-- Same rationale as 0005's verify_code grant: 0003 §1 replaced anon's blanket
-- SELECT on certificates with a column-level grant, and a column added later is
-- not covered by it — including in WHERE clauses. Granting discloses nothing:
-- the cluster is already printed on every exported certificate and implied by
-- every explorer link the verify page renders.
grant select (cluster) on public.certificates to anon, authenticated;
