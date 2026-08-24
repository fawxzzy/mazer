-- Server-transactional player and menu-AI completion contracts.
--
-- Same schema-location caveat as the prior migration in this pair
-- (20260822000000_mazer_endless_progression_foundation.sql): written
-- against `public`, confirm the real live schema before applying and
-- requalify to `mazer.` if that is where the tables actually live.
--
-- Progression mutation is RPC-only after this migration. Ownership RLS still
-- governs reads, while the SECURITY DEFINER functions below re-check the
-- authenticated user explicitly before performing the narrowly bounded
-- initialize, complete, or reset transaction. Direct progression and receipt
-- writes are revoked so callers cannot bypass receipt/idempotency rules or
-- forge leaderboard ordinals through their otherwise owner-scoped rows.
--
-- What this buys once that follow-up lands: both displayed completion
-- ordinals advance exactly once per accepted run, never regress, and remain
-- independent from bounded difficulty. The player RPC enforces revision plus
-- exact-current-level; the menu-AI RPC enforces exact-current-level. Both use
-- a mandatory per-account run UUID and one transactionally inserted receipt.
--
-- Every parameter is p_-prefixed specifically so it can never collide with
-- a column name of the same concept (client_run_id, player_level, etc.) --
-- PL/pgSQL resolves a bare identifier against table columns before
-- parameters in some contexts, and this sidesteps needing to reason about
-- that case by case.

drop function if exists public.mazer_initialize_progression(uuid);

create function public.mazer_initialize_progression(
  p_expected_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or p_expected_user_id is distinct from v_user_id then
    raise exception 'mazer_initialize_progression account mismatch' using errcode = '28000';
  end if;

  insert into public.mazer_progression_states (
    user_id,
    schema_version,
    state,
    player_level,
    player_rank,
    player_target_complexity,
    player_completed_cycles,
    revision
  ) values (
    v_user_id,
    1,
    '{}'::jsonb,
    1,
    'E',
    8,
    0,
    0
  ) on conflict (user_id) do nothing;

  insert into public.mazer_ai_progression_states (
    user_id,
    runner_key,
    schema_version,
    state,
    summary,
    level,
    rank,
    target_complexity,
    completed_cycles
  ) values (
    v_user_id,
    'menu-runner',
    1,
    '{}'::jsonb,
    '{}'::jsonb,
    1,
    'E',
    8,
    0
  ) on conflict (user_id, runner_key) do nothing;
end;
$$;

revoke all on function public.mazer_initialize_progression(uuid) from public;
grant execute on function public.mazer_initialize_progression(uuid) to authenticated;

comment on function public.mazer_initialize_progression is
  'Creates only the authenticated caller''s missing baseline player and menu-AI rows. Existing progression is never changed.';

-- An earlier source-only draft used integer for p_completed_level. Drop that
-- exact obsolete overload if a partial provider rehearsal ever created it;
-- PostgREST does not support exposing ambiguous overloaded RPCs.
drop function if exists public.mazer_complete_level(bigint, integer, integer, integer, uuid, text, integer, text);
drop function if exists public.mazer_complete_level(bigint, bigint, integer, integer, uuid, text, integer, text);
drop function if exists public.mazer_complete_level(bigint, text, integer, integer, uuid, text, integer, text);
drop function if exists public.mazer_complete_level(bigint, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb);
drop function if exists public.mazer_complete_level(bigint, uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb);

create or replace function public.mazer_complete_level(
  p_expected_revision bigint,
  p_expected_user_id uuid,
  p_completed_level text,
  p_maze_seed integer,
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

  if p_maze_seed is null then
    raise exception 'maze_seed is required' using errcode = '22023';
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
  from public.mazer_progression_states s
  where s.user_id = v_user_id
  for update;

  if not found then
    raise exception 'No progression row for this account -- sign in normally at least once before calling mazer_complete_level' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.mazer_cycle_receipts r
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
      from public.mazer_progression_states s
      where s.user_id = v_user_id;
    return;
  end if;

  if v_current.revision <> p_expected_revision then
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

  insert into public.mazer_cycle_receipts (
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
      from public.mazer_progression_states s
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
    'lastReceiptId', pg_catalog.coalesce(pg_catalog.nullif(p_receipt ->> 'id', ''), p_client_run_id::text),
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

  update public.mazer_progression_states s
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
    from public.mazer_progression_states s
    where s.user_id = v_user_id;
end;
$$;

revoke all on function public.mazer_complete_level(bigint, uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb) from public;
grant execute on function public.mazer_complete_level(bigint, uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb) to authenticated;

comment on function public.mazer_complete_level is
  'Auth-bound, idempotent, load-bearing player completion transaction. The client keeps the same run UUID in a durable outbox until this function returns the canonical state.';

drop function if exists public.mazer_complete_ai_level(bigint, integer, integer, uuid, text, integer, text);
drop function if exists public.mazer_complete_ai_level(text, integer, integer, uuid, text, integer, text);
drop function if exists public.mazer_complete_ai_level(text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb);
drop function if exists public.mazer_complete_ai_level(uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb);

create or replace function public.mazer_complete_ai_level(
  p_expected_user_id uuid,
  p_completed_level text,
  p_maze_seed integer,
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

  if p_maze_seed is null then
    raise exception 'maze_seed is required' using errcode = '22023';
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
  from public.mazer_ai_progression_states s
  where s.user_id = v_user_id
    and s.runner_key = 'menu-runner'
  for update;

  if not found then
    raise exception 'No menu AI progression row for this account -- sync once before calling mazer_complete_ai_level' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.mazer_cycle_receipts r
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
      from public.mazer_ai_progression_states s
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

  insert into public.mazer_cycle_receipts (
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
      from public.mazer_ai_progression_states s
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
    'lastReceiptId', pg_catalog.coalesce(pg_catalog.nullif(p_receipt ->> 'id', ''), p_client_run_id::text),
    'level', v_next_level::text,
    'rank', v_next_rank,
    'targetComplexity', v_next_target_complexity
  );
  v_summary := v_summary || pg_catalog.jsonb_build_object(
    'colorTier', v_next_color_tier,
    'completedCycles', v_next_completed_cycles::text,
    'lastCompletedAt', v_now,
    'lastReceiptId', pg_catalog.coalesce(pg_catalog.nullif(p_receipt ->> 'id', ''), p_client_run_id::text),
    'level', v_next_level::text,
    'rank', v_next_rank,
    'targetComplexity', v_next_target_complexity
  );

  update public.mazer_ai_progression_states s
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
    from public.mazer_ai_progression_states s
    where s.user_id = v_user_id
      and s.runner_key = 'menu-runner';
end;
$$;

revoke all on function public.mazer_complete_ai_level(uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb) from public;
grant execute on function public.mazer_complete_ai_level(uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb) to authenticated;

comment on function public.mazer_complete_ai_level is
  'Auth-bound, idempotent, load-bearing menu-AI completion transaction. The client keeps the same run UUID in a durable outbox until this function returns the canonical state.';

drop function if exists public.mazer_reset_progression(bigint, uuid);

create function public.mazer_reset_progression(
  p_expected_revision bigint,
  p_expected_user_id uuid
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
  v_current_revision bigint;
  v_now timestamp with time zone := pg_catalog.clock_timestamp();
begin
  if v_user_id is null or p_expected_user_id is distinct from v_user_id then
    raise exception 'mazer_reset_progression account mismatch' using errcode = '28000';
  end if;

  insert into public.mazer_progression_states (
    user_id,
    schema_version,
    state,
    player_level,
    player_rank,
    player_target_complexity,
    player_completed_cycles,
    revision
  ) values (
    v_user_id,
    1,
    '{}'::jsonb,
    1,
    'E',
    8,
    0,
    0
  ) on conflict (user_id) do nothing;

  select s.revision
    into v_current_revision
  from public.mazer_progression_states s
  where s.user_id = v_user_id
  for update;

  if v_current_revision <> p_expected_revision then
    raise exception 'Progression changed on another device (expected revision %, found %)', p_expected_revision, v_current_revision
      using errcode = '40001';
  end if;

  update public.mazer_progression_states s
  set
    schema_version = 1,
    state = '{}'::jsonb,
    player_level = 1,
    player_rank = 'E',
    player_target_complexity = 8,
    player_completed_cycles = 0,
    revision = v_current_revision + 1,
    last_completed_cycle_at = null,
    level_reached_at = null,
    updated_at = v_now
  where s.user_id = v_user_id;

  insert into public.mazer_ai_progression_states (
    user_id,
    runner_key,
    schema_version,
    state,
    summary,
    level,
    rank,
    target_complexity,
    completed_cycles,
    last_completed_cycle_at,
    updated_at
  ) values (
    v_user_id,
    'menu-runner',
    1,
    '{}'::jsonb,
    '{}'::jsonb,
    1,
    'E',
    8,
    0,
    null,
    v_now
  )
  on conflict (user_id, runner_key) do update
  set
    schema_version = excluded.schema_version,
    state = excluded.state,
    summary = excluded.summary,
    level = excluded.level,
    rank = excluded.rank,
    target_complexity = excluded.target_complexity,
    completed_cycles = excluded.completed_cycles,
    last_completed_cycle_at = excluded.last_completed_cycle_at,
    updated_at = excluded.updated_at;

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
    from public.mazer_progression_states s
    where s.user_id = v_user_id;
end;
$$;

revoke all on function public.mazer_reset_progression(bigint, uuid) from public;
grant execute on function public.mazer_reset_progression(bigint, uuid) to authenticated;

comment on function public.mazer_reset_progression is
  'Atomically resets only the authenticated caller''s player and menu-AI progression after an exact revision check.';

-- Authenticated clients retain read access through their existing owner RLS
-- policies, but every progression/receipt mutation now crosses one of the
-- explicit functions above. Profile/settings writes remain unchanged.
revoke insert, update on table public.mazer_progression_states from authenticated;
revoke insert, update on table public.mazer_ai_progression_states from authenticated;
revoke insert on table public.mazer_cycle_receipts from authenticated;
