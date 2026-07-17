# Mazer Supabase Source Recovery Packet

- Packet: `FP-MZR-REC-001`
- Captured: `2026-07-17T07:57:13.968Z`
- Verified: `2026-07-17T08:35:24.272Z`
- Project ref: `geknvnrmktchljnyddwp`
- Source base: `origin/main@3bd13233dc33fc721f8ccf105d2cc51f1a8dd8d4`
- Scope: repository-source recovery only
- Live mutation: none
- Secret/key access: none

## Recovered Source Order

1. `20260709045557_mazer_progression_state.sql`
2. `20260709045648_mazer_account_storage_contracts.sql`
3. `20260709045725_mazer_tighten_public_table_grants.sql`
4. `20260716211513_account_state_revisions.sql`

The final tree contains exactly four executable migration identities: one source
per live version and name. The two sources edited after live application were
restored to their historical bodies, the missing grant-tightening migration was
recovered, and the account-revision body was retained under its live version.
Prior repository files were removed without rewriting Git history.

Every migration is bound to its sanitized live statement evidence in
`supabase/recovery/fp-mzr-rec-001-provenance.json` with independent live raw,
canonical SQL, and repository-LF digests. The source files' canonical SHA-256
digests exactly equal their live statement digests.

## Disposable Replay

- Runtime: PostgreSQL `17.9`
- Toolchain gate: `postgres`, `initdb`, `pg_ctl`, and `psql` must all
  report major version 17 before cluster creation
- Owned port: `55432` (ports `5432` and `5433` untouched)
- Fixtures: roles `anon`, `authenticated`, `service_role`; minimal
  `auth.users` and `auth.uid()`; locally available extension contracts
- Replay A: four of four migrations applied from zero
- Replay B: four of four migrations applied from zero
- Deterministic rerun: passed
- Legacy-history fixture: all three prior repository versions detected;
  normal application refused; history-only repair mapped to all four live
  versions without changing schema; idempotent second repair passed
- Exact live Mazer signatures: columns, constraints, functions, grants,
  indexes, policies, tables, and triggers all matched
- Cleanup: owned listener closed; owned data/log directory removed

The first harness invocation timed out before role, database, or migration
creation because PostgreSQL on Windows retained the launcher's captured output
handle. Its applied prefix was zero. The harness now starts and stops the owned
server without captured daemon pipes; the next bounded replay completed and
cleaned up successfully.

Provider-managed extension parity remains `UNKNOWN`. The live project has five
installed extensions, including `supabase_vault`; the disposable PostgreSQL
runtime has four and cannot prove Supabase-managed bundle equality. This does
not affect the exact Mazer object-contract match above and is not presented as
production parity.

## Verification

- `npm run test:supabase-source-recovery`: 1 file, 5 focused
  migration/source/history contract tests passed
- `npm run supabase:verify-source-recovery`: passed; four sources, zero
  duplicate versions, zero duplicate names
- `npm run supabase:legacy-repair-plan`: passed; fail-closed ordered plan,
  no mutation performed
- `npm run supabase:replay-source-recovery`: passed with the bounded
  provider-extension `UNKNOWN` described above
- `npm run verify`: 53 files, 387 tests passed; production build passed
- `git diff --check`: passed

## Safety Disposition

- No Supabase/Auth/schema/data/Edge/cron/secret mutation was performed.
- No Vercel deployment or production mutation was performed.
- No Discord write was performed.
- PR #81 and the protected canonical checkout were not mutated.
- This receipt makes no provider-runtime or production-data parity claim.
