-- Server-transactional player and menu-AI completion contracts.
--
-- Same schema-location caveat as the prior migration in this pair
-- (20260822000000_mazer_endless_progression_foundation.sql): written
-- against `public`, confirm the real live schema before applying and
-- requalify to `mazer.` if that is where the tables actually live.
--
-- Deliberately additive and non-disruptive: this does NOT revoke the
-- existing direct `update`/`insert` grants on mazer_progression_states, and
-- does NOT change any RLS policy. The app's current sync path
-- (legacyRemoteProgression.ts) still writes progression directly today, and
-- nothing about level advancement is actually driven by this function yet --
-- wiring the client over to call this instead of writing player_level
-- directly is a separate, deliberate follow-up (blocking any lock-down of
-- direct writes is correct: revoking direct write access before the client
-- is updated to use this function would break the currently-working sync
-- path outright).
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

-- An earlier source-only draft used integer for p_completed_level. Drop that
-- exact obsolete overload if a partial provider rehearsal ever created it;
-- PostgREST does not support exposing ambiguous overloaded RPCs.
drop function if exists public.mazer_complete_level(bigint, integer, integer, integer, uuid, text, integer, text);
drop function if exists public.mazer_complete_level(bigint, bigint, integer, integer, uuid, text, integer, text);
drop function if exists public.mazer_complete_level(bigint, text, integer, integer, uuid, text, integer, text);

create or replace function public.mazer_complete_level(
  p_expected_revision bigint,
  p_completed_level text,
  p_maze_seed integer,
  p_maze_size integer,
  p_client_run_id uuid,
  p_ruleset_id text default null,
  p_recipe_version integer default null,
  p_recipe_hash text default null
)
returns table (
  player_level text,
  player_rank text,
  player_target_complexity integer,
  player_completed_cycles text,
  revision bigint,
  level_reached_at timestamp with time zone
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current record;
  v_inserted_receipt_id uuid;
  v_completed_level bigint;
  v_next_level bigint;
  v_next_completed_cycles bigint;
  v_now timestamp with time zone := pg_catalog.now();
  v_state jsonb;
  v_tracks jsonb;
  v_player_track jsonb;
begin
  if v_user_id is null then
    raise exception 'mazer_complete_level requires an authenticated caller' using errcode = '28000';
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
        s.level_reached_at
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

  insert into public.mazer_cycle_receipts (
    user_id,
    surface,
    maze_seed,
    maze_size,
    client_run_id,
    ruleset_id,
    recipe_version,
    recipe_hash
  ) values (
    v_user_id,
    'play',
    p_maze_seed,
    p_maze_size,
    p_client_run_id,
    p_ruleset_id,
    p_recipe_version,
    p_recipe_hash
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
        s.level_reached_at
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
    'completedCycles', v_next_completed_cycles::text,
    'lastCompletedAt', v_now,
    'lastReceiptId', p_client_run_id::text,
    'level', v_next_level::text
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
      s.level_reached_at
    from public.mazer_progression_states s
    where s.user_id = v_user_id;
end;
$$;

revoke all on function public.mazer_complete_level(bigint, text, integer, integer, uuid, text, integer, text) from public;
grant execute on function public.mazer_complete_level(bigint, text, integer, integer, uuid, text, integer, text) to authenticated;

comment on function public.mazer_complete_level is
  'RLS-protected, idempotent player level-completion transaction. Not yet called by client code; direct-write retirement remains a separately verified cutover.';

drop function if exists public.mazer_complete_ai_level(bigint, integer, integer, uuid, text, integer, text);
drop function if exists public.mazer_complete_ai_level(text, integer, integer, uuid, text, integer, text);

create or replace function public.mazer_complete_ai_level(
  p_completed_level text,
  p_maze_seed integer,
  p_maze_size integer,
  p_client_run_id uuid,
  p_ruleset_id text default null,
  p_recipe_version integer default null,
  p_recipe_hash text default null
)
returns table (
  level text,
  rank text,
  target_complexity integer,
  completed_cycles text,
  last_completed_cycle_at timestamp with time zone
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current record;
  v_inserted_receipt_id uuid;
  v_completed_level bigint;
  v_next_level bigint;
  v_next_completed_cycles bigint;
  v_now timestamp with time zone := pg_catalog.now();
  v_state jsonb;
  v_summary jsonb;
begin
  if v_user_id is null then
    raise exception 'mazer_complete_ai_level requires an authenticated caller' using errcode = '28000';
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
        s.last_completed_cycle_at
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

  insert into public.mazer_cycle_receipts (
    user_id,
    surface,
    maze_seed,
    maze_size,
    client_run_id,
    ruleset_id,
    recipe_version,
    recipe_hash
  ) values (
    v_user_id,
    'menu-demo',
    p_maze_seed,
    p_maze_size,
    p_client_run_id,
    p_ruleset_id,
    p_recipe_version,
    p_recipe_hash
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
        s.last_completed_cycle_at
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
    'completedCycles', v_next_completed_cycles::text,
    'lastCompletedAt', v_now,
    'lastReceiptId', p_client_run_id::text,
    'level', v_next_level::text
  );
  v_summary := v_summary || pg_catalog.jsonb_build_object(
    'completedCycles', v_next_completed_cycles::text,
    'lastCompletedAt', v_now,
    'lastReceiptId', p_client_run_id::text,
    'level', v_next_level::text
  );

  update public.mazer_ai_progression_states s
  set
    level = v_next_level,
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
      s.last_completed_cycle_at
    from public.mazer_ai_progression_states s
    where s.user_id = v_user_id
      and s.runner_key = 'menu-runner';
end;
$$;

revoke all on function public.mazer_complete_ai_level(text, integer, integer, uuid, text, integer, text) from public;
grant execute on function public.mazer_complete_ai_level(text, integer, integer, uuid, text, integer, text) to authenticated;

comment on function public.mazer_complete_ai_level is
  'RLS-protected, idempotent menu-AI level-completion transaction. Not yet called by client code; direct-write retirement remains a separately verified cutover.';
