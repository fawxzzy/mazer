# Proposal: server-side username rename throttle (MAZER-ACCT-047, 2026-11-24)

Status: PROPOSED, NOT APPLIED. Nothing here ran against Supabase (the only live access was read-only catalog queries). Applying needs an owner box naming the sha256 of the exact apply file (`../../MAZER-SQL-CHANGE-PROCESS.md`).

Apply file: `apply.sql` (one transaction, new objects only, `lock_timeout` 3s). Rollback: `rollback.sql`. Hashes: `SHA256SUMS.txt` (LF bytes; `.gitattributes` now pins `docs/ops/sql-proposals/** text eol=lf` so a Windows checkout keeps them).
Scratch evidence: `scratch-test/throttletest.cjs` (run: `PGLITE_SANDBOX=<dir with @electric-sql/pglite 0.5.13> node throttletest.cjs <repo root>`), log `scratch-test/run-pglite.log` (sha256 headers inside). Live function bodies used as fixtures: `scratch-test/live-bodies.json`.

## Finding that shaped the design
- The live `mazer.mazer_set_username(uuid, text)` has no throttle (PR #679 retired client editing; FawxzzyWeb #216/#222 are client-only).
- `authenticated` holds table-level INSERT/SELECT/UPDATE on `mazer.mazer_profiles`, and the owner-update RLS policy allows the own row. A signed-in player can therefore change `username` by a direct table write and skip any RPC. A throttle inside a new or replaced RPC would leave that path (and the old RPC) open.
- Choice: a `BEFORE UPDATE OF username` trigger, the one choke point both paths share. No existing function is replaced, so no client has to switch RPCs and the RPC's error codes 28000 / 22023 / P0002 / 23505 keep their meaning. Losing options: a new RPC only (hole stays), replacing the live RPC body (needs the CRLF live body re-pinned and still leaves direct writes), column-privilege revoke (breaks other profile writes and the `updated_at` flow).

## Preimage (read-only, 2026-11-24)
- Live `mazer_set_username` md5(prosrc) `1b1fae6c5de66380e55f2f096f2de5cb` (CRLF, 31 CR). With CR removed: `52aad54b788b197b4a47f2fdaffc7055`.
- Repo copy in `supabase/migrations/20260827190000_...sql` (LF): `4646e17787259205270ccafa388506f7`. They differ: the live body also writes `display_name`, and carries CRLF. Guards pin the LIVE md5s, never the repo copy.
- Also pinned: `mazer_enforce_username_origin` `15faddd63b2eb3bc413f3751203ee961`, `mazer_protect_leaderboard_hidden` `a2d34bf2c78cbcbcf0d1efc14c9a45f0`. Profile table triggers must be exactly those two (the throttle trigger is allowed on a re-run). The postimage re-checks all three md5s.
- Other writers of `mazer_profiles.username` (live, p4): `mazer_ensure_profile` (md5 `d5f3f7b517da6192cc9bc23086ca1ea3`) only SELECTs and INSERTs a profile row (never UPDATEs), so it cannot hit the trigger. `mazer_before_user_created`, `mazer_claim_signup_username`, `mazer_register_profile_for` run at sign-up, where `auth.uid()` is not an end-user session; their bodies were read for INSERT-only behaviour by the reviewer (p3), not re-proven here.
- Evidence: `C:\ATLAS\tmp\sql-packet-20261124\preimage2\p1..p4` (outside the repo, ad-hoc read-only queries, no EVIDENCE.txt pack; see checklist).

## What changes
- New table `mazer.mazer_username_changes (user_id, changed_at)`, PK on both, FK to `mazer.mazer_profiles(user_id) ON DELETE CASCADE`. RLS on, no policy, no privilege for public/anon/authenticated/service_role.
- New function `mazer.mazer_throttle_username_change()`: SECURITY DEFINER, `search_path=''`, per-account advisory lock, `clock_timestamp()` windows. Function ACL owner-only.
- New trigger `mazer_throttle_username_change_before_update` (BEFORE UPDATE OF username, WHEN the value really changes). Sorts after the two existing triggers and never modifies NEW.
- Nothing else is altered.

## Rules
- Only end-user requests count: `auth.uid()` must be set. The SQL runner and background jobs are exempt and unlogged. (Live, `service_role` holds no privilege on `mazer_profiles` at all, so that exemption is moot in practice.)
- Same exact name: nothing happens. Case-only change counts as a change.
- The first claim away from an auto-generated handle (`username_origin = 'generated'`) is free and unlogged; the existing trigger then marks it `claimed`. A profile INSERTed by its owner with origin `generated` would also get one free change (at most one extra, only once per account); not tested.
- Every later change: at most 1 per rolling 24h and at most 3 per rolling 7 days. Constants are in the function body.
- Failure atomicity: the log row is written in the same statement, so a taken name (23505), an invalid name, or a blocked attempt leaves no budget spent.
- Log rows older than 30 days are pruned on the account's next throttled change.

## Error contract for clients
- SQLSTATE `PT429`, message `MAZER_USERNAME_RATE_LIMITED`, DETAIL `retry_after_seconds=<n> window=day|week`, HINT text (do not show it). PostgREST maps a `PTxyz` SQLSTATE to HTTP `xyz`, so the response is HTTP 429 with `code` `PT429`, `message`, `details`, `hint` in the body. A plain `54000` would have arrived as HTTP 500 and every block would look like a server failure. FawxzzyWeb `src/lib/auth/mazer-name.ts` already maps status 429 to the "change.rate" notice, so the player gets the rate notice. The adapter currently drops the error `details`, so the retry time is NOT shown; passing `details` (retry_after_seconds) through is an optional FawxzzyWeb follow-up, not required for the throttle to work.
- NOT verified against the live API (documented PostgREST behaviour, not exercised). Check it in the post-apply step below.
- Show a calm in-flow notice such as "You changed your username recently. You can change it again in about <time>." No red inline text; use the in-flow notice. For the direct-write path the same error arrives on the table PATCH.

## Client work, before and after
- Before apply: nothing is required. The throttle is server side only. FawxzzyWeb already maps 429; Mazer in-game editing stays retired (#679).
- After apply: read back (postimage) and try one rename pair with the QA account (`mazer-qa1`): the second call must return HTTP 429 with `MAZER_USERNAME_RATE_LIMITED`, and the account screen must show the rate notice, not "change.savefail".
- FawxzzyWeb follow-up (no card exists yet, owner: FawxzzyWeb lane): add `mazer.mazer_username_changes.user_id` to the `delete_account_v2` preflight manifest before its next apply. Runtime is already safe: the live `delete_account_v2` body (md5 `e6569397...`, captured in p3) only rejects DELETE triggers on `mazer_profiles`, and the new key cascades with the profile. The manifest entry only keeps the "every user-keyed table is accounted for" claim true.

## Scratch result (pglite 0.5.13, PostgreSQL 17 wasm, in memory)
80 checks, 0 failed (see log). Covers: fixture md5 pins; preflight aborts (missing schema, drifted set_username, missing set_username, drifted origin and hidden functions, extra trigger, same-name table of another shape, same-name table without the PK/cascading FK, same-name function of another signature, missing profile column); clean apply as a non-superuser BYPASSRLS applier; transaction-local timeouts; ACL/RLS/definer/search_path shape; no client privilege on the log table or trigger function (authenticated, anon, service_role); old RPC errors 28000 / 22023 / P0002 unchanged; same-name calls free even while blocked; day block with retry about 24h; 23h and 25h boundaries; weekly block with retry; direct table UPDATE and upsert throttled, other-column UPDATE unaffected, cross-user UPDATE denied by RLS; generated-handle first claim free (RPC and direct); taken name and invalid name spend nothing; case-only change counted; per-user independence; runner and applier exemptions; profile delete cascades log rows; 30-day pruning; idempotent re-apply keeps rows and catalog; rollback with rows keeps the table and turns the throttle off; re-apply after that; rollback on an empty log restores the pre-apply catalog exactly (function md5s, ACLs, triggers, tables, policies, indexes); rollback re-run; six mutants (weekly limit raised, uid exemption removed, generated not free, no distinct guard, error code reverted to 54000, log insert removed) are each caught by behaviour or by the apply postimage.
- Defects found by the harness and review before any apply: a `'schema.table'::regclass` literal inside the preflight is resolved at parse time, so a fresh install failed with 42P01 (fixed with `to_regclass()`); the first draft used SQLSTATE 54000, which PostgREST returns as HTTP 500 (now PT429).

Stand-ins, NOT live captures: roles, `auth.users` (id only), `auth.uid()` reading `request.jwt.claim.sub`, the applier role `owner_pg`. Real: the three live function bodies (byte exact) and the profile table DDL, RLS, grants and triggers as read on 2026-11-24.

## Not verified
- Concurrency and cost: the per-account advisory lock and two simultaneous renames cannot run on pglite (one connection). Reasoning, not a measurement: `UPDATE` locks the profile row before a BEFORE ROW trigger sees it, so concurrent renames of one account already queue on that row; the advisory lock is a second guard. Worst case without it is one extra change inside a window, never a name collision (the unique index on lower(username) stays the authority). The trigger adds one indexed read of at most 3 rows and one insert per throttled rename; rename frequency is tiny. A two-session test on the PG17 harness is still to do.
- The PG17 cluster harness (`scripts/db-scratch/scratch-pg.mjs`, `run-preimage-pack.ps1`) was not run; pglite only.
- PostgREST's HTTP status for `PT429` on the live API.
- `auth.uid()` inside a SECURITY DEFINER trigger on the real Supabase (the live set_username already relies on it).
- Supabase event triggers or default ACLs that could trip the postimage (it fails closed and rolls back).

## Checklist (MAZER-SQL-CHANGE-PROCESS, copied)
- [~] **Live capture**: read-only ad-hoc queries (p1..p4) against production on 2026-11-24, kept in `C:\ATLAS\tmp\sql-packet-20261124\preimage2\`; function bodies, triggers, columns, grants and RLS come from them. The `run-preimage-pack.ps1` pack and `EVIDENCE.txt` were NOT used.
- [x] **Pin source**: md5 pins are the live `md5_stored` values; the report above says the repo file differs from the live one (LF `4646e177...` vs live `1b1fae6c...` stored, `52aad54b...` with CR removed).
- [ ] **Faithful scratch stub**: PG17 cluster via `scratch-pg.mjs` NOT built. pglite stand-in used (see "Stand-ins"). Live function bodies were installed byte for byte (CRLF kept); applier is non-superuser BYPASSRLS, not a member of `supabase_auth_admin`.
- [~] **Apply and rollback pair**: run on pglite (not `scratch-pg.mjs pair`): apply clean, second apply is an accepted no-op, rollback clean, catalog after rollback equals catalog before.
- [x] **Rollback works for the runner role**: no DROP/DISABLE TRIGGER on `auth.users`; the trigger and function dropped are owned by the runner.
- [x] **Mutation and abort tests**: the guard aborts on a changed body, a missing function, an extra trigger, a wrong table shape and constraints; six mutants shown in `scratch-test/run-pglite.log`. (A wrong function owner is not tested.)
- [ ] **Concurrency and cost**: not measured. See "Not verified" for the reasoning and the to-do.
- [x] **Evidence logs carry sha256 headers**: `scratch-test/run-pglite.log`.
- [~] **Independent review**: round 1 (reviewer agent, 2026-11-24): HOLD on 1 P1 (this checklist not copied; concurrency undocumented) and P2s (PostgREST would return HTTP 500 for 54000, eol pinning, mazer_ensure_profile unverified, delete manifest note, README overstatements); all addressed in this head. Round 2 result is recorded on the PR.
- [ ] **Fresh read-only preimage** immediately before the apply (minutes, not hours): the three md5s, trigger list, long transactions, waiting locks.
- [ ] **Boxes**: owner approves the sha256 of the exact apply file; apply through the wrapper with that hash; postimage read-back; rollback file and hash on hand.

## Suggested owner box text
"Apply `docs/ops/sql-proposals/mazer-username-throttle-20261124/apply.sql` sha256 `<from SHA256SUMS.txt>` to project bxtcuhkotumitoqtrcej. Adds one table, one function and one trigger; changes no existing function. Rollback file sha256 `<from SHA256SUMS.txt>`. Hash computed on the LF bytes (`git show <sha>:<path> | sha256sum`). Known gaps accepted: tested on pglite only (no PG17 cluster harness run) and two-session concurrency not measured (row-lock reasoning only); PostgREST HTTP 429 for PT429 not yet exercised live."

## Rollback
`rollback.sql` drops the trigger and the function, and drops the log table only when it has zero rows; otherwise it raises notice `MAZER_THROTTLE_ROLLBACK_KEPT_TABLE rows=<n>` and keeps the data. It then asserts the profile table is back to its two original triggers and the three guarded live bodies are byte-identical to the preimage.
