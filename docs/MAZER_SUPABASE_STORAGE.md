# Mazer Supabase Storage Contract

Mazer's consolidation target is the master Supabase project `bxtcuhkotumitoqtrcej`, isolated in the custom `mazer` schema. Do not store Mazer account, progression, AI, cycle, or license data in the Fitness namespace. The legacy Mazer project remains a rollback source until client cutover, observation, deletion-grade restore, and explicit retirement gates close.

## Live Setup Status

Master consolidation target:

- project ref: `bxtcuhkotumitoqtrcej`
- schema: `mazer`
- materialized tables: `mazer_profiles`, `mazer_progression_states`, `mazer_ai_progression_states`, and `mazer_cycle_receipts`
- materialized rows: 1,300 across the four tables, mapped to eight canonical users
- access posture: forced RLS, 11 authenticated client privileges, 11 owner-only RLS policies, authenticated schema usage, and Data API exposure limited to the four Mazer table paths plus the PostgREST root

Legacy source/rollback project:

- project name: `Mazer`
- project ref: `geknvnrmktchljnyddwp`
- retirement status: held; it is not safe to delete

The master schema and bounded client-access layer are active. Postapply proof confirmed the exact five-entry Data API allowlist, 13 rows visible to the authenticated owner, and zero rows visible to an unknown or cross-owner identity. Environment configuration, deployment, production cutover, observation, rollback expiry, credential retirement, and legacy deletion remain separate protected gates. Stripe/license tables remain deferred.

## Canonical Migration Source Chain

The repository migration tree mirrors the four live migration identities in
their live order:

1. `20260709045557_mazer_progression_state.sql`
2. `20260709045648_mazer_account_storage_contracts.sql`
3. `20260709045725_mazer_tighten_public_table_grants.sql`
4. `20260716211513_account_state_revisions.sql`

The first two sources intentionally preserve their original pre-hardening grant
statements. The third migration owns the later all-role revoke/regrant step.
Do not fold that tightening backward into an already-applied historical source.

The secret-free provenance record is
`supabase/recovery/fp-mzr-rec-001-provenance.json`. It binds each committed
source to sanitized read-only live migration evidence using independent live
raw, canonical SQL, and repository-LF digests. Run:

```sh
npm run supabase:verify-source-recovery
```

For an owned disposable PostgreSQL 17 replay:

```sh
npm run supabase:replay-source-recovery
```

The replay requires PostgreSQL major 17 for `postgres`, `initdb`, `pg_ctl`, and
`psql`. On POSIX systems it must also run as a known non-root user because
PostgreSQL refuses `initdb` as root. The verifier rejects root, an unknown
POSIX uid, or a mixed/non-17 toolchain before cluster creation. This packet
proves the Windows replay path only; Linux/container replay remains unproven.

Replay creates two fresh databases on an owned non-production listener, applies
all four migrations from zero, compares deterministic catalog signatures, and
removes its listener and data directory. The replay uses only sanitized fixture
roles plus the minimal `auth.users`/`auth.uid()` contract needed to parse the
historical SQL. It is not production parity. Supabase-managed extension
behavior, including `supabase_vault`, remains `UNKNOWN` when unavailable in
the disposable PostgreSQL runtime.

### Existing Database History Guard

Do not apply the recovered timestamp chain normally to a database that already
recorded any of these prior repository versions:

- `20260709005739`
- `20260709011209`
- `20260716205924`

Those historical sources already created the same objects and policies. Normal
application of the recovered timestamps can therefore stop on duplicate
objects before reaching the final state.

The required fail-closed preflight is:

1. Read the target migration history before any push or replay.
2. If an external target's history is empty, treat the schema as
   `EMPTY_UNPROVEN`; history alone does not authorize normal apply. This packet's
   only empty-history authorization path is the owned disposable replay harness:
   it creates the database, independently queries every governed Mazer catalog
   kind, and permits replay only when every count is zero. Missing, malformed,
   contradictory, or populated evidence remains blocked.
3. If it exactly matches the four recovered versions, no repair is needed.
4. If it exactly matches the three legacy versions:
   - reset and replay from zero when the database is disposable; or
   - for a retained database, first prove its Mazer catalog matches every
     captured live non-provider signature, obtain a target-specific migration
     lease and verified backup, then use the emitted history-repair plan.
5. Treat mixed, partial, or unknown histories as `BLOCKED`; do not run normal
   migration application or history repair.

After obtaining the exact read-only version list, generate the non-mutating
repair plan by passing that observed history explicitly:

```sh
npm run supabase:legacy-repair-plan -- --applied-versions 20260709005739,20260709011209,20260716205924 \
  --confirmed-prerequisites target_specific_migration_lease,exact_live_mazer_catalog_signature_match,verified_backup_or_disposable_classification
```

The plan first emits `applied` commands for all four recovered versions, then
emits `reverted` commands for the three legacy versions. This forward-first
ordering means an interruption cannot expose an empty, falsely fresh migration
history.
Omitting `--applied-versions` or passing an empty value yields `UNKNOWN`, emits
no commands, and exits non-zero. Outside this CLI, an independently observed
empty history is `EMPTY_UNPROVEN`; a populated or contradictory catalog proof
is `BLOCKED`. Current, mixed, partial, or unknown observed
histories likewise emit no commands; only the exact observed legacy history
plus explicit confirmation of every target-specific pre-repair prerequisite
produces a successful executable plan. Do not pass a prerequisite name until
its target-specific lease, catalog comparison, or backup/classification receipt
exists. The post-repair migration-history readback remains mandatory after the
commands execute and is listed separately in the plan output.
The legacy repair-plan CLI intentionally does not accept or authorize
empty-history catalog proof. Only the owned replay harness can return `FRESH`
in this packet because it creates the disposable database and performs the
independent catalog query itself. External empty-history targets remain blocked
for separately governed disposition.
Generating a valid plan changes nothing. Executing its commands is a separately
authorized target mutation and is forbidden without the prerequisites above.
The disposable replay gate proves the legacy history is detected, normal apply
is refused, history-only repair leaves the exact Mazer schema unchanged, and a
second repair is deterministic.

## Tables

- `mazer.mazer_profiles`: player-facing profile/settings row keyed by `auth.users.id`.
- `mazer.mazer_progression_states`: local-first human player progression blob plus indexed level/rank/complexity columns.
- `mazer.mazer_ai_progression_states`: per-user AI-runner progression, separate from the human player track.
- `mazer.mazer_cycle_receipts`: compact completed-cycle summaries for learning/tuning. Store summaries, not high-volume frame streams.
Deferred Stripe/payment-wall tables:

- `mazer.mazer_license_accounts`: server-owned Supabase user to Stripe customer mapping.
- `mazer.mazer_license_entitlements`: server-owned paid-access/license state derived from verified Stripe events or admin migration.
- `mazer.mazer_license_events`: server-only Stripe webhook receipt ledger for idempotency and audit.

## Access Rules

- `anon` receives no direct table access.
- `authenticated` has 11 scoped table privileges guarded by 11 owner-only RLS policies and one schema-usage grant.
- The Data API exposes only the four required Mazer table paths plus the PostgREST root; no additional Mazer path is allowlisted.
- Live aggregate proof confirms 13 rows visible to the authenticated owner, zero rows visible to an unknown owner, and zero cross-owner visibility.
- Authenticated users can read or write only their own profile, progression, AI progression, and cycle receipts within those grants and policies.
- Future authenticated users can only read their own license account and entitlement rows after the Stripe lane is unlocked.
- Future license account, entitlement, and webhook-event writes are server-only through `service_role`.
- Future client-visible payment-wall state must be read from `mazer_license_entitlements`; never trust client-written profile/settings data for paid access.

## Current App Wiring

Remote progression sync is feature-gated by:

```env
VITE_MAZER_REMOTE_PROGRESSION=false
```

The shared browser Supabase client binds data queries to `db.schema = 'mazer'`. Auth remains project-level; unqualified `.from(...)` calls in the remote progression adapter therefore target the custom Mazer schema without duplicating schema selection at every query site.

When enabled, `src/legacy-runtime/legacyRemoteProgression.ts` writes:

- Player state and indexed player progression to `mazer_progression_states`.
- Menu AI runner state to `mazer_ai_progression_states` with `runner_key = 'menu-runner'`.
- Compact menu/play cycle receipts to `mazer_cycle_receipts`; this stores bounded summaries and path previews, not high-volume frame streams.

It also hydrates authenticated account state before Phaser creates the first maze:

- `mazer_progression_states.state` is the canonical combined player/AI progression save; the separate AI row remains an indexed mirror.
- `mazer_profiles.settings` is the canonical cross-device game-toggle/control preference row.
- `revision` on progression and profile rows is a monotonic optimistic-concurrency guard. Normal advancement can rebase forward once after a conflict; destructive replacement/reset refuses to overwrite a newer revision.
- A scoped local sync envelope records the last observed revision and local fingerprints so offline/local advancement can be reconciled without resurrecting a previously accepted reset.

The app remains playable local-first if Supabase is unavailable or remote progression is disabled. This source binding itself did not change environment values, enable the feature flag, grant client access, expose the schema, deploy, or cut over the application; the bounded access and Data API postimage above was completed and verified through a separate governed provider wave.

In the legacy source project, live migration `account_state_revisions` was applied on 2026-07-16. Readback confirmed the existing three progression rows were preserved at revision `0`; the profile table remained empty until an authenticated client seeds its first settings row. This remains source-contract evidence for the consolidated runtime behavior.

## 2026-07-09 Auth QA Notes

The legacy source project previously verified browser-safe env wiring with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_MAZER_REMOTE_PROGRESSION`. That QA proved signup session creation, logout, login-again, authenticated cycle-receipt insert/read, progression upsert/read, and AI progression upsert/read under the legacy project contract. It is historical evidence, not proof that master-project client access or cutover is complete.

Remaining UI proof gap: browser automation did not inject typed characters into the Phaser canvas auth fields, so visible app form-entry persistence still needs manual QA or a dedicated hidden test hook. Backend auth and storage are proven with browser-safe keys under authenticated RLS.

## Apply Order

1. The master project contains the forced-RLS `mazer` schema and the verified 1,300-row postimage.
2. The governed access wave applied 11 authenticated privileges, 11 owner-only policies, authenticated schema usage, and the exact five-entry Data API allowlist; aggregate owner-isolation proof passed.
3. The browser client source binds data queries to the `mazer` schema while remote sync stays disabled.
4. Configure nonproduction environment values for the master project and run authenticated QA before any production cutover:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_MAZER_REMOTE_PROGRESSION=true` only after access proof passes.
5. Observe the bounded nonproduction lane, preserve rollback, and require separate deployment and production-cutover authority.
6. Close observation, rollback-expiry, credential-retirement, and deletion-readiness gates independently before any legacy retirement.
7. Keep Stripe/license tables deferred until the payment wall lane is explicitly unlocked; add future server-only Stripe webhook env vars only to backend/server contexts, never browser env.

## Stripe Boundary

Future license/payment-wall work should use Stripe Checkout/Billing and write Mazer entitlement state from verified server-side Stripe events. Browser code can read entitlement rows through RLS, but must never create or update paid-access rows directly.
