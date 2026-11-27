# Proposal: in-app Help messages table and submit RPC (2026-11-26)

Status: PROPOSED, NOT APPLIED. Nothing here ran against Supabase (the only live access was read-only preimage SQL). Applying needs an owner box naming the sha256 of the exact apply file (`../../MAZER-SQL-CHANGE-PROCESS.md`). The client is NOT built in this lane (plan at the end). UI options: PR #728 (`help-options.html`, picks: placement A "Help", view A "Short answers" + Contact us, form C "Email first").

Apply file: `apply.sql` (one transaction, new objects only). Rollback: `rollback.sql`. Hashes: `SHA256SUMS.txt` (LF bytes as committed; `.gitattributes` keeps `docs/ops/sql-proposals/**` LF; hash and apply only LF bytes).
Scratch evidence:
- pglite: `scratch-test/helptest.cjs` (run: `PGLITE_SANDBOX=<dir with @electric-sql/pglite 0.5.13> node helptest.cjs <repo root>`), log `scratch-test/run-pglite.txt` (`### tested_file=... sha256=...` headers for apply, rollback and both ops files; 123 checks, 0 failed).
- PostgreSQL 17.9 with the repo harness (`scripts/db-scratch/scratch-pg.mjs`, non-superuser runner `postgres`, `auth.users` owned by a stub `supabase_auth_admin`): `scratch-test/pg17/run-pg17-pair.txt` (apply clean, check passes, second apply refused by its own guard, rollback clean, catalog after rollback equals catalog before) and `scratch-test/pg17/run-pg17-rollback-with-rows.txt` (rollback with a row keeps the table and drops only the function; the owner read file parses and returns the row; the close template closes exactly one row; an empty table is then dropped). Both logs carry sha256 headers for every input. Stub and inputs: `scratch-test/pg17/` (reduced shape: schema mazer plus a two-column `mazer_profiles`).
Live read-only preimage (2026-11-27 04:17Z UTC): `preimage/c_help_v1.sql` (read-only, one statement, passes the wrapper screen) and `preimage/c_help_v1.json`. Standard pack (`run-preimage-pack.ps1`, schemas mazer + account_private, `-IncludeVolatile`, `EVIDENCE.txt` + hashes): `preimage/pack/`; no help object appears in it. `pack/SHA256SUMS.txt` (the query files) verifies as committed; the JSON hashes in `EVIDENCE.txt` are of the bytes as captured (CRLF with a BOM), while git stores those JSON files LF (`.gitattributes`), so they match only before checkout normalisation.

## Decisions (Zac: "store them somewhere specific in the database, you decide best")
1. **A separate table, `mazer.mazer_help_requests`, not `mazer_feedback`.** Feedback rows are ratings with no contact data, kept indefinitely and safe to aggregate; Help rows carry an email address (PII), have a workflow (open / closed), need a shorter retention, a smaller set of viewers, and must accept guests (feedback is signed-in only, `user_id not null`). Mixing them would force nullable columns, a type flag on every query, and PII into a table that is otherwise safe to read broadly.
2. **Guests and signed-in players can both send.** Most players never sign in, and people who need help are often the ones who could not (lost progress, sign-in trouble). Form C asks for an email, so a reply works without an account. Precedent: `mazer.mazer_leaderboard_page` is already executable by `anon` (live). `user_id` is NULL for a guest and comes from `auth.uid()` only for a signed-in caller (no user-id parameter exists).
3. **Email is required for everyone**, including signed-in players: username accounts may have no real email, and the address typed is the one the player wants the reply at.
4. **Locked down like feedback:** RLS enabled (not forced) with no policy, no table privilege for `anon` / `authenticated` / `public`. The only write path is `mazer.mazer_submit_help_request_v1`: SECURITY DEFINER, `search_path=''`, `lock_timeout=3s`, owned by the table owner. Nobody can read any message through the API, not even their own.
5. **IP-free rate limits** (constants in the function; change only with a new function version), counted exactly under one transaction advisory lock:
   - per signed-in user: 3 per rolling hour, 10 per rolling 24 h;
   - per email address (lower-cased, guests and players together): 3 per hour, 10 per 24 h;
   - all guests together: 20 per hour;
   - everyone: 60 per hour.
   The guest pool sits under the global cap, so a guest flood can take at most 20 of the 60 hourly slots and signed-in players keep at least 40. When several limits are used up the answer is the longest wait. Invalid calls are rejected before the lock and consume no budget.
6. **service_role** (a future owner page): select and delete, UPDATE on `status` and `closed_at` only; no insert, cannot rewrite `message` or `contact_email`. The apply asserts this.
7. **Account deletion:** `user_id references auth.users(id) on delete cascade`, so a deleted account's messages go with it, with no change to the live `delete_account_v2` (its body md5 `e6569397d035916a3c5d1b7b6bd93148` is unchanged and mentions neither table; its unlisted-FK checks run only at its own apply time). Guest rows are not linked to any account, so they are not removed by an account deletion (by design, see Open questions).

## What it creates
- Table `mazer.mazer_help_requests`: `id uuid` pk (`gen_random_uuid()`), `user_id uuid` NULL (FK, cascade), `contact_email text not null`, `message text not null`, `status text not null default 'open'` (`open` / `closed`), `closed_at timestamptz` (set exactly when closed, CHECK-enforced), best-effort `build_id`, `player_level`, `game_mode`, `created_at`. No IP, user agent or device id.
- CHECKs: email 3..254 characters, `local@domain.tld` shape with no spaces, control characters or second `@`; message 1..2000 characters (characters, not bytes) and already trimmed; status / closed_at consistency; context shapes as in feedback (`build_id ^[A-Za-z0-9._+-]{1,64}$`, level 0..1000000, mode `^[a-z][a-z0-9_]{0,31}$`).
- Indexes: `(user_id, created_at desc) where user_id is not null`, `(lower(contact_email), created_at desc)`, `(created_at desc)`.
- Function `mazer.mazer_submit_help_request_v1(p_email text, p_message text, p_build_id text default null, p_player_level integer default null, p_game_mode text default null) returns jsonb`. EXECUTE: `anon`, `authenticated` (not `public`). Returns `{"status":"saved"}` or `{"status":"rate_limited","retry_after_seconds":n}`.
- Error codes (message text is the bare code, nothing else):

| Code | SQLSTATE | When |
|---|---|---|
| `MAZER_HELP_BAD_EMAIL` | 22023 | email missing, under 3 or over 254 characters after trimming, or not `x@y.z` shape |
| `MAZER_HELP_MESSAGE_EMPTY` | 22023 | message missing or only whitespace |
| `MAZER_HELP_MESSAGE_TOO_LONG` | 22001 | over 2000 characters after trimming |
| (55P03 lock_not_available) | 55P03 | the advisory lock waited over 3 s (flood); treat as a generic failure, not rate_limited |

- Apply-time codes: `MAZER_HELP_PREIMAGE_MISSING_SCHEMA`, `_MISSING_AUTH_USERS`, `_FUNCTION_EXISTS` (any signature), `_TABLE_EXISTS` (any shape); post-image `MAZER_HELP_POSTIMAGE_CLIENT_TABLE_PRIVILEGE`, `_SERVICE_ROLE_PRIVILEGE`, `_RLS_OFF`, `_UNEXPECTED_POLICY`, `_FUNCTION_ACL`, `_FUNCTION_SHAPE`, `_FOREIGN_KEY`. Any of them aborts the whole transaction.
- Nothing existing is altered.

## Email (PII) handling
- Stored as typed: trimmed (space, tab, CR, LF), case kept so the reply goes to exactly what was typed, capped at 254 characters. Compared lower-cased only for the per-address limit. No verification email is sent and the address is not linked to the account's own email.
- Never echoed: the function validates every value with the same rules as the table CHECKs before inserting, so a CHECK violation (whose DETAIL would print the whole row to the caller and the server log) is unreachable through the function (tested: no function call reached a CHECK). Errors are bare codes.
- Never logged: live `log_parameter_max_length_on_error = 0`, so the bound parameters of a failed call are not written to the log; `log_statement = ddl`, `log_min_duration_statement = -1`. Caveat: `log_parameter_max_length = -1` means that if duration logging is ever turned on, parameters (email and message) would be logged in full. Set it to 0 first if that ever changes.
- The owner read output holds emails: it stays in the scratchpad, is never committed, pasted or logged, and is deleted once the messages are answered.
- The per-address limit is a small oracle: a caller can learn that an address sent 3 messages in the last hour (or 10 in a day). It reveals nothing else and costs the caller the same budget; accepted.
- Someone could type a victim's address 3 times to block that address for an hour. Low value to an attacker; the victim can use another address or sign in (their user budget is separate, but the address cap still binds). Accepted.
- Message text is untrusted plain text from guests too: any viewer must HTML-escape it and neutralise a leading `= + - @` in a spreadsheet export. Nothing here renders it.

## Live preimage facts (read-only, 2026-11-27 04:17Z)
- No relation or function named like help or support in any schema; `mazer.mazer_help_requests` and the function are absent.
- Schema mazer ACL includes `anon=U` and `authenticated=U`; no default ACLs in mazer. Only `mazer.mazer_leaderboard_page` is executable by `anon`.
- `mazer.mazer_feedback` exists (2 rows, `service_role=rd`). Every existing mazer FK to `auth.users` cascades.
- Runner `postgres`: not superuser, bypasses RLS, not a member of `supabase_auth_admin`. `authenticator` has `statement_timeout=8s`, `lock_timeout=8s`. `auth.users`: 137 rows, 0 anonymous, 0 created in the last 24 h; no open transactions and no ungranted lock waits at read time.

## Checklist (`../../MAZER-SQL-CHANGE-PROCESS.md`)
- [x] Live capture: standard pack in `preimage/pack/` with `EVIDENCE.txt`, plus `preimage/c_help_v1.*`.
- [x] Pin source: N/A, no hash guard (new objects only; the preflight refuses any existing function of that name or table of that name).
- [x] Faithful scratch stub: PG 17.9, `auth.users` owned by stub `supabase_auth_admin`, runner `postgres` non-superuser and not a member. No live function body is involved.
- [x] Apply and rollback pair: passed (`run-pg17-pair.txt`).
- [x] Rollback works for the runner role: no trigger on `auth.users`; dropping the table drops its FK (tested as `postgres`).
- [x] Mutation and abort tests: 4 preflight aborts, 10 post-image mutants, RLS mutant, re-apply abort (pglite log).
- [ ] Concurrency and cost: the advisory lock and `lock_timeout` are untested under real contention (pglite is single-connection; the PG17 check runs one session).
- [x] Evidence logs carry sha256 headers: `run-pglite.txt` HASH, `run-pg17-pair.txt` HASH, `run-pg17-rollback-with-rows.txt` HASH; `preimage/pack/SHA256SUMS.txt` lists the pack.
- [ ] Independent review: NOT DONE.
- [ ] Fresh read-only preimage immediately before the apply: to do at apply time.
- [ ] Boxes (owner approves the sha256 in `SHA256SUMS.txt`, apply through the wrapper, post-image read-back): to do.

## Repeating the PG17 run
```
node scripts/db-scratch/scratch-pg.mjs init  --dir C:\ATLAS\tmp\scratch-pg-help-v1 --port 55441
node scripts/db-scratch/scratch-pg.mjs build --dir C:\ATLAS\tmp\scratch-pg-help-v1 --extra docs/ops/sql-proposals/mazer-help-requests-20261126/scratch-test/pg17/app-stub.sql
node scripts/db-scratch/scratch-pg.mjs pair  --dir C:\ATLAS\tmp\scratch-pg-help-v1 --apply docs/ops/sql-proposals/mazer-help-requests-20261126/apply.sql --rollback docs/ops/sql-proposals/mazer-help-requests-20261126/rollback.sql --seed docs/ops/sql-proposals/mazer-help-requests-20261126/scratch-test/pg17/seed.sql --check docs/ops/sql-proposals/mazer-help-requests-20261126/scratch-test/pg17/check.sql --reapply --schemas mazer
powershell -File docs/ops/sql-proposals/mazer-help-requests-20261126/scratch-test/pg17/rollback-with-rows.ps1
node scripts/db-scratch/scratch-pg.mjs stop --dir C:\ATLAS\tmp\scratch-pg-help-v1
```
(`init` refuses a non-empty folder: use a new `--dir` for a repeat.) Known limits: `check.sql` calls the function as the owner (the client path is covered by privilege checks here and by role switching in the pglite test); the stub `auth.users` has RLS off; the cluster uses locale C, so `lower()` folds only ASCII there, while production (`en_US.UTF-8`) also folds non-ASCII letters for the per-address limit.

## Apply order (when approved)
1. In the minutes before the apply, re-run `preimage/c_help_v1.sql` read-only and the pack with `-IncludeVolatile` (runner role, long transactions, waiting locks; the FK takes SHARE ROW EXCLUSIVE on `auth.users`, which waits behind sign-up writes and autovacuum). If anything differs or a long transaction is open, stop. Apply in a quiet window; a wait over 3 s aborts with nothing changed.
2. Apply `apply.sql` through the wrapper with the approved sha256. It is independent of every other pending change.
3. Read back the post-image (the apply asserts it; a read-only catalog query confirms), then the client PR can ship.
4. Follow-up in FawxzzyWeb (separate repo, not needed for deletion to work): add `mazer.mazer_help_requests.user_id:c` to the optional FK list in `supabase/proposed/20261116090000_account_delete_self_v2.sql`, so a future re-apply of that file passes its own unlisted-FK sweep.

## Rollback
`rollback.sql` drops the function first (intake stops), then drops the table only when it holds zero rows (locked, counted, dropped in one transaction). With rows it raises notice `MAZER_HELP_ROLLBACK_KEPT_TABLE rows=n` and keeps the data; clients still have no privilege and RLS stays on. Answer or export the messages, delete them deliberately, and run the rollback again. Same 3 s / 15 s timeouts as the apply.

## How Zac reads and closes messages
- Read (read-only, passes the wrapper screen): `ops/read-open-help-requests.sql` returns open messages oldest first (id, time, email, message, signed_in, username for players, build, level, mode, open_total), 50 at a time:
  `powershell -NoProfile -File <skills>\atlas-supabase\sb-query.ps1 -SqlFile ops\read-open-help-requests.sql -OutFile <scratchpad>\help-open.json`
- Reply by email from your own mail client to `contact_email`.
- Close (optional, a production write): `ops/close-help-request.sql` is a template. Put the id in, hash the edited file, run it with `-Write -ApprovedSha256 <hash>`. It closes at most one open row and returns it; no row back means wrong id or already closed. It never edits the email or the message.
- Retention is not automated in v1. Recommendation: delete closed messages older than 180 days in a periodic owner-run statement (or a later scheduled job). See Open questions.

## Client plan (NOT built in this lane)
- RPC: `client.rpc('mazer_submit_help_request_v1', { p_email, p_message, p_build_id, p_player_level, p_game_mode })` on the client bound to the mazer schema (`getLegacyAuthClient`, as `legacyFeedbackSubmit.ts` does). Signed-out players call it with the anon key (the same client without a session); signed-in players' JWT gives `auth.uid()`. Context: `p_build_id` from `legacyBuildId.ts`, level and mode from the current run, all optional.
- Placement A: "Help" row with the lifebuoy icon after Guide. View A "Short answers": three short FAQ rows and a primary "Contact us" button. Form C "Email first": "Your email" (type email, hint "We reply here."), "Message" (textarea; raise `maxLength` from the options page's 500 to 2000 to match the server), Send disabled until the message has text. Pre-fill nothing; never store the typed email on the device beyond the open form.
- Result vocabulary like feedback: saved / rate_limited / offline / failed. Every notice goes through the in-flow status banner (`createStatusBanner`), never inline red text.

| Server result | Copy (proposed; the sent and failed lines are the picked ones from #728) |
|---|---|
| `{"status":"saved"}` | "Sent. Thank you, we will reply by email." |
| `MAZER_HELP_BAD_EMAIL` | "Check your email address and try again." (keep the typed text) |
| `MAZER_HELP_MESSAGE_EMPTY` | "Write a message first." (normally unreachable: Send is disabled) |
| `MAZER_HELP_MESSAGE_TOO_LONG` | "Your message is too long. Keep it under 2000 characters." |
| `rate_limited` | "You have sent a few messages already. Try again in N minutes." (N = ceil(retry_after_seconds / 60), hours when over 90 minutes) |
| network error (offline regex) | "Could not send. Check your connection and try again." + Try again |
| anything else (incl. 55P03) | "Could not send. Check your connection and try again." + Try again |

- Tests the client PR needs: the mapping above with fixtures, signed-out uses the anon path, maxLength 2000, no email in any log or telemetry, Guide/help copy drift test if the Help view lists controls.

## Open questions for Zac
1. Retention: delete closed messages after 180 days (recommended), keep forever, or a different number?
2. Limits: 3/hour and 10/day per player and per address, 20/hour for all guests, 60/hour overall. Fine as a start?
3. Guest rows stay when a player who wrote as a guest later deletes an account (we cannot link them). Deleting by email on request is a manual owner statement. Acceptable?
