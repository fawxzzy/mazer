# Proposal v2: in-game feedback table and submit RPC (2026-11-24)

Status: PROPOSED, NOT APPLIED. Nothing here ran against Supabase (the only live access was one read-only preimage). Applying needs an owner box naming the sha256 of the exact apply file (`../../MAZER-SQL-CHANGE-PROCESS.md`). Client plan: `docs/ui/MAZER-FEEDBACK-POPUP-PLAN-2026-11-23.md`.

Supersedes `../mazer-feedback-20261123/` (v1, kept as history; do NOT apply v1). Round 2 review of v1 found no P1 and three P2s; this folder answers all three.

Apply file: `apply.sql` (one transaction, new objects only). Rollback: `rollback.sql`. Hashes: `SHA256SUMS.txt` (LF bytes as committed; hash and apply only LF bytes).
Scratch evidence: `scratch-test/feedbacktest.cjs` (run: `PGLITE_SANDBOX=<dir with @electric-sql/pglite 0.5.13> node feedbacktest.cjs <repo root>`), log `scratch-test/run-pglite.txt` (sha256 headers inside, 82 checks, 0 failed; the original `.log` name is gitignored).
PostgreSQL 17.9 run with the repo harness (`scripts/db-scratch/scratch-pg.mjs pair`, non-superuser runner `postgres`, `auth.users` owned by a stub `supabase_auth_admin`), added after review round 3 found the pglite superuser run was not the repo-required test: `scratch-test/pg17/run-pg17-pair.txt` (apply clean, second apply refused by its own guard, rollback clean, catalog after rollback equals catalog before; plus `check.sql`: signed-out refused, 5/hour cap, cascade, privileges) and `scratch-test/pg17/run-pg17-rollback-with-rows.txt` (rollback with one row present keeps the table and drops only the function). Stub and inputs: `scratch-test/pg17/`. The stub is a reduced shape (one stand-in cascading table), not a full copy of the live mazer schema.
Live read-only preimage (2026-11-24 07:06Z): `preimage/c_feedback_v2.sql` (read-only SQL) and `preimage/c_feedback_v2.json` (its output). Standard preimage pack (`run-preimage-pack.ps1`, schemas mazer + account_private, 07:32Z, with `EVIDENCE.txt` hashes): `preimage/pack/`; no `mazer_feedback` object appears in it.
Known comment inaccuracies (comments only; not edited so the hashed bytes stay the tested bytes): `apply.sql` line 7 says "row locks", they are table-level ROW EXCLUSIVE locks on `auth.users`; adding the FK takes SHARE ROW EXCLUSIVE, which also waits behind autovacuum and any writer. Apply in a quiet window; a wait over 3 s aborts with nothing changed. A `55P03` from the advisory-lock wait must be treated by the client as a generic error, not as `rate_limited`.

## What changed from v1
- Review P2 (a): the foreign key to `auth.users` takes a SHARE ROW EXCLUSIVE lock on `auth.users`. `apply.sql` and `rollback.sql` now start with `set local lock_timeout = '3s'` and `set local statement_timeout = '15s'`, so a blocked apply fails fast and changes nothing instead of queueing sign-ins. The function also carries `lock_timeout=3s`. Tests prove both settings are in force at the end of each transaction and that the post-image assertions abort when they are wrong.
- Review P2 (b): `user_id` is now `NOT NULL references auth.users(id) on delete cascade`, so an account deletion removes that account's feedback with no change to the live `delete_account_v2` function (its call-time walk only touches listed tables; the cascade does the rest). The FawxzzyWeb source file for that function lists the new FK so a future re-apply passes its own sweep (separate PR on FawxzzyWeb; see Apply order).
- Review P2 (c), owner decisions (Zac delegated: "make ur best choices"):
  - Signed-in only. The function raises `MAZER_FEEDBACK_NOT_SIGNED_IN` (28000) when `auth.uid()` is NULL, before any validation, and EXECUTE is granted to `authenticated` only (no anon). v1's signed-out path is gone.
  - Global ceiling added: 100 rows per rolling hour across all users, on top of 5 per user per hour and 20 per user per 24 h. When several limits are exhausted the retry is the longest wait. (Live check: `auth.users` has 0 anonymous users, so every id costs a real sign-up; the global cap covers the open-sign-up case.)
  - Entry point: a menu row only, no auto-prompt (client work, later).
  - `build_id` comes from the client. The repo has no Vite build or commit constant today, so adding one is part of the client PR; the RPC already sanitises it to NULL when it is not well formed.
  - Comment stored as plain text, never as markup. Any viewer must escape it.
- Index `mazer_feedback_user_created_idx (user_id, created_at desc)` is no longer partial (user_id is never NULL).

## What it creates
- Table `mazer.mazer_feedback` (`rating smallint 1..5 not null`, `comment` up to 500 characters, trimmed, empty becomes NULL, `user_id uuid not null` FK with cascade, `build_id`, `player_level`, `game_mode`, `source`, `created_at`). RLS enabled, NOT forced, no policy; clients have no table privilege; `service_role` has select + delete.
- Function `mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text)`: SECURITY DEFINER, `search_path=''`, `lock_timeout=3s`, user id from `auth.uid()` only. Errors: `MAZER_FEEDBACK_NOT_SIGNED_IN` (28000), `MAZER_FEEDBACK_BAD_RATING` (22023), `MAZER_FEEDBACK_COMMENT_TOO_LONG` (22001). Context fields are sanitised to NULL, never rejected. Returns `{"status":"saved"}` or `{"status":"rate_limited","retry_after_seconds":n}`.
- Nothing existing is altered.

## Live preimage facts (read-only, 2026-11-24)
- `mazer.mazer_feedback` absent; `mazer.mazer_submit_feedback_v1` absent (the only same-name-like objects are in schema `discordos`/`fitness`, unrelated).
- The migration owner (`postgres`) has REFERENCES on `auth.users`; the four existing `mazer.*` tables already reference it with `on delete cascade`. `auth.users`: 137 rows, 0 anonymous, no ungranted lock waits at read time.
- Live `delete_account_v2` inner body md5 `e6569397d035916a3c5d1b7b6bd93148`; it does not mention feedback.
- Not done: nothing that writes. The preimage must be re-read immediately before any apply (the apply also asserts absence itself).

## Checklist
- [x] Scratch test of apply and rollback, catalog equality, abort tests, mutants (pglite 0.5.13, 82 checks, 0 failed).
- [x] Fresh read-only preimage (above).
- [x] Review findings of round 2 addressed in files.
- [x] PG17 `pair` run with the non-superuser runner: passed (see the logs above). Real concurrency and lock contention on a busy `auth.users` are still untested.
- [x] Independent review round 3: first pass was HOLD (P1: PG17 run missing; P2: log was gitignored, standard preimage pack not run, Web per-call trigger list lacked the feedback table). All four were fixed and the delta re-review returned PASS (no blocking findings; apply.sql and rollback.sql bytes unchanged).
- [ ] Owner box with the sha256 and a post-image read-back: to do.
- [ ] Real concurrency (the advisory lock and the lock_timeout are untested under real contention): not done.

## Repeating the PG17 run
```
node scripts/db-scratch/scratch-pg.mjs init  --dir C:\ATLAS\tmp\scratch-pg-feedback-v2 --port 55440
node scripts/db-scratch/scratch-pg.mjs build --dir C:\ATLAS\tmp\scratch-pg-feedback-v2 --extra docs/ops/sql-proposals/mazer-feedback-20261124-v2/scratch-test/pg17/app-stub.sql
node scripts/db-scratch/scratch-pg.mjs pair  --dir C:\ATLAS\tmp\scratch-pg-feedback-v2 --apply docs/ops/sql-proposals/mazer-feedback-20261124-v2/apply.sql --rollback docs/ops/sql-proposals/mazer-feedback-20261124-v2/rollback.sql --seed docs/ops/sql-proposals/mazer-feedback-20261124-v2/scratch-test/pg17/seed.sql --check docs/ops/sql-proposals/mazer-feedback-20261124-v2/scratch-test/pg17/check.sql --reapply --schemas mazer
powershell -File docs/ops/sql-proposals/mazer-feedback-20261124-v2/scratch-test/pg17/rollback-with-rows.ps1
node scripts/db-scratch/scratch-pg.mjs stop --dir C:\ATLAS\tmp\scratch-pg-feedback-v2
```
Known limits of this run: `check.sql` calls the function as the owner (the client path is shown only by the privilege and schema-USAGE checks), the stub `auth.users` has RLS off, and the `auth` catalog is not compared after rollback.

## Apply order (when approved)
1. In the minutes before the apply, re-run `preimage/c_feedback_v2.sql` read-only and the standard pack with volatile items (`scripts/db-scratch/run-preimage-pack.ps1 -IncludeVolatile`: runner role, long transactions, waiting locks; the apply takes SHARE ROW EXCLUSIVE on `auth.users`). If anything differs or a long transaction is open, stop.
2. Apply `apply.sql` (this folder). It is independent of every other pending change.
3. The FawxzzyWeb delete-manifest file change needs NO apply for this to work (the live delete function is untouched and the cascade handles deletion). It only matters before any future re-apply of the delete SQL, which must happen after this table exists or with the optional entry the Web change adds.
4. Read back the post-image (the apply asserts it; a read-only catalog query confirms), then the client PR can ship.

## Rollback
`rollback.sql` drops the function, and drops the table only when it has zero rows; otherwise it raises notice `MAZER_FEEDBACK_ROLLBACK_KEPT_TABLE` and keeps the data (export it first if you really want it gone).
