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
-- Everything below is additive and preserves every existing row:
-- no column is dropped, no existing constraint is tightened, and no
-- existing value is rewritten. This does NOT change what any current
-- user's level displays as -- player_level's meaning does not change in
-- this migration; only its permitted range does, and only once the
-- application code that reads/writes it is ready (a separate, deliberate
-- follow-up).

-- 1. Replace the 1-99 player level ceiling with a lower-bound-only check.
-- The AI-runner track's level constraint is deliberately left untouched --
-- no decision has been made yet to extend the AI runner past level 99, and
-- the brief this migration supports explicitly allows keeping that
-- separation intentional and explicit rather than assuming parity.
alter table public.mazer_progression_states
  drop constraint if exists mazer_progression_states_player_level_check;
alter table public.mazer_progression_states
  add constraint mazer_progression_states_player_level_check
    check (player_level >= 1);

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

create unique index if not exists mazer_cycle_receipts_client_run_id_unique_idx
  on public.mazer_cycle_receipts (client_run_id)
  where client_run_id is not null;

comment on column public.mazer_cycle_receipts.client_run_id is
  'Client-generated idempotency key for one play/menu-demo attempt. Null for receipts recorded before this column existed. The partial unique index only enforces uniqueness where it is actually set.';
