# Mazer Supabase Storage Contract

Mazer uses a Mazer-owned Supabase project and Mazer-prefixed tables. Do not store Mazer account, progression, AI, cycle, or license data in the Fitness project tables.

## Live Setup Status

Dedicated Mazer Supabase project:

- project name: `Mazer`
- project ref: `geknvnrmktchljnyddwp`
- status verified through Supabase MCP: `ACTIVE_HEALTHY`

Applied live schema:

- `public.mazer_progression_states`
- `public.mazer_profiles`
- `public.mazer_ai_progression_states`
- `public.mazer_cycle_receipts`

Live audit result after migration hardening:

- RLS enabled on all Mazer tables.
- `anon` has zero direct table grants.
- `authenticated` has only the client-needed progression/profile/cycle grants.
- Stripe/license tables are not applied yet.

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

Replay creates two fresh databases on an owned non-production listener, applies
all four migrations from zero, compares deterministic catalog signatures, and
removes its listener and data directory. The replay uses only sanitized fixture
roles plus the minimal `auth.users`/`auth.uid()` contract needed to parse the
historical SQL. It is not production parity. Supabase-managed extension
behavior, including `supabase_vault`, remains `UNKNOWN` when unavailable in
the disposable PostgreSQL runtime.

## Tables

- `public.mazer_profiles`: player-facing profile/settings row keyed by `auth.users.id`.
- `public.mazer_progression_states`: local-first human player progression blob plus indexed level/rank/complexity columns.
- `public.mazer_ai_progression_states`: per-user AI-runner progression, separate from the human player track.
- `public.mazer_cycle_receipts`: compact completed-cycle summaries for learning/tuning. Store summaries, not high-volume frame streams.
Deferred Stripe/payment-wall tables:

- `public.mazer_license_accounts`: server-owned Supabase user to Stripe customer mapping.
- `public.mazer_license_entitlements`: server-owned paid-access/license state derived from verified Stripe events or admin migration.
- `public.mazer_license_events`: server-only Stripe webhook receipt ledger for idempotency and audit.

## Access Rules

- `anon` receives no direct table access.
- Authenticated users can read/write only their own profile, progression, AI progression, and cycle receipts.
- Future authenticated users can only read their own license account and entitlement rows after the Stripe lane is unlocked.
- Future license account, entitlement, and webhook-event writes are server-only through `service_role`.
- Future client-visible payment-wall state must be read from `mazer_license_entitlements`; never trust client-written profile/settings data for paid access.

## Current App Wiring

Remote progression sync is feature-gated by:

```env
VITE_MAZER_REMOTE_PROGRESSION=false
```

When enabled, `src/legacy-runtime/legacyRemoteProgression.ts` writes:

- Player state and indexed player progression to `mazer_progression_states`.
- Menu AI runner state to `mazer_ai_progression_states` with `runner_key = 'menu-runner'`.
- Compact menu/play cycle receipts to `mazer_cycle_receipts`; this stores bounded summaries and path previews, not high-volume frame streams.

It also hydrates authenticated account state before Phaser creates the first maze:

- `mazer_progression_states.state` is the canonical combined player/AI progression save; the separate AI row remains an indexed mirror.
- `mazer_profiles.settings` is the canonical cross-device game-toggle/control preference row.
- `revision` on progression and profile rows is a monotonic optimistic-concurrency guard. Normal advancement can rebase forward once after a conflict; destructive replacement/reset refuses to overwrite a newer revision.
- A scoped local sync envelope records the last observed revision and local fingerprints so offline/local advancement can be reconciled without resurrecting a previously accepted reset.

The app remains playable local-first if Supabase is unavailable or remote progression is disabled.

Live migration `account_state_revisions` was applied on 2026-07-16. Readback confirmed the existing three progression rows were preserved at revision `0`; the profile table remained empty until an authenticated client seeds its first settings row.

## 2026-07-09 Auth QA Notes

Local browser-safe env wiring was verified with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_MAZER_REMOTE_PROGRESSION`. The first generated QA signup proved project reachability but was blocked by email confirmation. After email confirmation was disabled for the QA lane, a generated QA account proved signup session creation, logout, login-again, authenticated `mazer_cycle_receipts` insert/read, authenticated `mazer_progression_states` upsert/read, and authenticated `mazer_ai_progression_states` upsert/read.

Remaining UI proof gap: browser automation did not inject typed characters into the Phaser canvas auth fields, so visible app form-entry persistence still needs manual QA or a dedicated hidden test hook. Backend auth and storage are proven with browser-safe keys under authenticated RLS.

## Apply Order

1. Dedicated Mazer Supabase project exists.
2. Auth/progression/cycle receipt schema is applied.
3. Keep Stripe/license tables deferred until the payment wall lane is explicitly unlocked.
4. Configure local and Vercel env vars for the Mazer project before real auth QA:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_MAZER_REMOTE_PROGRESSION=true` after the schema is applied.
5. Add future server-only Stripe webhook env vars only to backend/server contexts, never browser env.

## Stripe Boundary

Future license/payment-wall work should use Stripe Checkout/Billing and write Mazer entitlement state from verified server-side Stripe events. Browser code can read entitlement rows through RLS, but must never create or update paid-access rows directly.
