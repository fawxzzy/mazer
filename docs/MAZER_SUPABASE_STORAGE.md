# Mazer Supabase Storage Contract

Mazer's consolidation target is the master Supabase project `bxtcuhkotumitoqtrcej`, isolated in the custom `mazer` schema. Do not store Mazer account, progression, AI, cycle, or license data in the Fitness namespace. The legacy Mazer project remains a rollback source until client cutover, observation, deletion-grade restore, and explicit retirement gates close.

## Live Setup Status

Master consolidation target:

- project ref: `bxtcuhkotumitoqtrcej`
- schema: `mazer`
- materialized tables: `mazer_profiles`, `mazer_progression_states`, `mazer_ai_progression_states`, and `mazer_cycle_receipts`
- materialized rows: 1,300 across the four tables, mapped to eight canonical users
- access posture: forced RLS, zero client grants, zero policies, zero schema usage, and no Data API exposure

Legacy source/rollback project:

- project name: `Mazer`
- project ref: `geknvnrmktchljnyddwp`
- retirement status: held; it is not safe to delete

The master schema exists, but client access is intentionally not active. Policies, grants, custom-schema Data API exposure, environment cutover, deployment, and observation are separate protected gates. Stripe/license tables remain deferred.

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
- The master schema currently grants no client access and is not exposed through the Data API.
- A future protected access packet may allow authenticated users to read/write only their own profile, progression, AI progression, and cycle receipts.
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

The app remains playable local-first if Supabase is unavailable or remote progression is disabled. This source binding does not change environment values, enable the feature flag, grant client access, expose the schema, deploy, or cut over the application.

In the legacy source project, live migration `account_state_revisions` was applied on 2026-07-16. Readback confirmed the existing three progression rows were preserved at revision `0`; the profile table remained empty until an authenticated client seeds its first settings row. This remains source-contract evidence for the consolidated runtime behavior.

## 2026-07-09 Auth QA Notes

The legacy source project previously verified browser-safe env wiring with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_MAZER_REMOTE_PROGRESSION`. That QA proved signup session creation, logout, login-again, authenticated cycle-receipt insert/read, progression upsert/read, and AI progression upsert/read under the legacy project contract. It is historical evidence, not proof that master-project client access or cutover is complete.

Remaining UI proof gap: browser automation did not inject typed characters into the Phaser canvas auth fields, so visible app form-entry persistence still needs manual QA or a dedicated hidden test hook. Backend auth and storage are proven with browser-safe keys under authenticated RLS.

## Apply Order

1. The master project contains the forced-RLS `mazer` schema and the verified 1,300-row postimage.
2. The browser client source binds data queries to the `mazer` schema while remote sync stays disabled.
3. Apply a separately authorized client-access packet for exact RLS policies, grants, schema usage, and custom-schema Data API exposure.
4. Configure nonproduction environment values for the master project and run authenticated QA before any production cutover:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_MAZER_REMOTE_PROGRESSION=true` only after access proof passes.
5. Observe the bounded nonproduction lane, preserve rollback, and require separate deployment/cutover authority.
6. Keep Stripe/license tables deferred until the payment wall lane is explicitly unlocked; add future server-only Stripe webhook env vars only to backend/server contexts, never browser env.

## Stripe Boundary

Future license/payment-wall work should use Stripe Checkout/Billing and write Mazer entitlement state from verified server-side Stripe events. Browser code can read entitlement rows through RLS, but must never create or update paid-access rows directly.
