# Proposal: game mode tag for Mazer leaderboard scores (lane L11, 2026-11-19)

Status: PROPOSED, NOT APPLIED. Nothing here ran against Supabase. Applying needs an owner box naming the sha256 of the exact apply file (`../../MAZER-SQL-CHANGE-PROCESS.md`). Owner approved the column IN PRINCIPLE on 2026-11-19; this is the exact SQL for the second look. Product contract: `docs/architecture/MAZER-GAME-MODES-PRODUCT-CONTRACT.md`.

Apply file: `supabase/migrations/20260828170000_mazer_leaderboard_game_mode.sql` (one transaction). Depends on the hide-QA migration `20260828160000` (live since 2026-11-16): it aborts if that is not applied.
Rollback: `rollback.sql` (this folder, not under `supabase/migrations`).
Re-run 2026-11-23 on main 56043a17 (lane "mode select"): same pinned pglite 0.5.13, 27 passed, 0 failed, same two sha256 values below. Still NOT applied.

Scratch evidence: `scratch-test/modetest.cjs` (run: `PGLITE_SANDBOX=<dir with @electric-sql/pglite 0.5.13> node modetest.cjs <repo root>`), log `scratch-test/run-pglite.log` (sha256 headers inside, 27 checks, 0 failed).
Tested files (LF bytes, as committed): apply sha256 `b597fc5b57662d054a39bbcfc7b792fa83d193dceb70d2312526c3f9be529644`; rollback.sql sha256 `38530b2fedc8081e1269003bc4bc0efcfd490a06d94d76cf10a3e52495162443`.

## What changes
- `mazer.mazer_progression_states.mode text not null default 'endless'` (metadata-only add on PostgreSQL 11+, no rewrite). Every existing row reads `endless`: this is the backfill. An explicit UPDATE would rewrite every row to change nothing; the post-image asserts no row is anything else.
- Shape check `mazer_progression_states_mode_check` (`^[a-z][a-z0-9_]{0,31}$`); it does not list modes, so a new mode needs no constraint change.
- Index `mazer_progression_states_mode_level_idx (mode, player_level desc, level_reached_at asc nulls last, user_id)`.
- `mazer_leaderboard_page` and `mazer_leaderboard_self_rank`: `CREATE OR REPLACE`, same signatures, ordering, SECURITY DEFINER, search_path; `and s.mode = 'endless'` added to every ranking population and to the self row. Owner, ACL and comments are untouched (no grant is restated).
- No new function, no new argument. A mode-aware read, and the key change a second per-account score needs (the table is keyed by `user_id` alone), belong to the card that adds a second mode.
- Client: unchanged queries. Merging the app PR without this SQL is safe; applying this SQL without the app PR is safe (the app reads no mode field).

## Scratch result (pglite 0.5.13, PostgreSQL 17 wasm, in memory)
Page and self rank identical before and after apply for all 10 seeded accounts; all rows endless after apply; function ACL/owner/config/comments unchanged; table ACL unchanged; index present and chosen by the planner with seqscan off; a completion-style SECURITY DEFINER insert that does not name `mode` gets `endless`; `authenticated` cannot update `mode` (no write grant); malformed and null modes rejected; a row set to another mode drops out of page and self rank; re-apply is a no-op; rollback restores a catalog equal to the pre-apply catalog; apply after rollback works; drifted page body, missing hide-QA column, pre-hide-QA bodies and a missing function all abort and (with the transaction rolled back, as psql does) leave the catalog unchanged.

Stand-ins, NOT live captures: roles, `auth.uid()`, reduced table DDL for `mazer_profiles` and `mazer_progression_states`, the completion function (`stub_complete`), RLS/grants as written in the repo migrations. The two leaderboard bodies installed are the repository copy of `20260824170159` plus the real hide-QA file. This is pglite only, not the PG17 cluster harness the process document prefers; a PG17 pair run is still to do.

## Checklist (`../../MAZER-SQL-CHANGE-PROCESS.md`)
- [ ] Live capture: NOT done (no database access in this lane). The md5 pins come from the repository copy of the hide-QA migration as LF, not from a live read.
- [ ] Pin source: apply-file pins `15a7b465...` (page) and `1289597d...` (self_rank) are md5 of the hide-QA bodies as committed. Must be re-confirmed as `md5(prosrc)` of the live functions right before apply; if live differs (for example CRLF) the pins change.
- [x] Scratch test of apply and rollback with catalog equality (pglite only, see above).
- [x] Abort tests: drifted body, hide-QA missing, missing function.
- [ ] PG17 harness pair run, concurrency and cost of the index build: not done.
- [ ] Independent review, fresh read-only preimage, owner box with the sha256, postimage read-back: to do.

## Preimage questions (read-only, answer before the apply box)
1. `md5(prosrc)` and CR count of `mazer.mazer_leaderboard_page(integer,integer)` and `mazer.mazer_leaderboard_self_rank()` live now: do they equal `15a7b4655d7cb4cfe8778eb3379220bc` and `1289597dc20bcebf6594ce19c21acd5b`?
2. Live columns of `mazer.mazer_progression_states`: is there already a column named `mode`? Row count and size (the index build takes a SHARE lock; with one row per account it should be milliseconds, confirm).
3. Live grants and RLS on `mazer.mazer_progression_states`: confirm `authenticated` has no INSERT/UPDATE and `anon` nothing (the migration relies on this so clients cannot write `mode`).
4. Bodies of the progression completion functions that INSERT into `mazer.mazer_progression_states`: confirm none lists columns positionally without names or uses `select *` (a new column must take its default).
5. Anything else that reads `mazer_progression_states` and ranks it (other functions, views): grep `prosrc` for the table; those would need the same `mode` filter once a second mode exists.
6. Long-running transactions or waiting locks at apply time.

## Rollback
`rollback.sql` restores the two post-hide-QA bodies (md5-checked in its own post-image), drops the index, the check and the column. Scores and ranks are untouched (all rows were endless).
