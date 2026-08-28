-- Widens maze_seed from a signed 32-bit `integer` to `bigint`, end to end
-- (mazer_cycle_receipts.maze_seed column, mazer_complete_level's and
-- mazer_complete_ai_level's p_maze_seed parameters), with an explicit
-- unsigned-32-bit domain check (0-4294967295) replacing the implicit range
-- signed int32 used to silently provide.
--
-- Root cause: the client's own maze seeds are genuinely unsigned 32-bit
-- values (src/legacy-runtime/legacyRuntimeSeed.ts: MAX_LEGACY_RUNTIME_SEED =
-- 0xffffffff, every seed value passed through `>>> 0`), so roughly half of
-- all possible seeds (any seed >= 2^31 = 2147483648) exceed signed int32's
-- positive range (max 2147483647). The completion RPCs declared
-- `p_maze_seed integer`, and mazer_cycle_receipts.maze_seed was `integer`
-- too -- any completion whose seed landed in the upper half of the unsigned
-- range failed the RPC call outright (Postgres: "value ... is out of range
-- for type integer") before ever inserting a receipt or advancing
-- progression. Confirmed live: seed 2985895775 (> 2147483647) is exactly
-- this failure mode.
--
-- This explains a real, previously-unresolved production symptom: a
-- player's local progression (advanced client-side before the remote round
-- trip) could sit ahead of the server's canonical row indefinitely, because
-- every retry of the same completion hit the same deterministic overflow
-- and could never succeed -- not a sync-lag issue, a hard data-domain
-- mismatch. This is a universal fix: it affects any account whose next
-- seed happens to fall in the upper half of the unsigned 32-bit range, not
-- one specific account.
--
-- Function bodies below are copied verbatim from the live
-- mazer_complete_level / mazer_complete_ai_level definitns (see
-- supabase/migrations/20260824170159_mazer_master_runtime_contracts.sql,
-- itself generated from supabase/migrations/20260822000100_mazer_endless_
-- completion_rpc.sql), with exactly two changes: the p_maze_seed parameter
-- type (integer -> bigint) and its null-check widened into an explicit
-- unsigned-32-bit domain check. Every other line -- auth checks, revision
-- guard, exact-current-level sequencing, idempotency via client_run_id,
-- receipt shape/size validation, rank/colorTier derivation -- is unchanged.

begin;

do $preflight$
begin
  if to_regclass('mazer.mazer_cycle_receipts') is null then
    raise exception 'MAZER_SEED_WIDEN_PREIMAGE_TABLE_MISSING';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'mazer'
      and p.proname = 'mazer_complete_level'
      and pg_get_function_identity_arguments(p.oid) =
        'p_expected_revision bigint, p_expected_user_id uuid, p_completed_level text, p_maze_seed integer, p_maze_size integer, p_client_run_id uuid, p_ruleset_id text, p_recipe_version integer, p_recipe_hash text, p_completed_at timestamp with time zone, p_receipt jsonb'
  ) then
    raise exception 'MAZER_SEED_WIDEN_PREIMAGE_COMPLETE_LEVEL_SIGNATURE_MISMATCH';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'mazer'
      and p.proname = 'mazer_complete_ai_level'
      and pg_get_function_identity_arguments(p.oid) =
        'p_expected_user_id uuid, p_completed_level text, p_maze_seed integer, p_maze_size integer, p_client_run_id uuid, p_ruleset_id text, p_recipe_version integer, p_recipe_hash text, p_completed_at timestamp with time zone, p_receipt jsonb'
  ) then
    raise exception 'MAZER_SEED_WIDEN_PREIMAGE_COMPLETE_AI_LEVEL_SIGNATURE_MISMATCH';
  end if;
end;
$preflight$;

alter table mazer.mazer_cycle_receipts
  alter column maze_seed type bigint;

alter table mazer.mazer_cycle_receipts
  add constraint mazer_cycle_receipts_maze_seed_range
  check (maze_seed >= 0 and maze_seed <= 4294967295);

drop function if exists mazer.mazer_complete_level(bigint, uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb);

create function mazer.mazer_complete_level(
  p_expected_revision bigint,
  p_expected_user_id uuid,
  p_completed_level text,
  p_maze_seed bigint,
  p_maze_size integer,
  p_client_run_id uuid,
  p_ruleset_id text default null,
  p_recipe_version integer default null,
  p_recipe_hash text default null,
  p_completed_at timestamp with time zone default null,
  p_receipt jsonb default '{}'::jsonb
)
returns table (
  player_level text,
  player_rank text,
  player_target_complexity integer,
  player_completed_cycles text,
  revision bigint,
  level_reached_at timestamp with time zone,
  state jsonb,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current record;
  v_inserted_receipt_id uuid;
  v_completed_level bigint;
  v_next_level bigint;
  v_next_completed_cycles bigint;
  v_next_target_complexity integer;
  v_next_rank text;
  v_next_color_tier integer;
  v_now timestamp with time zone := pg_catalog.clock_timestamp();
  v_receipt jsonb;
  v_state jsonb;
  v_tracks jsonb;
  v_player_track jsonb;
begin
  if v_user_id is null or p_expected_user_id is distinct from v_user_id then
    raise exception 'mazer_complete_level account mismatch' using errcode = '28000';
  end if;

  if p_completed_level is null or p_completed_level !~ '^[1-9][0-9]*$' then
    raise exception 'completed_level must be a positive integer' using errcode = '22023';
  end if;
  v_completed_level := p_completed_level::bigint;

  if p_maze_size is null or p_maze_size < 1 then
    raise exception 'maze_size must be a positive integer' using errcode = '22023';
  end if;

  -- Client seeds are genuinely unsigned 32-bit (see this migration's own
  -- header comment) -- validate the real domain explicitly instead of
  -- relying on a column/parameter type to reject anything out of range.
  if p_maze_seed is null or p_maze_seed < 0 or p_maze_seed > 4294967295 then
    raise exception 'maze_seed must be within the unsigned 32-bit range (0-4294967295)' using errcode = '22023';
  end if;

  if p_client_run_id is null then
    raise exception 'client_run_id is required for idempotent completion' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(p_receipt) <> 'object' or pg_catalog.octet_length(p_receipt::text) > 8192 then
    raise exception 'receipt must be a JSON object no larger than 8192 bytes' using errcode = '22023';
  end if;
  -- Never trust timestamp-shaped keys inside the caller-controlled receipt.
  -- Only the separately typed parameter may reintroduce noncanonical client
  -- time, and only inside the bounded window below.
  v_receipt := p_receipt
    - 'completedAt'
    - 'clientCompletedAt';
  if p_completed_at is not null
    and p_completed_at between v_now - interval '90 days' and v_now + interval '5 minutes'
  then
    v_receipt := v_receipt || pg_catalog.jsonb_build_object('clientCompletedAt', p_completed_at);
    if pg_catalog.octet_length(v_receipt::text) > 8192 then
      v_receipt := v_receipt - 'clientCompletedAt';
    end if;
  end if;

  -- Lock the one player row before reading the receipt. Two retries for the
  -- same account therefore serialize, and the second transaction observes
  -- the receipt committed by the first before it can advance anything.
  select
    s.player_level,
    s.player_rank,
    s.player_target_complexity,
    s.player_completed_cycles,
    s.revision,
    s.state
    into v_current
  from mazer.mazer_progression_states s
  where s.user_id = v_user_id
  for update;

  if not found then
    raise exception 'No progression row for this account -- sign in normally at least once before calling mazer_complete_level' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from mazer.mazer_cycle_receipts r
    where r.user_id = v_user_id
      and r.client_run_id = p_client_run_id
  ) then
    return query
      select
        s.player_level::text,
        s.player_rank,
        s.player_target_complexity,
        s.player_completed_cycles::text,
        s.revision,
        s.level_reached_at,
        s.state,
        s.updated_at
      from mazer.mazer_progression_states s
      where s.user_id = v_user_id;
    return;
  end if;

  if p_expected_revision is null or v_current.revision is distinct from p_expected_revision then
    raise exception 'Progression changed on another device (expected revision %, found %)', p_expected_revision, v_current.revision
      using errcode = '40001';
  end if;

  -- Sequential-only: the client must be completing exactly its current
  -- level, never skipping ahead or resubmitting a stale earlier level as if
  -- it were new progress.
  if v_completed_level <> v_current.player_level then
    raise exception 'completed_level (%) does not match the account''s current level (%)', p_completed_level, v_current.player_level
      using errcode = '22023';
  end if;

  v_next_level := v_current.player_level + 1;
  v_next_completed_cycles := v_current.player_completed_cycles + 1;
  v_next_target_complexity := least(
    400,
    greatest(8, v_current.player_target_complexity + 4)
  );
  v_next_rank := case
    when v_next_target_complexity >= 125 then 'S'
    when v_next_target_complexity >= 96 then 'A'
    when v_next_target_complexity >= 70 then 'B'
    when v_next_target_complexity >= 46 then 'C'
    when v_next_target_complexity >= 28 then 'D'
    else 'E'
  end;
  v_next_color_tier := least(
    5,
    greatest(0, ((v_next_target_complexity - 8) / 4) / 5)
  );

  insert into mazer.mazer_cycle_receipts (
    user_id,
    surface,
    maze_seed,
    maze_size,
    client_run_id,
    ruleset_id,
    recipe_version,
    recipe_hash,
    completed_at,
    receipt
  ) values (
    v_user_id,
    'play',
    p_maze_seed,
    p_maze_size,
    p_client_run_id,
    p_ruleset_id,
    p_recipe_version,
    p_recipe_hash,
    v_now,
    v_receipt
  )
  on conflict (user_id, client_run_id) where client_run_id is not null do nothing
  returning id into v_inserted_receipt_id;

  -- This can only lose a race to another accepted call carrying the same
  -- per-account run UUID. Treat it as a retry, never as another completion.
  if v_inserted_receipt_id is null then
    return query
      select
        s.player_level::text,
        s.player_rank,
        s.player_target_complexity,
        s.player_completed_cycles::text,
        s.revision,
        s.level_reached_at,
        s.state,
        s.updated_at
      from mazer.mazer_progression_states s
      where s.user_id = v_user_id;
    return;
  end if;

  v_state := case
    when pg_catalog.jsonb_typeof(v_current.state) = 'object' then v_current.state
    else '{}'::jsonb
  end;
  v_tracks := case
    when pg_catalog.jsonb_typeof(v_state -> 'tracks') = 'object' then v_state -> 'tracks'
    else '{}'::jsonb
  end;
  v_player_track := case
    when pg_catalog.jsonb_typeof(v_tracks -> 'player') = 'object' then v_tracks -> 'player'
    else '{}'::jsonb
  end;
  v_player_track := v_player_track || pg_catalog.jsonb_build_object(
    'colorTier', v_next_color_tier,
    'completedCycles', v_next_completed_cycles::text,
    'lastCompletedAt', v_now,
    'lastReceiptId', coalesce(nullif(p_receipt ->> 'id', ''), p_client_run_id::text),
    'level', v_next_level::text,
    'rank', v_next_rank,
    'targetComplexity', v_next_target_complexity
  );
  v_state := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      v_state,
      '{tracks}',
      v_tracks || pg_catalog.jsonb_build_object('player', v_player_track),
      true
    ),
    '{updatedAt}',
    pg_catalog.to_jsonb(v_now),
    true
  );

  update mazer.mazer_progression_states s
  set
    player_level = v_next_level,
    player_rank = v_next_rank,
    player_target_complexity = v_next_target_complexity,
    player_completed_cycles = v_next_completed_cycles,
    revision = v_current.revision + 1,
    state = v_state,
    last_completed_cycle_at = v_now,
    level_reached_at = v_now,
    updated_at = v_now
  where s.user_id = v_user_id;

  return query
    select
      s.player_level::text,
      s.player_rank,
      s.player_target_complexity,
      s.player_completed_cycles::text,
      s.revision,
      s.level_reached_at,
      s.state,
      s.updated_at
    from mazer.mazer_progression_states s
    where s.user_id = v_user_id;
end;
$$;

revoke all on function mazer.mazer_complete_level(bigint, uuid, text, bigint, integer, uuid, text, integer, text, timestamp with time zone, jsonb) from public;
revoke all on function mazer.mazer_complete_level(bigint, uuid, text, bigint, integer, uuid, text, integer, text, timestamp with time zone, jsonb) from anon;
grant execute on function mazer.mazer_complete_level(bigint, uuid, text, bigint, integer, uuid, text, integer, text, timestamp with time zone, jsonb) to authenticated;
alter function mazer.mazer_complete_level(bigint, uuid, text, bigint, integer, uuid, text, integer, text, timestamp with time zone, jsonb) owner to postgres;

comment on function mazer.mazer_complete_level is
  'Auth-bound, idempotent, load-bearing player completion transaction. The client keeps the same run UUID in a durable outbox until this function returns the canonical state. maze_seed is bigint, validated to the unsigned 32-bit domain (0-4294967295) the client actually generates.';

drop function if exists mazer.mazer_complete_ai_level(uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb);

create function mazer.mazer_complete_ai_level(
  p_expected_user_id uuid,
  p_completed_level text,
  p_maze_seed bigint,
  p_maze_size integer,
  p_client_run_id uuid,
  p_ruleset_id text default null,
  p_recipe_version integer default null,
  p_recipe_hash text default null,
  p_completed_at timestamp with time zone default null,
  p_receipt jsonb default '{}'::jsonb
)
returns table (
  level text,
  rank text,
  target_complexity integer,
  completed_cycles text,
  last_completed_cycle_at timestamp with time zone,
  state jsonb,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current record;
  v_inserted_receipt_id uuid;
  v_completed_level bigint;
  v_next_level bigint;
  v_next_completed_cycles bigint;
  v_next_target_complexity integer;
  v_next_rank text;
  v_next_color_tier integer;
  v_now timestamp with time zone := pg_catalog.clock_timestamp();
  v_receipt jsonb;
  v_state jsonb;
  v_summary jsonb;
begin
  if v_user_id is null or p_expected_user_id is distinct from v_user_id then
    raise exception 'mazer_complete_ai_level account mismatch' using errcode = '28000';
  end if;

  if p_completed_level is null or p_completed_level !~ '^[1-9][0-9]*$' then
    raise exception 'completed_level must be a positive integer' using errcode = '22023';
  end if;
  v_completed_level := p_completed_level::bigint;

  if p_maze_size is null or p_maze_size < 1 then
    raise exception 'maze_size must be a positive integer' using errcode = '22023';
  end if;

  if p_maze_seed is null or p_maze_seed < 0 or p_maze_seed > 4294967295 then
    raise exception 'maze_seed must be within the unsigned 32-bit range (0-4294967295)' using errcode = '22023';
  end if;

  if p_client_run_id is null then
    raise exception 'client_run_id is required for idempotent completion' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(p_receipt) <> 'object' or pg_catalog.octet_length(p_receipt::text) > 8192 then
    raise exception 'receipt must be a JSON object no larger than 8192 bytes' using errcode = '22023';
  end if;
  v_receipt := p_receipt
    - 'completedAt'
    - 'clientCompletedAt';
  if p_completed_at is not null
    and p_completed_at between v_now - interval '90 days' and v_now + interval '5 minutes'
  then
    v_receipt := v_receipt || pg_catalog.jsonb_build_object('clientCompletedAt', p_completed_at);
    if pg_catalog.octet_length(v_receipt::text) > 8192 then
      v_receipt := v_receipt - 'clientCompletedAt';
    end if;
  end if;

  select
    s.level,
    s.rank,
    s.target_complexity,
    s.completed_cycles,
    s.state,
    s.summary
    into v_current
  from mazer.mazer_ai_progression_states s
  where s.user_id = v_user_id
    and s.runner_key = 'menu-runner'
  for update;

  if not found then
    raise exception 'No menu AI progression row for this account -- sync once before calling mazer_complete_ai_level' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from mazer.mazer_cycle_receipts r
    where r.user_id = v_user_id
      and r.client_run_id = p_client_run_id
  ) then
    return query
      select
        s.level::text,
        s.rank,
        s.target_complexity,
        s.completed_cycles::text,
        s.last_completed_cycle_at,
        s.state,
        s.updated_at
      from mazer.mazer_ai_progression_states s
      where s.user_id = v_user_id
        and s.runner_key = 'menu-runner';
    return;
  end if;

  if v_completed_level <> v_current.level then
    raise exception 'completed_level (%) does not match the menu AI''s current level (%)', p_completed_level, v_current.level
      using errcode = '22023';
  end if;

  v_next_level := v_current.level + 1;
  v_next_completed_cycles := v_current.completed_cycles + 1;
  v_next_target_complexity := least(
    400,
    greatest(8, v_current.target_complexity + 4)
  );
  v_next_rank := case
    when v_next_target_complexity >= 125 then 'S'
    when v_next_target_complexity >= 96 then 'A'
    when v_next_target_complexity >= 70 then 'B'
    when v_next_target_complexity >= 46 then 'C'
    when v_next_target_complexity >= 28 then 'D'
    else 'E'
  end;
  v_next_color_tier := least(
    5,
    greatest(0, ((v_next_target_complexity - 8) / 4) / 5)
  );

  insert into mazer.mazer_cycle_receipts (
    user_id,
    surface,
    maze_seed,
    maze_size,
    client_run_id,
    ruleset_id,
    recipe_version,
    recipe_hash,
    completed_at,
    receipt
  ) values (
    v_user_id,
    'menu-demo',
    p_maze_seed,
    p_maze_size,
    p_client_run_id,
    p_ruleset_id,
    p_recipe_version,
    p_recipe_hash,
    v_now,
    v_receipt
  )
  on conflict (user_id, client_run_id) where client_run_id is not null do nothing
  returning id into v_inserted_receipt_id;

  if v_inserted_receipt_id is null then
    return query
      select
        s.level::text,
        s.rank,
        s.target_complexity,
        s.completed_cycles::text,
        s.last_completed_cycle_at,
        s.state,
        s.updated_at
      from mazer.mazer_ai_progression_states s
      where s.user_id = v_user_id
        and s.runner_key = 'menu-runner';
    return;
  end if;

  v_state := case
    when pg_catalog.jsonb_typeof(v_current.state) = 'object' then v_current.state
    else '{}'::jsonb
  end;
  v_summary := case
    when pg_catalog.jsonb_typeof(v_current.summary) = 'object' then v_current.summary
    else '{}'::jsonb
  end;
  v_state := v_state || pg_catalog.jsonb_build_object(
    'colorTier', v_next_color_tier,
    'completedCycles', v_next_completed_cycles::text,
    'lastCompletedAt', v_now,
    'lastReceiptId', coalesce(nullif(p_receipt ->> 'id', ''), p_client_run_id::text),
    'level', v_next_level::text,
    'rank', v_next_rank,
    'targetComplexity', v_next_target_complexity
  );
  v_summary := v_summary || pg_catalog.jsonb_build_object(
    'colorTier', v_next_color_tier,
    'completedCycles', v_next_completed_cycles::text,
    'lastCompletedAt', v_now,
    'lastReceiptId', coalesce(nullif(p_receipt ->> 'id', ''), p_client_run_id::text),
    'level', v_next_level::text,
    'rank', v_next_rank,
    'targetComplexity', v_next_target_complexity
  );

  update mazer.mazer_ai_progression_states s
  set
    level = v_next_level,
    rank = v_next_rank,
    target_complexity = v_next_target_complexity,
    completed_cycles = v_next_completed_cycles,
    state = v_state,
    summary = v_summary,
    last_completed_cycle_at = v_now,
    updated_at = v_now
  where s.user_id = v_user_id
    and s.runner_key = 'menu-runner';

  return query
    select
      s.level::text,
      s.rank,
      s.target_complexity,
      s.completed_cycles::text,
      s.last_completed_cycle_at,
      s.state,
      s.updated_at
    from mazer.mazer_ai_progression_states s
    where s.user_id = v_user_id
      and s.runner_key = 'menu-runner';
end;
$$;

revoke all on function mazer.mazer_complete_ai_level(uuid, text, bigint, integer, uuid, text, integer, text, timestamp with time zone, jsonb) from public;
revoke all on function mazer.mazer_complete_ai_level(uuid, text, bigint, integer, uuid, text, integer, text, timestamp with time zone, jsonb) from anon;
grant execute on function mazer.mazer_complete_ai_level(uuid, text, bigint, integer, uuid, text, integer, text, timestamp with time zone, jsonb) to authenticated;
alter function mazer.mazer_complete_ai_level(uuid, text, bigint, integer, uuid, text, integer, text, timestamp with time zone, jsonb) owner to postgres;

comment on function mazer.mazer_complete_ai_level is
  'Auth-bound, idempotent, load-bearing menu-AI completion transaction. The client keeps the same run UUID in a durable outbox until this function returns the canonical state. maze_seed is bigint, validated to the unsigned 32-bit domain (0-4294967295) the client actually generates.';

do $postimage$
begin
  if (
    select data_type from information_schema.columns
    where table_schema = 'mazer' and table_name = 'mazer_cycle_receipts' and column_name = 'maze_seed'
  ) is distinct from 'bigint' then
    raise exception 'MAZER_SEED_WIDEN_POSTIMAGE_COLUMN_TYPE_FAILED';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'mazer'
      and p.proname = 'mazer_complete_level'
      and pg_get_function_identity_arguments(p.oid) =
        'p_expected_revision bigint, p_expected_user_id uuid, p_completed_level text, p_maze_seed bigint, p_maze_size integer, p_client_run_id uuid, p_ruleset_id text, p_recipe_version integer, p_recipe_hash text, p_completed_at timestamp with time zone, p_receipt jsonb'
  ) then
    raise exception 'MAZER_SEED_WIDEN_POSTIMAGE_COMPLETE_LEVEL_MISSING';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'mazer'
      and p.proname = 'mazer_complete_level'
      and pg_get_function_identity_arguments(p.oid) like '%p_maze_seed integer%'
  ) then
    raise exception 'MAZER_SEED_WIDEN_POSTIMAGE_AMBIGUOUS_OVERLOAD_COMPLETE_LEVEL';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'mazer'
      and p.proname = 'mazer_complete_ai_level'
      and pg_get_function_identity_arguments(p.oid) =
        'p_expected_user_id uuid, p_completed_level text, p_maze_seed bigint, p_maze_size integer, p_client_run_id uuid, p_ruleset_id text, p_recipe_version integer, p_recipe_hash text, p_completed_at timestamp with time zone, p_receipt jsonb'
  ) then
    raise exception 'MAZER_SEED_WIDEN_POSTIMAGE_COMPLETE_AI_LEVEL_MISSING';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'mazer'
      and p.proname = 'mazer_complete_ai_level'
      and pg_get_function_identity_arguments(p.oid) like '%p_maze_seed integer%'
  ) then
    raise exception 'MAZER_SEED_WIDEN_POSTIMAGE_AMBIGUOUS_OVERLOAD_COMPLETE_AI_LEVEL';
  end if;
end;
$postimage$;

commit;
