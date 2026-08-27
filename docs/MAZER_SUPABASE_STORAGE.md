# Mazer Supabase Storage Contract

Mazer's consolidation target is the master Supabase project `bxtcuhkotumitoqtrcej`, isolated in the custom `mazer` schema. Do not store Mazer account, progression, AI, cycle, or license data in the Fitness namespace. The legacy Mazer project remains a rollback source until client cutover, observation, deletion-grade restore, and explicit retirement gates close.

## Live Setup Status

Master consolidation target:

- project ref: `bxtcuhkotumitoqtrcej`
- schema: `mazer`
- materialized tables: `mazer_profiles`, `mazer_progression_states`, `mazer_ai_progression_states`, and `mazer_cycle_receipts`
- 2026-08-27 production aggregate: `13` profiles, `17` player rows, `17` AI rows, and `1,888` receipts
- production status: R017 cutover and observation are terminal; the deployed browser bundle targets this project and resolves its data client to schema `mazer`
- access posture: forced RLS, authenticated owner-only table access, bounded RPCs, and custom-schema Data API exposure are production-proven

Legacy source/rollback project:

- project name: `Mazer`
- project ref: `geknvnrmktchljnyddwp`
- 2026-08-24 aggregate: `9` profiles, `13` player rows, `13` AI rows, and `1,865` receipts
- retirement status: retained as the exact rollback source; it is not safe to mutate or delete

The master cutover is complete. Source parity, identity mapping, Data API exposure, runtime RPCs, signup authority, final-delta reconciliation, production observation, and exact legacy restoration are settled R017 evidence. The master project is current application-data truth; the legacy project remains rollback evidence only. Stripe/license tables remain deferred.

Three generated additive migrations define the master-side source contract in dependency order:

1. `20260824170156_mazer_master_schema_parity.sql` — bigint ordinals, `8..400` bounded difficulty, revisions, usernames, level timestamps, receipt provenance/idempotency, forced RLS.
2. `20260824170159_mazer_master_runtime_contracts.sql` — server-authoritative completion/reset RPCs plus guest-readable public leaderboard and authenticated-only self rank.
3. `20260824170202_mazer_master_signup_username_claim.sql` — shared-project non-Mazer pass-through, Mazer-only username validation, and same-transaction profile creation.

`scripts/build/compose-master-migrations.mjs` deterministically derives those migrations from the reviewed legacy contracts while replacing only schema ownership and the intentional leaderboard-page guest ACL. Generated drift is a test failure.

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

- `anon` receives no direct table access. It receives only the bounded public leaderboard-page function after runtime-contract activation.
- `authenticated` has 11 scoped table privileges guarded by 11 owner-only RLS policies and one schema-usage grant.
- The production Data API exposure is the `mazer` schema with owner-RLS tables and the bounded RPC surface. Re-certify it before any future project or credential cutover.
- Authenticated users can read or write only their own profile, progression, AI progression, and cycle receipts within those grants and policies.
- Future authenticated users can only read their own license account and entitlement rows after the Stripe lane is unlocked.
- Future license account, entitlement, and webhook-event writes are server-only through `service_role`.
- Future client-visible payment-wall state must be read from `mazer_license_entitlements`; never trust client-written profile/settings data for paid access.

## Current App Wiring

Production remote progression is enabled against the master project:

```env
VITE_SUPABASE_URL=https://bxtcuhkotumitoqtrcej.supabase.co
VITE_MAZER_REMOTE_PROGRESSION=true
```

Local or fixture environments may deliberately set the flag to `false`; that is not the production contract.

The shared browser Supabase client resolves the schema from the exact allowlisted project URL: legacy maps to `public`, master maps to `mazer`, and unknown projects fail closed. Auth remains project-level; unqualified `.from(...)` calls use the selected project-specific data schema without duplicating schema selection at every query site.

When enabled, `src/legacy-runtime/legacyRemoteProgression.ts` writes:

- Player state and indexed player progression to `mazer_progression_states`.
- Menu AI runner state to `mazer_ai_progression_states` with `runner_key = 'menu-runner'`.
- Compact menu/play cycle receipts to `mazer_cycle_receipts`; this stores bounded summaries and path previews, not high-volume frame streams.

It also hydrates authenticated account state before Phaser creates the first maze:

- `mazer_progression_states.state` is the canonical combined player/AI progression save; the separate AI row remains an indexed mirror.
- `mazer_profiles.settings` is the canonical cross-device game-toggle/control preference row.
- `revision` on progression and profile rows is a monotonic optimistic-concurrency guard. Normal advancement can rebase forward once after a conflict; destructive replacement/reset refuses to overwrite a newer revision.
- A scoped local sync envelope records the last observed revision and local fingerprints so offline/local advancement can be reconciled without resurrecting a previously accepted reset.

The app remains playable local-first if Supabase is unavailable or remote progression is disabled. Production currently binds to master project `bxtcuhkotumitoqtrcej` and schema `mazer`; future environment or project changes still require fresh browser-safe binding, RLS, and Data API proof.

In the legacy source project, live migration `account_state_revisions` was applied on 2026-07-16. Readback confirmed the existing three progression rows were preserved at revision `0`; the profile table remained empty until an authenticated client seeds its first settings row. This remains source-contract evidence for the consolidated runtime behavior.

## 2026-07-09 Auth QA Notes

The legacy source project previously verified browser-safe env wiring with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_MAZER_REMOTE_PROGRESSION`. That QA proved signup session creation, logout, login-again, authenticated cycle-receipt insert/read, progression upsert/read, and AI progression upsert/read under the legacy project contract. It is historical evidence, not proof that master-project client access or cutover is complete.

Remaining UI proof gap: browser automation did not inject typed characters into the Phaser canvas auth fields, so visible app form-entry persistence still needs manual QA or a dedicated hidden test hook. Backend auth and storage are proven with browser-safe keys under authenticated RLS.

## Future Project Or Credential Changes

R017 completed the former legacy-to-master apply sequence. Do not replay its import, reconciliation, cutover, observation, or restoration steps.

For any future Supabase project or credential change:

1. Preserve exact current master and rollback preimages without emitting private rows.
2. Re-certify identity ownership, monotonic progression, receipt conservation, username uniqueness, RLS/ACL, Data API exposure, and exact rollback against the proposed target.
3. Prove nonproduction browser Auth and storage behavior before changing production environment values.
4. Cut production once at an explicitly authorized boundary, then verify the deployed commit, project identity, authenticated persistence, leaderboard, and rollback readiness.
5. Keep legacy deletion, credential retirement, and Stripe/license work behind separate protected decisions.

## Stripe Boundary

Future license/payment-wall work should use Stripe Checkout/Billing and write Mazer entitlement state from verified server-side Stripe events. Browser code can read entitlement rows through RLS, but must never create or update paid-access rows directly.
