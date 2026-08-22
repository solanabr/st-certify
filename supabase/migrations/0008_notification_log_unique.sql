-- One notification per (type, recipient, ref_id): the constraint that makes
-- `notifyOnce` (apps/web/lib/email/notify.ts) idempotent under concurrency.
--
-- Applied by scripts/setup-supabase.ts, which runs each file in
-- supabase/migrations/ as a single statement batch — so, per the 0003/0004/0005
-- convention, every statement here is re-runnable and anything Postgres has no
-- IF NOT EXISTS form for is wrapped in a catalog-checked DO block (an abort
-- would roll back the whole file).
--
-- WHY: 0005 shipped the log as a read-then-write advisory check. Two workers
-- reaching the same notification at once — two signers finishing batches on the
-- same certificate, an overlapping digest run, a double-clicked reminder — both
-- read "nothing sent", both sent. Only a unique key can arbitrate that, so the
-- write becomes the claim and the loser gets a 23505 instead of a second email.
--
-- SEMANTIC CHANGE — notification_log stops being append-only. Before this
-- index, a legitimate resend (digest, reminder) appended a second row and the
-- read path took the newest. After it there is exactly ONE ROW PER KEY, and the
-- recurring kinds ADVANCE `sent_at` IN PLACE via a compare-and-swap. Nothing
-- downstream loses information — the reader only ever looked at the newest row
-- — but the table is no longer a send history, and anything that wants one
-- (per-send audit, delivery analytics) needs its own table rather than a
-- GROUP BY over this one.
--
-- The index cannot be created while duplicates exist, and any deployment that
-- ran 0005's code has them for the recurring kinds. The delete below collapses
-- each key to its newest row — precisely the row the read path was already
-- using, so the surviving state is what notifyOnce would have seen anyway.

delete from public.notification_log a
  using public.notification_log b
  where a.type = b.type
    and a.recipient = b.recipient
    and a.ref_id = b.ref_id
    and (a.sent_at, a.id) < (b.sent_at, b.id);

create unique index if not exists notification_log_once_uidx
  on public.notification_log (type, recipient, ref_id);

-- 0005's notification_log_lookup_idx was (type, recipient, ref_id, sent_at
-- desc). The unique index above has the same leading columns and, being
-- unique, leaves at most one row to sort — so the trailing sent_at buys
-- nothing and the old index is pure write amplification. Both queries that
-- touch this table (the lookup and the guarded sent_at update) are served by
-- the unique index alone. A fresh database still creates it in 0005 and drops
-- it here; the order is fixed, so the end state is the same either way.
drop index if exists public.notification_log_lookup_idx;
