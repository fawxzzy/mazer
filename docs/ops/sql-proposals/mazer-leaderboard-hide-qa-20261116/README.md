# Proposal: hide QA accounts from the Mazer public leaderboard (2026-11-16)

Status: PROPOSED, NOT APPLIED. Applying needs an owner box naming the sha256 of the exact apply file (see `../../MAZER-SQL-CHANGE-PROCESS.md`).

Apply file: `supabase/migrations/20260828160000_mazer_leaderboard_hide_qa_accounts.sql` (one transaction).
Rollback: `rollback.sql` (this folder; not under `supabase/migrations`, so `db push` never runs it).
Live preimage: `preimage.json` (read-only capture of project `bxtcuhkotumitoqtrcej`, schema `mazer`, 2026-11-16).
Scratch evidence: `scratch-test/lbtest.cjs` + `scratch-test/run.log` (pglite 0.5.13; run with the pinned package installed next to the script).

## What changes
- `mazer.mazer_profiles.leaderboard_hidden boolean not null default false`.
- Trigger `mazer_protect_leaderboard_hidden_before_write`: `authenticated` and `anon` can never set/flip the flag (value silently kept). Needed because live grants are table-level (`authenticated=arw`), so a column-level revoke would do nothing and the owner UPDATE policy lets users write their own row.
- `mazer_leaderboard_page` and `mazer_leaderboard_self_rank`: same signatures, ordering, SECURITY DEFINER, `search_path ''`, grants, plus `and not p.leaderboard_hidden` in both ranking populations. A hidden caller gets `rank null, has_username true`; `legacyLeaderboard.ts` treats that as "no usable self-rank" (no username prompt).
- Flag set for `mzr-qa-1112`, `mzr-qa-2`, `cqa-a-1105`, `claude` only.

## Drift check (repo vs live)
None. Live `md5(prosrc)`: page `57b52e11c3aa16d5d9672e43c056b486`, self_rank `7f4912db0e015d565a88383e8610e86e`, both LF, owner postgres; equal to the bodies in `20260824170159_mazer_master_runtime_contracts.sql`. No later migration redefines them. The migration preflight pins those md5s (or accepts bodies already containing `leaderboard_hidden`).
Unrelated drift noted: repo comments say `username` is optional, live column is `NOT NULL` (+ `username_origin`), matching `20260825120000_mazer_generated_username_contract.sql`.

## Side effects to know
- Function ACL array order on live changes from `{postgres,anon,authenticated}` to `{postgres,authenticated,anon}` (revoke/grant re-stated); privileges identical.
- The 4 hidden accounts lose their public rank; their own in-app self-rank becomes "none". Nothing else about them changes (`updated_at`/`revision` not bumped).
- Other players' ranks shift up by the number of hidden accounts ranked above them.
