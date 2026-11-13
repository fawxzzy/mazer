# Mazer SQL change process (MAZER-PROG-018)

Status: process rule, written 2026-11-12 after the database work of that day (username guard, receipt columns, sign-in lockout v3 and v4).
Owner of the rule: the repository owner. Nothing in this file authorizes a database write: every apply still needs the approval box below.

## The rule

1. **Every SQL proposal is tested on a faithful scratch PostgreSQL 17 before anyone is asked to approve it.** The proposal's apply file AND its rollback file both run there, as the same role that will run them in production, and the catalog after the rollback must equal the catalog before the apply.
2. **Any hash guard pins the md5 of the LIVE function body, not the md5 of the repository copy.** The pin is `md5(prosrc)` as the production database stores it, read by a fresh read-only query (`scripts/db-scratch/preimage/02-function-body.sql`) right before the proposal is written, and re-read right before the apply.
3. **An independent reviewer reads the proposal before the owner is asked.** The reviewer gets the files, the evidence logs and the live capture, not the author's conclusion.
4. **The owner approves the sha256 of the exact apply file** in a question box. A hash approved and a hash applied must be of the same bytes.

Why rule 2 exists: on 2026-11-12 the live `mazer.mazer_set_username` body had CRLF line endings while the repository blob had LF. A first guard pinned the md5 of the repository text. It passed on a scratch database built from the repository and would have aborted on production, because `md5(prosrc)` of the live CRLF body is a different value. It was caught only because the live body was captured and hashed before the apply was proposed.

## SQL proposal checklist

Copy this into the proposal's README. Every line is either done with a pointer to its evidence, or marked N/A with a reason.

- [ ] **Live capture**: read-only preimage pack run against production (`scripts/db-scratch/run-preimage-pack.ps1`), folder kept, `EVIDENCE.txt` written. Function bodies, triggers, columns, grants and RLS come from it, not from the repository.
- [ ] **Pin source**: the md5 in the guard is `md5_stored` from the live capture (`preimage-pack.mjs guard-md5`), and the report says whether the repository file matches it as-is, as LF or as CRLF.
- [ ] **Faithful scratch stub**: PostgreSQL 17 cluster built with `scripts/db-scratch/scratch-pg.mjs`; `auth.users` owned by a stub `supabase_auth_admin`; applier role `postgres` is not a superuser and not a member of `supabase_auth_admin`; live function bodies installed byte for byte (hex install for CRLF bodies).
- [ ] **Apply and rollback pair** run by `scratch-pg.mjs pair`: apply clean, second apply refused by its own guard or a no-op, rollback clean, catalog after rollback equals catalog before.
- [ ] **Rollback works for the runner role**: no `DROP TRIGGER` or `DISABLE TRIGGER` on `auth.users`. Use `DROP FUNCTION ... CASCADE` on a function the runner owns, after checking the trigger is its only dependent.
- [ ] **Mutation and abort tests**: the guard aborts on a changed body, a missing function, a wrong owner; each shown with a log.
- [ ] **Concurrency and cost** where the change adds a trigger or lock: measured on the stub, numbers in the README.
- [ ] **Evidence logs carry sha256 headers** (`### tested_file=<path> sha256=<hash>`), and the index lists which logs carry a hash.
- [ ] **Independent review** done by a reviewer that was given the artifacts, with the verdict and findings recorded.
- [ ] **Fresh read-only preimage** run immediately before the apply (minutes, not hours): drift check against the capture, long transactions, waiting locks (`-IncludeVolatile`).
- [ ] **Boxes**: the owner approved the sha256 of the exact apply file; the apply ran through the wrapper with that hash; a postimage read-back followed; the rollback file and its hash are on hand.

Pull requests that touch `supabase/migrations/**` or add SQL proposals link this checklist (see `.github/pull_request_template.md`).

## Pattern

```
live capture (read-only)  ->  stub built from the capture  ->  apply + rollback on scratch  ->  mutants / concurrency
        ->  independent review  ->  fresh preimage  ->  owner box (sha256)  ->  apply  ->  postimage read-back
```

Tooling in `scripts/db-scratch/` (see its README):

| Step | Tool |
| --- | --- |
| Throwaway PG 17 cluster in a new empty folder under `C:\ATLAS\tmp` | `scratch-pg.mjs init` |
| Stub: roles, `auth.users`, your application schema | `scratch-pg.mjs build` with `templates/` |
| Apply + rollback + catalog equality | `scratch-pg.mjs pair` |
| Read-only live preimage (function md5/ACL/owner, triggers, columns/defaults/constraints, grants/RLS, long transactions) | `run-preimage-pack.ps1` over `preimage/*.sql` |
| The hash to pin, and the CRLF/LF verdict | `preimage-pack.mjs guard-md5`, `scratch-pg.mjs body-md5` |
| Prove the harness itself still reproduces the traps below | `scratch-pg.mjs selftest` |

## Failure modes

### CRLF versus LF in the md5 guard
- Live `prosrc` was CRLF; the git blob was LF. `md5(prosrc)` differs, so a guard pinned from the repository aborts on production.
- Related traps that produce the same mistake: git `autocrlf` on Windows turns a working-copy file into CRLF while the blob is LF; `psql -f` on Windows reads in text mode and drops CRs, so a scratch body built from a CRLF capture silently becomes LF and the scratch test passes for the wrong reason.
- Defence: pin `md5_stored` from the live read (query 01 or 02), which also returns `cr_count`, `md5_lf` and `md5_crlf`. Install a CRLF live body in scratch from hex (`templates/30-live-body-crlf.example.sql`). Take any repository comparison text from `git show <ref>:<path>`, never from a working copy.

### The production runner role
- The runner is the non-superuser role `postgres`. It is **not a member of supabase_auth_admin** and does not own `auth.users`.
- `CREATE TRIGGER` on `auth.users` works (it holds `TRIGGER`). `DROP TRIGGER` and `ALTER TABLE ... DISABLE TRIGGER` fail with "must be owner of relation users".
- So the rollback for a trigger on `auth.users` is `DROP FUNCTION <trigger function> CASCADE` on a function the runner owns; the dependent trigger goes with it. Check the trigger is the function's only dependent first (a second dependent would be dropped too). Test the rollback as `postgres` on scratch, never as a superuser: a superuser rollback proves nothing about production.
- Live check: preimage query 90 reports the runner, its membership and its privileges on `auth.users`.

### The read-only wrapper (`sb-query.ps1`)
- It strips comments, lower-cases the file and refuses it if any of `insert update delete drop alter create grant revoke truncate vacuum reindex cluster call do copy lock notify listen refresh merge comment security reset set begin commit rollback` appears as a whole word, **inside string literals too**. Build such words by concatenation: `'UPD' || 'ATE'`. Column names like `prosecdef` and `pg_locks` are fine. `lib/sql-screen.mjs` mirrors the screen so a query is checked before any network call.
- It returns **only the last statement's rows**. One statement per file; combine results with `union all` or a CTE, or run several files.
- The comment strip deletes everything after `--`, even inside a string.
- The wrapper logs `ref/sha/mode` (never credentials) to `C:\ATLAS\tmp\supabase-queries.log`.

### `auth.users` has no default on `id`
- Fixtures that insert into `auth.users` must supply `id`. The stub reproduces this; an insert without `id` fails with a not-null violation.

### Other recurring traps
- **Stub built from the repository instead of the live capture**: tables, defaults, grants or bodies differ. Build from queries 01-06.
- **A neutralised trigger left behind** when no clean rollback path exists: say so in the rollback file and the index (`ROLLBACK_PATH=...`), and make the next apply handle it.
- **Collation**: the scratch cluster defaults to `C`; production reports `en_US.UTF-8`. Pass `--locale` to `init` when ordering or `lower()` behaviour matters, and read `db_collation` from query 90.
- **Approval of the wrong bytes**: an owner-gated flag edited after hashing. Hash the file after the last edit, and approve that hash.

## Evidence logging

- Every log of a step that ran a file under test starts with `### tested_file=<path> sha256=<hash>`. Snapshot, counter, diff and summary logs do not carry a file hash; the index says `HASH` or `no hash` for each log.
- One evidence folder per proposal, never reused. The preimage runner refuses a non-empty folder.
- Keep `SHA256SUMS.txt` next to the files the owner approves.

## Boxes (who decides what)

| Action | Gate |
| --- | --- |
| Read-only preimage through the wrapper | no box (the wrapper refuses anything else) |
| Scratch PostgreSQL work | no box (local, throwaway, 127.0.0.1 only) |
| Any write or DDL on production | owner question box naming the sha256 of the exact file, fresh preimage shown, rollback plan shown |
| Applying | `sb-query.ps1 -Write -ApprovedSha256 <sha256>` after the box, one transaction in the file, postimage read-back after |

## Where the earlier evidence lives (local workstation, not in git)

- `C:\ATLAS\tmp\scratch-pg-dupguard` : global username guard (guard on `auth.users`, rollback paths, mutants, concurrency).
- `C:\ATLAS\tmp\scratch-pg-mazer` : receipt columns and `mazer_set_username` (the CRLF live-body capture and md5 scripts).
- `C:\ATLAS\tmp\scratch-pg-signin` : sign-in index trigger and edge harness.
- `C:\ATLAS\tmp\scratch-pg-lockout-v4` : lockout v4 cluster.
- Proposal folders: `C:\ATLAS\tmp\proposed-sql\` (each with a README and `SHA256SUMS.txt`).

No secret is stored in any of these; the harness never reads one.
