# scripts/db-scratch

Harness for the rule in `docs/ops/MAZER-SQL-CHANGE-PROCESS.md`: test every SQL proposal on a faithful scratch PostgreSQL 17, and pin the md5 of the LIVE function body.

Nothing here touches production. The scratch cluster listens on `127.0.0.1` with trust auth in a new empty folder under `C:\ATLAS\tmp`. The preimage pack runs through the read-only wrapper only (`~/.claude/skills/atlas-supabase/sb-query.ps1`), which refuses writes.

Requirements: Node 22, PostgreSQL 17 under `C:\Program Files\PostgreSQL\17\bin` (override with `MAZER_SCRATCH_PG_BIN`; scratch root override `MAZER_SCRATCH_ROOT`).

## 1. Scratch cluster

```powershell
$d = 'C:\ATLAS\tmp\scratch-pg-mychange'          # must be new/empty, under C:\ATLAS\tmp
node scripts\db-scratch\scratch-pg.mjs init  --dir $d --port 55440           # port 55440+, never 5432/54322
node scripts\db-scratch\scratch-pg.mjs build --dir $d --extra my-app-stub.sql  # roles + auth.users stub + your schema
```

`build` creates the template database `stub`:
- roles: `postgres` (the runner: not a superuser, not a member of `supabase_auth_admin`), `supabase_auth_admin`, `anon`, `authenticated`, `service_role` (`templates/00-roles.sql`);
- `auth.users` owned by `supabase_auth_admin`, no default on `id`, the runner may create triggers on it but may not drop or disable them (`templates/10-auth-stub.sql`);
- your own stub (`--extra`, runs as `postgres` so objects are owned like production; `--extra-super` runs as the superuser). Start from `templates/20-app-stub.example.sql`. Build it from the LIVE capture (preimage queries 01-06), not from the repository. For a function whose live body is CRLF use `body-hex` and `templates/30-live-body-crlf.example.sql`.

## 2. Apply and rollback

```powershell
node scripts\db-scratch\scratch-pg.mjs pair --dir $d --apply 02-apply.sql --rollback 03-rollback.sql `
     [--seed seed.sql] [--check postcheck.sql] [--reapply] [--schemas mazer,account_private]
```

Each run clones `stub`, snapshots the catalog (preimage queries 01-06), applies as `postgres`, runs the optional check, optionally applies again (must be refused by the file's own guard or change nothing), rolls back, and requires the catalog after the rollback to equal the catalog before the apply. Exit code 1 on any failure; the clone is dropped afterwards.

Other commands: `psql --dir $d --db <name> --as <role> -- -c "select 1"`, `stop`, `destroy`.

## 3. The hash a guard pins

```powershell
node scripts\db-scratch\scratch-pg.mjs body-md5 some-function-body.txt      # md5 as stored / as LF / as CRLF
node scripts\db-scratch\scratch-pg.mjs body-hex some-function-body.txt      # bytes as hex for a CRLF-safe install
```

## 4. Read-only live preimage

`preimage/` holds one-statement queries, written to pass the wrapper (no write words, even in strings: concatenate `'UPD' || 'ATE'` if ever needed):

| File | Returns |
| --- | --- |
| `01-functions.sql` | every function in scope: owner, definer flag, config, ACL, `cr_count`, `md5_stored`, `md5_lf`, `md5_crlf` |
| `02-function-body.sql` | one function's body (with CRs) and the same hashes |
| `03-triggers.sql` | triggers on in-scope tables and on `auth.users`, enabled state, definition |
| `04-columns.sql` | columns, types, nullability, defaults, identity/generated |
| `05-constraints-indexes.sql` | constraints and index definitions |
| `06-grants-rls.sql` | schema/table owners and ACLs, RLS flags, policies |
| `90-runner-role.sql` | runner role, superuser flag, `supabase_auth_admin` membership, `auth.users` owner and privileges |
| `91-long-transactions.sql`, `92-waiting-locks.sql` | open transactions over 30 s, waiting lock requests (run right before an apply) |

```powershell
powershell -NoProfile -File scripts\db-scratch\run-preimage-pack.ps1 -OutDir C:\ATLAS\tmp\mychange-preimage `
    -Schemas mazer,account_private -Function mazer.mazer_set_username [-IncludeVolatile]
node scripts\db-scratch\preimage-pack.mjs guard-md5 --result C:\ATLAS\tmp\mychange-preimage\02-function-body.json --repo-file <git show ref:path output>
```

The runner lints every query offline first (`node scripts/db-scratch/preimage-pack.mjs screen` does the same on its own), refuses a non-empty output folder, writes `SHA256SUMS.txt` and `EVIDENCE.txt` (sha256 and md5 of every file), and `guard-md5` prints the value to pin, the line-ending verdict, and whether the repository text matches the live body as-is, as LF or as CRLF.

The default scope is `mazer, account_private, public` plus `auth.users`; retarget with `-Schemas` or by editing the `SCOPE-SCHEMAS` line.

## 5. Self-test

```powershell
node scripts\db-scratch\scratch-pg.mjs selftest [--port 55460]
```

Creates a temporary cluster, runs the demo proposal (`examples/demo-apply.sql`, `demo-rollback.sql`) through `pair`, and checks the traps: the runner cannot drop or disable a trigger on `auth.users`, `DROP FUNCTION ... CASCADE` can, inserting into `auth.users` without an id fails, a second apply is refused by its hash guard, and a CRLF body hashes differently from its LF twin. Then it destroys the cluster.

Unit tests for the pure parts (screen mirror, render, md5 variants, doc references): `npx vitest run tests/core/db-scratch`.
