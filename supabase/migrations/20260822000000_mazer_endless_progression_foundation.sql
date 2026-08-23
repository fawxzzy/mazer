-- Endless progression / durable persistence / leaderboard foundation.
--
-- IMPORTANT -- schema location uncertainty: every migration in this folder
-- targets the `public` schema, matching the schema this repo's own
-- migration history can verify. docs/MAZER_SUPABASE_STORAGE.md and the
-- client's db.schema binding (src/legacy-runtime/legacyAuth.ts) both
-- indicate the live tables were relocated to a custom `mazer` schema
-- through a separate, out-of-band provider process not reflected as a
-- migration file anywhere in this repo. Before applying this migration,
-- confirm which schema is actually live (`\dn` / information_schema.tables
-- in the target project) and adjust every `public.` qualifier below to
-- `mazer.` if that's where the real tables live. Applying this against an
-- empty `public` schema while the app queries `mazer` would silently do
-- nothing useful.
--
-- Everything below preserves every existing row and completion value, but the
-- integer-to-bigint conversions can take an ACCESS EXCLUSIVE table lock and
-- may rewrite storage depending on the target Postgres version. Provider-time
-- lock/rehearsal proof is therefore mandatory. This allows the app's player
-- and menu-AI completion ordinals to continue beyond 99. Applying it remains
-- paired with the idempotent completion contract and current-schema provider
-- proof; source presence alone is not permission to run it.
-- PostgreSQL stores these values as bigint for exact arithmetic and ordering.
-- The Data API/client boundary transports them as canonical unsigned decimal
-- text so JavaScript never rounds values beyond Number.MAX_SAFE_INTEGER.

-- 1. Replace both 1-99 completion-ordinal ceilings with lower-bound-only
-- checks. Player and AI remain separate tracks, but both advance +1 for each
-- accepted completion and neither has an application-level ceiling.
alter table public.mazer_progression_states
  alter column player_level type bigint,
  alter column player_completed_cycles type bigint;

alter table public.mazer_progression_states
  drop constraint if exists mazer_progression_states_player_level_check;
alter table public.mazer_progression_states
  add constraint mazer_progression_states_player_level_check
    check (player_level >= 1);

alter table public.mazer_ai_progression_states
  alter column level type bigint,
  alter column completed_cycles type bigint;

alter table public.mazer_ai_progression_states
  drop constraint if exists mazer_ai_progression_states_level_check;
alter table public.mazer_ai_progression_states
  add constraint mazer_ai_progression_states_level_check
    check (level >= 1);

-- 2. Leaderboard tie-breaking needs a timestamp of when the current level
-- was actually reached (existing rows have no trustworthy equivalent --
-- last_completed_cycle_at reflects the most recent finished cycle, not
-- specifically a level-up event, so it is not reused here). Nullable and
-- unbacfilled for existing rows: a leaderboard ordering by this column
-- should fall back to a stable secondary key (e.g. user id) for rows where
-- it is null, rather than this migration guessing a backfill value it has
-- no real evidence for.
alter table public.mazer_progression_states
  add column if not exists level_reached_at timestamp with time zone;

comment on column public.mazer_progression_states.level_reached_at is
  'When player_level last advanced. Null for rows that predate this column -- leaderboard ordering must handle that, not assume every row has one.';

-- 3. Cycle receipts gain optional recipe provenance so a future completion
-- RPC can verify what a client claims it completed without a second
-- ledger. All three are nullable: existing receipts and any receipt from
-- before the endless ruleset exists legitimately have none of this.
alter table public.mazer_cycle_receipts
  add column if not exists ruleset_id text,
  add column if not exists recipe_version integer,
  add column if not exists recipe_hash text;

alter table public.mazer_cycle_receipts
  drop constraint if exists mazer_cycle_receipts_ruleset_id_check;
alter table public.mazer_cycle_receipts
  add constraint mazer_cycle_receipts_ruleset_id_check
    check (ruleset_id is null or ruleset_id in ('legacy-v1', 'endless-v1'));

comment on column public.mazer_cycle_receipts.ruleset_id is
  'Which progression ruleset generated the completed level -- legacy-v1 (levels 1-99, complexity-derived) or endless-v1 (levels 100+, recipe-derived). Null for receipts recorded before this column existed.';
comment on column public.mazer_cycle_receipts.recipe_version is
  'Recipe schema version the completed endless-v1 level was resolved under. Null for legacy-v1 receipts and any receipt predating this column.';
comment on column public.mazer_cycle_receipts.recipe_hash is
  'Opaque hash of the resolved recipe the client claims it completed, for future server-side verification against a re-resolved recipe. Null until a completion path actually populates it.';

-- 4. A stable idempotency key for receipts, so a future completion RPC can
-- reject a duplicate submission (retried request, replayed client state)
-- without double-advancing progression. Nullable/unbacfilled for existing
-- receipts -- retroactively minting one would be a guess, not evidence.
alter table public.mazer_cycle_receipts
  add column if not exists client_run_id uuid;

-- Scope idempotency to one account. A caller must not be able to reserve a
-- globally-known UUID and block another account's otherwise valid receipt.
drop index if exists public.mazer_cycle_receipts_client_run_id_unique_idx;
create unique index if not exists mazer_cycle_receipts_user_client_run_id_unique_idx
  on public.mazer_cycle_receipts (user_id, client_run_id)
  where client_run_id is not null;

comment on column public.mazer_cycle_receipts.client_run_id is
  'Client-generated idempotency key for one play/menu-demo attempt. Null for receipts recorded before this column existed. New completion RPC calls require it and enforce uniqueness per account.';
