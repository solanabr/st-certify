-- One wallet, one seat per draft edition.
--
-- Applied by scripts/setup-supabase.ts, which runs each file in
-- supabase/migrations/ as a single statement batch — so, per the 0003/0004/0005
-- convention, every statement here is re-runnable.
--
-- Why the database has to hold this line: `create_edition` bakes the signer
-- array in permanently, and the program credits a signature to the FIRST slot
-- holding that pubkey. An edition whose seats share a wallet therefore has a
-- slot nobody can ever sign, and every certificate under it is stuck short of
-- FullySigned — with no on-chain repair, since the signer array is immutable.
-- The accept route (apps/web/app/api/invite/[token]/accept/route.ts) reads the
-- sibling seats first for a friendly refusal, but that read-then-write loses to
-- two signers confirming the same wallet at the same instant. This index is
-- what actually decides it; acceptInvite maps the violation back to the same
-- INVITE_WALLET_TAKEN refusal, so the signer sees one message either way.
--
-- Partial on `wallet is not null`: an unaccepted seat has no wallet yet, and
-- every draft has several of those at once.
--
-- Existing rows: a duplicate accepted pair predating this index would make the
-- index build fail. None is known (the studio has one live draft set), and the
-- fix is a product decision — which of the two seats keeps the wallet — so it
-- is deliberately not automated here. If the build fails, resolve the pair
-- first:
--   select draft_id, wallet, count(*) from signer_invites
--    where wallet is not null group by 1, 2 having count(*) > 1;

create unique index if not exists signer_invites_draft_wallet_uidx
  on signer_invites (draft_id, wallet)
  where wallet is not null;
