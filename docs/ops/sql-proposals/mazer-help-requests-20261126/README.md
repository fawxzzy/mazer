# Proposal: in-app Help messages table and submit RPC (2026-11-26)

Status: PROPOSED, NOT APPLIED. Nothing here ran against Supabase (the only live access was read-only preimage SQL). Applying needs an owner box naming the sha256 of the exact apply file (`../../MAZER-SQL-CHANGE-PROCESS.md`). The client is NOT built in this lane (plan at the end). UI options: PR #728 (`help-options.html`, picks: placement A "Help", view A "Short answers" + Contact us, form C "Email first").

Apply file: `apply.sql` (one transaction, new objects only). Rollback: `rollback.sql`. Hashes: `SHA256SUMS.txt` (LF bytes as committed; `.gitattributes` keeps `docs/ops/sql-proposals/**` LF; hash and apply only LF bytes).
Scratch evidence:
- pglite: `scratch-test/helptest.cjs` (run: `PGLITE_SANDBOX=<dir with @electric-sql/pglite 0.5.13> node helptest.cjs <repo root>`), log `scratch-test/run-pglite.txt` (`### tested_file=... sha256=...` headers for apply, rollback and the three ops files; 131 checks, 0 failed).
- PostgreSQL 17.9 with the repo harness (`scripts/db-scratch/scratch-pg.mjs`, non-superuser runner `postgres`, `auth.users` owned by a stub `supabase_auth_admin`): `scratch-test/pg17/run-pg17-pair.txt` (apply clean, check passes, second apply refused by its own guard, rollback clean, catalog after rollback equals catalog before) and `scratch-test/pg17/run-pg17-rollback-with-rows.txt` (rollback with a row keeps the table and drops only the function; the owner read file parses and returns the row; the close template closes exactly one row; an empty table is then dropped), and `scratch-test/pg17/run-pg17-race.txt` (two real connections racing for the last guest slot: 5 of 5 trials save exactly one, and a mutant with the advisory lock removed over-fills in 5 of 5, see Concurrency below). All three logs carry sha256 headers for every input. Stub and inputs: `scratch-test/pg17/` (reduced shape: schema mazer plus a two-column `mazer_profiles`).
Live read-only preimage (2026-11-27 04:17Z UTC): `preimage/c_help_v1.sql` (read-only, one statement, passes the wrapper screen) and `preimage/c_help_v1.json`. Standard pack (`run-preimage-pack.ps1`, schemas mazer + account_private, `-IncludeVolatile`, `EVIDENCE.txt` + hashes): `preimage/pack/`; no help object appears in it. `pack/SHA256SUMS.txt` (the query files) verifies as committed; the JSON hashes in `EVIDENCE.txt` are of the bytes as captured (CRLF with a BOM), while git stores those JSON files LF (`.gitattributes`), so they match only before checkout normalisation.

## Decisions (Zac: "store them somewhere specific in the database, you decide best")
1. **A separate table, `mazer.mazer_help_requests`, not `mazer_feedback`.** Feedback rows are ratings with no contact data, kept indefinitely and safe to aggregate; Help rows carry an email address (PII), have a workflow (open / closed), need a shorter retention, a smaller set of viewers, and must accept guests (feedback is signed-in only, `user_id not null`). Mixing them would force nullable columns, a type flag on every query, and PII into a table that is otherwise safe to read broadly.
2. **Guests and signed-in players can both send.** Most players never sign in, and people who need help are often the ones who could not (lost progress, sign-in trouble). Form C asks for an email, so a reply works without an account. Precedent: `mazer.mazer_leaderboard_page` is already executable by `anon` (live). `user_id` is NULL for a guest and comes from `auth.uid()` only for a signed-in caller (no user-id parameter exists).
3. **Email is required for everyone**, including signed-in players: username accounts may have no real email, and the address typed is the one the player wants the reply at.
4. **Locked down like feedback:** RLS enabled (not forced) with no policy, no table privilege for `anon` / `authenticated` / `public`. The only write path is `mazer.mazer_submit_help_request_v1`: SECURITY DEFINER, `search_path=''`, `lock_timeout=3s`, owned by the table owner. Nobody can read any message through the API, not even their own.
5. **IP-free rate limits** (constants in the function; change only with a new function version):
   - per signed-in user: 3 per rolling hour, 10 per rolling 24 h;
   - per email address (lower-cased, guests and players together): 3 per hour, 10 per 24 h;
   - all guests together: 30 per hour (raised from 20 after review; all tests pass at 30);
   - everyone: 90 per hour (raised from 60).
   The guest pool sits under the global cap, so a guest flood can take at most 30 of the 90 hourly slots and signed-in players keep at least 60. When several limits are used up the answer is the longest wait (tested with the long wait found first and found last; a mutant without `greatest()` fails). Invalid calls are rejected before any count and consume no budget.
   Counting runs twice: a first count without any lock answers `rate_limited` straight away when a limit is already used up, so a flood is refused without queueing; a call that passes takes one transaction advisory lock and counts again in a fresh snapshot, and only that second count lets a message in. The race test below shows this keeps the counts exact.
6. **service_role** (a future owner page): select and delete, UPDATE on `status` and `closed_at` only; no insert, cannot rewrite `message` or `contact_email`. The apply asserts this.
7. **Account deletion:** `user_id references auth.users(id) on delete cascade`, so a deleted account's messages go with it, with no change to the live `delete_account_v2` (its body md5 `e6569397d035916a3c5d1b7b6bd93148` is unchanged and mentions neither table; its unlisted-FK checks run only at its own apply time). Guest rows are not linked to any account, so they are not removed by an account deletion (by design; deleting them on request is a manual owner statement by email address).

## Known trade-off: a guest flood can close the guest pool for an hour
- **The problem, plainly:** about 30 anonymous calls in an hour, each with a made-up address, fill the guest pool. After that every guest gets `rate_limited` until the oldest of those messages is an hour old. The per-address limit does not stop this, because invented addresses cost nothing. Signed-in players are not affected (they keep at least 60 of the 90 hourly slots).
- **Why we accept it:** a support form is low stakes, and the alternative (no guest ceiling) lets anyone fill the table without bound. The ceiling caps the damage at 30 junk rows an hour and keeps the owner's reading load bounded.
- **The real fix, later:** put a captcha or an Edge Function in front of guest submits (the FW-CAPTCHA-001 style), so a script cannot make cheap anonymous calls. Not part of v1.
- **Client rule (required):** whenever the RPC answers `rate_limited`, the Help view must still show the "Contact us" fallback (a way to reach the owner outside this form), so a flooded guest pool never leaves a player with no way to ask for help.
- **Seeing it happen:** `ops/read-help-intake-last-hour.sql` (read-only, counts only, no email or message) shows guest messages in the last hour against the limit of 30, the number of distinct guest addresses, the oldest guest message in the window (guests are refused until it is an hour old), signed-in messages and the total against 90. A guest count at 30 with nearly as many distinct addresses is this flood.

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
| (55P03 lock_not_available) | 55P03 | the advisory lock waited over 3 s under heavy concurrent submits (calls already over a limit are refused before the lock); treat as a generic failure, not rate_limited |
| (23503 foreign_key_violation) | 23503 | a deleted account whose JWT is still valid (see Email handling); treat as a generic failure |

- Apply-time codes: `MAZER_HELP_PREIMAGE_MISSING_SCHEMA`, `_MISSING_AUTH_USERS`, `_FUNCTION_EXISTS` (any signature), `_TABLE_EXISTS` (any shape); post-image `MAZER_HELP_POSTIMAGE_CLIENT_TABLE_PRIVILEGE`, `_SERVICE_ROLE_PRIVILEGE`, `_RLS_OFF`, `_UNEXPECTED_POLICY`, `_FUNCTION_ACL`, `_FUNCTION_SHAPE`, `_FOREIGN_KEY`. Any of them aborts the whole transaction.
- Nothing existing is altered.

## Email (PII) handling
- Stored as typed: trimmed (space, tab, CR, LF), case kept so the reply goes to exactly what was typed, capped at 254 characters. Compared lower-cased only for the per-address limit. No verification email is sent and the address is not linked to the account's own email.
- Never echoed: the function validates every value with the same rules as the table CHECKs before inserting, so a CHECK violation (whose DETAIL would print the whole row to the caller and the server log) is unreachable through the function (tested: no function call reached a CHECK). Validation errors are bare codes. One exception that is not a bare code: a player whose account was deleted but whose JWT is still valid (up to the token lifetime) calls in with an `auth.uid()` that no longer exists in `auth.users`, so the insert hits the foreign key and returns 23503, whose DETAIL is `Key (user_id)=(<uuid>) is not present in table "users".` That uuid is the caller's OWN user id, taken from their own token; no email or message text appears (tested in pglite). The client treats it as a generic failure.
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
- [x] Mutation and abort tests: 4 preflight aborts, 10 post-image mutants, RLS mutant, `greatest()` mutant, re-apply abort (pglite log); advisory-lock mutant (PG17 race log).
- [x] Concurrency: `scratch-test/pg17/race-test.mjs` on PG17, see Concurrency below. Not tested: the 3 s `lock_timeout` firing under a real queue of waiters (55P03 path), and cost at production row counts (the volume is capped at 90 rows an hour).
- [x] Evidence logs carry sha256 headers: `run-pglite.txt`, `run-pg17-pair.txt`, `run-pg17-rollback-with-rows.txt`, `run-pg17-race.txt`; `preimage/pack/SHA256SUMS.txt` lists the pack.
- [ ] Independent review: first review at `57d1a688` returned HOLD (docs and tests only: guest-pool trade-off, untested lock, weak case and order tests, README wording). Fixed in this head; delta re-review pending.
- [ ] Fresh read-only preimage immediately before the apply: to do at apply time.
- [ ] Boxes (owner approves the sha256 in `SHA256SUMS.txt`, apply through the wrapper, post-image read-back): to do.

## Concurrency (PG17 race test)
`scratch-test/pg17/race-test.mjs` opens two real connections (runner role, no JWT, so both callers are guests) with the guest pool pre-filled to 29 of 30. Session A submits inside an open transaction and holds it for 2 s; session B submits while A is still open. A handshake on two marker advisory locks fixes the order, so process start-up delays cannot change it. A trial also fails if B did not call while A was still open.
- As proposed: in 5 of 5 trials A is saved and B is refused. B passes the unlocked first count, waits about 1.7 s on the advisory lock until A commits, recounts and sees 30. The pool ends at exactly 30.
- Mutant (`apply.sql` with the lock line replaced by `null;`): in 5 of 5 trials both are saved and the pool ends at 31. So the test bites, and the early unlocked count does not weaken it, because only the locked second count admits a message.
- Assumption: the caller's transaction is READ COMMITTED (the PostgREST default; the function sets no isolation level), so the locked recount takes a fresh snapshot. Under REPEATABLE READ the recount would not see A's commit. Same property as the single-count design; nothing here changes the isolation level.

## Repeating the PG17 run
```
node scripts/db-scratch/scratch-pg.mjs init  --dir C:\ATLAS\tmp\scratch-pg-help-v2 --port 55442
node scripts/db-scratch/scratch-pg.mjs build --dir C:\ATLAS\tmp\scratch-pg-help-v2 --extra docs/ops/sql-proposals/mazer-help-requests-20261126/scratch-test/pg17/app-stub.sql
node scripts/db-scratch/scratch-pg.mjs pair  --dir C:\ATLAS\tmp\scratch-pg-help-v2 --apply docs/ops/sql-proposals/mazer-help-requests-20261126/apply.sql --rollback docs/ops/sql-proposals/mazer-help-requests-20261126/rollback.sql --seed docs/ops/sql-proposals/mazer-help-requests-20261126/scratch-test/pg17/seed.sql --check docs/ops/sql-proposals/mazer-help-requests-20261126/scratch-test/pg17/check.sql --reapply --schemas mazer
powershell -File docs/ops/sql-proposals/mazer-help-requests-20261126/scratch-test/pg17/rollback-with-rows.ps1 -Dir C:\ATLAS\tmp\scratch-pg-help-v2
node docs/ops/sql-proposals/mazer-help-requests-20261126/scratch-test/pg17/race-test.mjs --dir C:\ATLAS\tmp\scratch-pg-help-v2
node scripts/db-scratch/scratch-pg.mjs stop --dir C:\ATLAS\tmp\scratch-pg-help-v2
```
(`init` refuses a non-empty folder: use a new `--dir` for a repeat.) Known limits: `check.sql` calls the function as the owner (the client path is covered by privilege checks here and by role switching in the pglite test); the stub `auth.users` has RLS off; the cluster uses locale C, so `lower()` folds only ASCII there, while production (`en_US.UTF-8`) also folds non-ASCII letters for the per-address limit.

## Apply order (when approved)
1. In the minutes before the apply, re-run `preimage/c_help_v1.sql` read-only and the pack with `-IncludeVolatile` (runner role, long transactions, waiting locks; the FK takes SHARE ROW EXCLUSIVE on `auth.users`, which waits behind sign-up writes and autovacuum). If anything differs or a long transaction is open, stop. Apply in a quiet window; a wait over 3 s aborts with nothing changed.
2. Apply `apply.sql` through the wrapper with the approved sha256. It is independent of every other pending change.
3. Read back the post-image (the apply asserts it; a read-only catalog query confirms), then the client PR can ship.
4. Follow-up in FawxzzyWeb (separate repo, not needed for deletion to work): add `mazer.mazer_help_requests.user_id:c` to the optional FK list in `supabase/proposed/20261116090000_account_delete_self_v2.sql`, so a future re-apply of that file passes its own unlisted-FK sweep.

## Rollback
`rollback.sql` drops the function first (intake stops), then drops the table only when it holds zero rows (locked, counted, dropped in one transaction). With rows it raises notice `MAZER_HELP_ROLLBACK_KEPT_TABLE rows=n` and keeps the data; clients still have no privilege and RLS stays on. Answer or export the messages, delete them deliberately, and run the rollback again. Same 3 s / 15 s timeouts as the apply.
After a rollback that kept rows, `apply.sql` refuses to run again (`MAZER_HELP_PREIMAGE_TABLE_EXISTS`, nothing changed; shown in `run-pg17-rollback-with-rows.txt`) until those rows are deleted and the rollback is run once more to drop the empty table. This is deliberate: the apply never adopts an existing table.

## How Zac reads and closes messages
- Read (read-only, passes the wrapper screen): `ops/read-open-help-requests.sql` returns open messages oldest first (id, time, email, message, signed_in, username for players, build, level, mode, open_total), 50 at a time:
  `powershell -NoProfile -File <skills>\atlas-supabase\sb-query.ps1 -SqlFile ops\read-open-help-requests.sql -OutFile <scratchpad>\help-open.json`
- Flood check (read-only, counts only, no PII): `ops/read-help-intake-last-hour.sql`, see Known trade-off.
  `powershell -NoProfile -File <skills>\atlas-supabase\sb-query.ps1 -SqlFile ops\read-help-intake-last-hour.sql -OutFile <scratchpad>\help-intake.json`
- Reply by email from your own mail client to `contact_email`.
- Close (optional, a production write): `ops/close-help-request.sql` is a template. Put the id in, hash the edited file, run it with `-Write -ApprovedSha256 <hash>`. It closes at most one open row and returns it; no row back means wrong id or already closed. It never edits the email or the message.
- Retention (decided): closed messages are deleted 180 days after they were closed, by an owner-run statement (a reviewed production write like the close template). There is no cron or scheduled job yet. Open messages are not deleted by age.
- Guest rows survive account deletion by design: a guest row has no `user_id`, so nothing links it to an account that is later deleted. Deleting a person's guest messages on request is a manual owner statement by email address.

## Client plan (NOT built in this lane)
Built 2026-11-28 in the Help client UI lane (`src/ui/help/`, `src/legacy-runtime/legacyHelpSubmit.ts`, behind `?lab=help`, build default off); see `docs/playbook-notes/2026-11-28-help-client-ui.md`. The plan below is kept as written.
- RPC: `client.rpc('mazer_submit_help_request_v1', { p_email, p_message, p_build_id, p_player_level, p_game_mode })` on the client bound to the mazer schema (`getLegacyAuthClient`, as `legacyFeedbackSubmit.ts` does). Signed-out players call it with the anon key (the same client without a session); signed-in players' JWT gives `auth.uid()`. Context: `p_build_id` from `legacyBuildId.ts`, level and mode from the current run, all optional.
- Placement A: "Help" row with the lifebuoy icon after Guide. View A "Short answers": three short FAQ rows and a primary "Contact us" button. Form C "Email first": "Your email" (type email, hint "We reply here."), "Message" (textarea; raise `maxLength` from the options page's 500 to 2000 to match the server), Send disabled until the message has text. Pre-fill nothing; never store the typed email on the device beyond the open form.
- Result vocabulary like feedback: saved / rate_limited / offline / failed. Every notice goes through the in-flow status banner (`createStatusBanner`), never inline red text.

| Server result | Copy (proposed; the sent and failed lines are the picked ones from #728) |
|---|---|
| `{"status":"saved"}` | "Sent. Thank you, we will reply by email." |
| `MAZER_HELP_BAD_EMAIL` | "Check your email address and try again." (keep the typed text) |
| `MAZER_HELP_MESSAGE_EMPTY` | "Write a message first." (normally unreachable: Send is disabled) |
| `MAZER_HELP_MESSAGE_TOO_LONG` | "Your message is too long. Keep it under 2000 characters." |
| `rate_limited` | "You have sent a few messages already. Try again in N minutes." (N = ceil(retry_after_seconds / 60), hours when over 90 minutes), and ALWAYS the "Contact us" fallback next to it (Known trade-off) |
| network error (offline regex) | "Could not send. Check your connection and try again." + Try again |
| anything else (incl. 55P03) | "Could not send. Check your connection and try again." + Try again |

- Tests the client PR needs: the mapping above with fixtures, the `rate_limited` view always shows the "Contact us" fallback, signed-out uses the anon path, maxLength 2000, no email in any log or telemetry, Guide/help copy drift test if the Help view lists controls.

## Decided after review (coordinator, Help design delegated by Zac)
- Guest-pool flood: accepted and documented (Known trade-off); limits raised to 30 guests / 90 overall; captcha or Edge Function front later.
- Retention: 180 days for closed messages, owner-run, no cron yet.
- Guest rows survive account deletion by design.

## Open question for the client lane
1. What the "Contact us" fallback shows when the form is rate limited (an address or link outside this form). The client PR needs it; nothing in this SQL depends on it.
   Answered 2026-11-28: the address fawxzzy@gmail.com (Zac approved), shown as "You can also email us:" with a mailto link on every rate-limited answer (and on a generic failure).
