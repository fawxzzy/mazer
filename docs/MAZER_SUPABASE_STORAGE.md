# Mazer Supabase Storage Contract

Mazer uses a Mazer-owned Supabase project and Mazer-prefixed tables. Do not store Mazer account, progression, AI, cycle, or license data in the Fitness project tables.

## Tables

- `public.mazer_profiles`: player-facing profile/settings row keyed by `auth.users.id`.
- `public.mazer_progression_states`: local-first human player progression blob plus indexed level/rank/complexity columns.
- `public.mazer_ai_progression_states`: per-user AI-runner progression, separate from the human player track.
- `public.mazer_cycle_receipts`: compact completed-cycle summaries for learning/tuning. Store summaries, not high-volume frame streams.
- `public.mazer_license_accounts`: server-owned Supabase user to Stripe customer mapping.
- `public.mazer_license_entitlements`: server-owned paid-access/license state derived from verified Stripe events or admin migration.
- `public.mazer_license_events`: server-only Stripe webhook receipt ledger for idempotency and audit.

## Access Rules

- `anon` receives no direct table access.
- Authenticated users can read/write only their own profile, progression, AI progression, and cycle receipts.
- Authenticated users can only read their own license account and entitlement rows.
- License account, entitlement, and webhook-event writes are server-only through `service_role`.
- Client-visible payment-wall state must be read from `mazer_license_entitlements`; never trust client-written profile/settings data for paid access.

## Current App Wiring

Remote progression sync is feature-gated by:

```env
VITE_MAZER_REMOTE_PROGRESSION=false
```

When enabled, `src/legacy-runtime/legacyRemoteProgression.ts` writes:

- Player state and indexed player progression to `mazer_progression_states`.
- Menu AI runner state to `mazer_ai_progression_states` with `runner_key = 'menu-runner'`.

The app remains playable local-first if Supabase is unavailable or remote progression is disabled.

## Apply Order

1. Create a dedicated Mazer Supabase project.
2. Apply all migrations in `supabase/migrations`.
3. Configure local and Vercel env vars for the Mazer project:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_MAZER_REMOTE_PROGRESSION=true` after the schema is applied.
4. Add future server-only Stripe webhook env vars only to backend/server contexts, never browser env.

## Stripe Boundary

Future license/payment-wall work should use Stripe Checkout/Billing and write Mazer entitlement state from verified server-side Stripe events. Browser code can read entitlement rows through RLS, but must never create or update paid-access rows directly.
