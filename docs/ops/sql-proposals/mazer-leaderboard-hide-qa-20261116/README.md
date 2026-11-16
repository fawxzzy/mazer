# Proposal: hide QA accounts from the Mazer public leaderboard (2026-11-16)

Status: PROPOSED, NOT APPLIED. Applying needs an owner box naming the sha256 of the exact apply file (see `../../MAZER-SQL-CHANGE-PROCESS.md`).

Apply file: `supabase/migrations/20260828160000_mazer_leaderboard_hide_qa_accounts.sql` (one transaction).
Rollback: `rollback.sql` (this folder; not under `supabase/migrations`, so `db push` never runs it).
Live preimage: `preimage.json` (read-only capture of project `bxtcuhkotumitoqtrcej`, schema `mazer`, 2026-11-16).
Scratch evidence (PostgreSQL 17.9, non-superuser `postgres` runner, stub built from `preimage.json`): `scratch-test/run.log` (sha256 headers inside; regenerate with `scratch-test/run-scratch.mjs`; files: `make-stub.mjs` -> `stub-app.sql`, `stub-super.sql`, `seed.sql`, `check.sql`, `check-rollback.sql`).
Earlier in-memory evidence: `scratch-test/lbtest.cjs` + `scratch-test/run-pglite.log` (pglite 0.5.13; kept, not the process evidence).
Tested files (see `run.log` headers): apply sha256 `0fe2aca3560f731144296ed7bb344e0733655c5d36f88028e2c139cd5c17d2fd`; rollback.sql sha256 `81e81f8d1e90fc801047344f2c1a43c940bc58840453aea40da69d282c7f4f79`.

## Process checklist (`../../MAZER-SQL-CHANGE-PROCESS.md`)
- [x] Faithful scratch stub: PG 17.9, runner `postgres` not superuser / not in `supabase_auth_admin`, live function bodies installed byte for byte (md5 re-verified by the generator), live ACLs/RLS/trigger from the capture. Not in the capture and therefore assumed: schema usage grants, `mazer_progression_states` columns, the body of the existing username-origin trigger function, the 7 profile writer functions (unused by this change, not stubbed).
- [x] Apply and rollback pair (`scratch-pg.mjs pair --reapply`): apply clean, 27 post-apply checks, re-apply is idempotent (no catalog change, same 4 hidden), rollback clean, catalog after rollback equals catalog before apply, plus 5 post-rollback checks. See `scratch-test/run.log`.
- [x] Rollback works for the runner role (no trigger on `auth.users` is touched; check E7).
- [x] Mutant/abort tests: drifted page body aborts `MAZER_LB_HIDE_PREIMAGE_DRIFT_PAGE`, missing `self_rank` aborts, both leave the DB unchanged (`run.log` section 3). Not tested: wrong owner.
- [x] Evidence log carries sha256 headers (`run.log` lines 1-11).
- [ ] Pin source: the md5 pins come from the live capture (`preimage.json`, `md5_prosrc`, 0 CR); the capture was not made with the `run-preimage-pack.ps1` pack, so no `EVIDENCE.txt` exists.
- [ ] Concurrency and cost of the new trigger: not measured.
- [ ] Independent review of this scratch evidence, fresh read-only preimage right before apply, owner box with the apply sha256, postimage read-back: still to do.

## What changes
- `mazer.mazer_profiles.leaderboard_hidden boolean not null default false`.
- Trigger `mazer_protect_leaderboard_hidden_before_write`: `authenticated` and `anon` can never set/flip the flag (value silently kept). Needed because live grants are table-level (`authenticated=arw`), so a column-level revoke would do nothing and the owner UPDATE policy lets users write their own row.
- `mazer_leaderboard_page` and `mazer_leaderboard_self_rank`: same signatures, ordering, SECURITY DEFINER, `search_path ''`, grants, plus `and not p.leaderboard_hidden` in both ranking populations. A hidden caller gets `rank null, has_username true`; `legacyLeaderboard.ts` treats that as "no usable self-rank" (no username prompt).
- Flag set for `mzr-qa-1112`, `mzr-qa-2`, `cqa-a-1105`, `claude` only.

## Drift check (repo vs live)
None. Live `md5(prosrc)`: page `57b52e11c3aa16d5d9672e43c056b486`, self_rank `7f4912db0e015d565a88383e8610e86e`, both LF, owner postgres; equal to the bodies in `20260824170159_mazer_master_runtime_contracts.sql`. No later migration redefines them. The migration preflight pins those md5s (or accepts bodies already containing `leaderboard_hidden`).
Unrelated drift noted: repo comments say `username` is optional, live column is `NOT NULL` (+ `username_origin`), matching `20260825120000_mazer_generated_username_contract.sql`.

## Side effects to know
- Function ACL array order of `mazer_leaderboard_page` on live changes from `{postgres,anon,authenticated}` to `{postgres,authenticated,anon}` (revoke/grant re-stated); privileges identical. `rollback.sql` restores the original order (the PG17 pair run found the first version of the rollback left it swapped).
- The 4 hidden accounts lose their public rank; their own in-app self-rank becomes "none". Nothing else about them changes (`updated_at`/`revision` not bumped).
- Other players' ranks shift up by the number of hidden accounts ranked above them.
