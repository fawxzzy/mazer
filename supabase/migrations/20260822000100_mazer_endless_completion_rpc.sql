-- Server-owned level-completion transaction.
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
-- What this buys once that follow-up lands: a public leaderboard becomes
-- meaningful, because a client can no longer just assign itself an
-- arbitrary player_level -- every level-up has to go through this function,
-- which enforces expected-revision, exact-current-level, and idempotent
-- receipt submission server-side.
--
-- Every parameter is p_-prefixed specifically so it can never collide with
-- a column name of the same concept (client_run_id, player_level, etc.) --
-- PL/pgSQL resolves a bare identifier against table columns before
-- parameters in some contexts, and this sidesteps needing to reason about
-- that case by case.

create or replace function public.mazer_complete_level(
  p_expected_revision bigint,
  p_completed_level integer,
  p_maze_seed integer,
  p_maze_size integer,
  p_client_run_id uuid default null,
  p_ruleset_id text default null,
  p_recipe_version integer default null,
  p_recipe_hash text default null
)
returns table (
  player_level integer,
  player_rank text,
  player_target_complexity integer,
  revision bigint,
  level_reached_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current record;
  v_existing_receipt_id uuid;
  v_next_level integer;
begin
  if v_user_id is null then
    raise exception 'mazer_complete_level requires an authenticated caller' using errcode = '28000';
  end if;

  if p_completed_level is null or p_completed_level < 1 then
    raise exception 'completed_level must be a positive integer' using errcode = '22023';
  end if;

  if p_maze_size is null or p_maze_size < 1 then
    raise exception 'maze_size must be a positive integer' using errcode = '22023';
  end if;

  if p_maze_seed is null then
    raise exception 'maze_seed is required' using errcode = '22023';
  end if;

  -- Idempotent resubmission: a client_run_id already recorded means this
  -- exact completion was already applied (or is a legitimate retry of one
  -- that was). Return the current row as-is rather than advancing twice or
  -- erroring on a retry the client has every right to make.
  if p_client_run_id is not null then
    select id into v_existing_receipt_id
    from public.mazer_cycle_receipts r
    where r.client_run_id = p_client_run_id
      and r.user_id = v_user_id;

    if v_existing_receipt_id is not null then
      return query
        select
          s.player_level,
          s.player_rank,
          s.player_target_complexity,
          s.revision,
          s.level_reached_at
        from public.mazer_progression_states s
        where s.user_id = v_user_id;
      return;
    end if;
  end if;

  select s.player_level, s.player_rank, s.player_target_complexity, s.revision
    into v_current
  from public.mazer_progression_states s
  where s.user_id = v_user_id
  for update;

  if not found then
    raise exception 'No progression row for this account -- sign in normally at least once before calling mazer_complete_level' using errcode = 'P0002';
  end if;

  if v_current.revision <> p_expected_revision then
    raise exception 'Progression changed on another device (expected revision %, found %)', p_expected_revision, v_current.revision
      using errcode = '40001';
  end if;

  -- Sequential-only: the client must be completing exactly its current
  -- level, never skipping ahead or resubmitting a stale earlier level as if
  -- it were new progress.
  if p_completed_level <> v_current.player_level then
    raise exception 'completed_level (%) does not match the account''s current level (%)', p_completed_level, v_current.player_level
      using errcode = '22023';
  end if;

  v_next_level := v_current.player_level + 1;

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
  );

  update public.mazer_progression_states s
  set
    player_level = v_next_level,
    revision = v_current.revision + 1,
    level_reached_at = now(),
    updated_at = now()
  where s.user_id = v_user_id;

  return query
    select
      s.player_level,
      s.player_rank,
      s.player_target_complexity,
      s.revision,
      s.level_reached_at
    from public.mazer_progression_states s
    where s.user_id = v_user_id;
end;
$$;

revoke all on function public.mazer_complete_level(bigint, integer, integer, integer, uuid, text, integer, text) from public;
grant execute on function public.mazer_complete_level(bigint, integer, integer, integer, uuid, text, integer, text) to authenticated;

comment on function public.mazer_complete_level is
  'Server-owned, idempotent level-completion transaction. Not yet called by any client code -- see the comment at the top of this file for what still needs to happen before it is load-bearing.';
