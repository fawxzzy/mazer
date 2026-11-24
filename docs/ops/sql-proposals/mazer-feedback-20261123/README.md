# Proposal: in-game feedback table and submit RPC (2026-11-23)

SUPERSEDED 2026-11-24 by `../mazer-feedback-20261124-v2/` (signed-in only, global cap, cascade FK, lock_timeout). Kept as history; do not apply this version.

Status: PROPOSED, NOT APPLIED. Nothing here ran against Supabase. Applying needs an owner box naming the sha256 of the exact apply file (`../../MAZER-SQL-CHANGE-PROCESS.md`). Client plan: `docs/ui/MAZER-FEEDBACK-POPUP-PLAN-2026-11-23.md`.

Apply file: `apply.sql` (one transaction, new objects only). Rollback: `rollback.sql`. Hashes: `SHA256SUMS.txt` (LF bytes as committed).
Scratch evidence: `scratch-test/feedbacktest.cjs` (run: `PGLITE_SANDBOX=<dir with @electric-sql/pglite 0.5.13> node feedbacktest.cjs <repo root>`), log `scratch-test/run-pglite.log` (sha256 headers inside, 65 checks, 0 failed).

## What changes
- New table `mazer.mazer_feedback`: `rating smallint not null check 1..5`, `comment` capped at 500 characters (trimmed, empty becomes NULL), `user_id uuid null references auth.users on delete set null`, `build_id`, `player_level`, `game_mode`, `source`, `created_at`. Two indexes. RLS enabled, NOT forced, no policy. `anon`/`authenticated`/`public` have no table privilege; `service_role` gets select + delete.
- New function `mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text)`: SECURITY DEFINER, `search_path=''`, user id from `auth.uid()` only. Errors: `MAZER_FEEDBACK_BAD_RATING` (22023), `MAZER_FEEDBACK_COMMENT_TOO_LONG` (22001). Context fields are sanitised to NULL, never rejected. Rate limit: signed in 5/hour and 20/24h per user; signed out 30/hour shared. Returns `{"status":"saved"}` or `{"status":"rate_limited","retry_after_seconds":n}`. EXECUTE granted to anon and authenticated.
- Nothing existing is altered.

## Scratch result (pglite 0.5.13, PostgreSQL 17 wasm, in memory)
65 checks pass: preflight aborts (missing schema, missing auth.users, same-name function with another signature, pre-existing table of any shape); ACL/RLS/definer shape; rating 0/6/-1/100/null rejected; comment 500 ok, 501 rejected, emoji counted by character; context sanitising; the three rate limits; direct SELECT/INSERT/UPDATE/DELETE denied for authenticated and anon; mutant check (grants added by mistake are still blocked by RLS); table CHECK constraints; a non-superuser, non-BYPASSRLS owner can write through the function; FK on delete set null; re-apply over a live install aborts and changes nothing; both-limits retry returns the longer wait; rollback keeps a table with data; rollback on an empty table restores the pre-apply catalog; re-apply after rollback.

Stand-ins, NOT live captures: roles, `auth.uid()`, a reduced `auth.users`. pglite only, not the PG17 cluster harness the process document prefers. The advisory lock is untested under real concurrency.

## Checklist
- [x] Scratch test of apply and rollback, catalog equality, abort test.
- [x] Independent review round 1 (read-only reviewer agent, 2026-11-23): HOLD on 2 P1 + 2 P2; fixed in this head (`is distinct from` preflight, abort if the table already exists, `lock table` before the rollback count, longer retry when both limits hit, column-level and service_role privilege asserts, mutant tests). A second review of the fixed files is still to do.
- [ ] Owner decision, review finding 4: the per-user rate limit is only as strong as the cost of a new user id. If Supabase anonymous sign-ins or open sign-up are on, each new id gets a fresh budget and the table has no global cap. Confirm the auth settings; add a global ceiling or accept the risk.
- [ ] Owner decision: feedback text survives account deletion (user_id becomes NULL); the admin viewer must escape comments (stored raw).
- [ ] Live read-only preimage: not done (no database access in this lane).
- [ ] PG17 harness run and concurrency: not done.
- [ ] Owner box with the sha256 and postimage read-back: to do.

## Preimage questions (read-only, answer before the apply box)
1. Does `mazer.mazer_feedback` or a function named `mazer_submit_feedback_v1` already exist live?
2. Can the migration owner reference `auth.users` (REFERENCES privilege)? Existing live `mazer.*` tables already do.
3. Is `service_role` present and is `mazer` already exposed to PostgREST (the leaderboard RPCs are)?

## Rollback
`rollback.sql` drops the function, and drops the table only when it has zero rows; otherwise it raises notice `MAZER_FEEDBACK_ROLLBACK_KEPT_TABLE` and keeps the data (export it first if you really want it gone).
