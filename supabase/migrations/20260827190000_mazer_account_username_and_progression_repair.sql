-- Restore the player-facing progression baseline contract and provide the
-- auth-bound username rename path required after direct profile writes were
-- intentionally revoked during the shared-project cutover.

do $$
begin
  if to_regclass('mazer.mazer_profiles') is null
    or to_regclass('mazer.mazer_progression_states') is null
    or to_regclass('mazer.mazer_cycle_receipts') is null
  then
    raise exception 'MAZER_ACCOUNT_REPAIR_PREIMAGE_MISSING';
  end if;
end;
$$;

create or replace function mazer.mazer_set_username(
  p_expected_user_id uuid,
  p_username text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_username text := pg_catalog.btrim(p_username);
  v_saved text;
begin
  if v_user_id is null or p_expected_user_id is distinct from v_user_id then
    raise exception 'mazer_set_username account mismatch' using errcode = '28000';
  end if;

  if v_username is null
    or pg_catalog.char_length(v_username) not between 2 and 15
    or v_username !~ '^[a-zA-Z0-9._-]+$'
  then
    raise exception 'MAZER_USERNAME_INVALID' using errcode = '22023';
  end if;

  update mazer.mazer_profiles p
  set
    username = v_username,
    updated_at = pg_catalog.clock_timestamp()
  where p.user_id = v_user_id
  returning p.username into v_saved;

  if not found then
    raise exception 'MAZER_PROFILE_MISSING' using errcode = 'P0002';
  end if;

  return v_saved;
end;
$$;

alter function mazer.mazer_set_username(uuid, text) owner to postgres;
revoke all on function mazer.mazer_set_username(uuid, text) from public, anon;
grant execute on function mazer.mazer_set_username(uuid, text) to authenticated;

comment on function mazer.mazer_set_username(uuid, text) is
  'Auth-bound username rename. Updates only the caller profile; the case-insensitive unique index remains final collision authority and the username-origin trigger marks the value claimed.';

-- The current runtime deliberately rebases historical player counters that
-- lack post-baseline proof. Pre-idempotency legacy receipts have no
-- client_run_id, so they remain retained history but cannot prove a current
-- player level. A non-null play client_run_id is the completion RPC's accepted
-- receipt invariant. Do not require recipe metadata here: legacy-v1 correctly
-- writes null recipe_version/recipe_hash, and endless-v1 currently writes a
-- null recipe_hash. Exclude any account with an accepted play receipt, then
-- restore every remaining player track to the exact Level-1 source baseline.
-- This repairs leaderboard columns and JSON together.
with baseline_candidates as (
  select
    s.user_id,
    case when pg_catalog.jsonb_typeof(s.state) = 'object' then s.state else '{}'::jsonb end as current_state
  from mazer.mazer_progression_states s
  where not exists (
    select 1
    from mazer.mazer_cycle_receipts r
    where r.user_id = s.user_id
      and r.surface = 'play'
      and r.client_run_id is not null
  )
), normalized as (
  select
    c.user_id,
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        c.current_state,
        '{tracks}',
        case
          when pg_catalog.jsonb_typeof(c.current_state -> 'tracks') = 'object'
            then c.current_state -> 'tracks'
          else '{}'::jsonb
        end
        || pg_catalog.jsonb_build_object(
          'player',
          case
            when pg_catalog.jsonb_typeof(c.current_state #> '{tracks,player}') = 'object'
              then c.current_state #> '{tracks,player}'
            else '{}'::jsonb
          end
          || pg_catalog.jsonb_build_object(
            'bestCompletionTimeMs', null,
            'cleanCycles', 0,
            'colorTier', 0,
            'completedCycles', '0',
            'lastCompletedAt', null,
            'lastCompletionTimeMs', null,
            'lastMazeSeed', null,
            'lastReceiptId', null,
            'lastSignal', 'hold',
            'level', '1',
            'paceScore', 0,
            'peakComplexity', 8,
            'rank', 'E',
            'recentSignals', '[]'::jsonb,
            'struggleCycles', 9007199254740991,
            'targetComplexity', 8
          )
        ),
        true
      ),
      '{playerProgressionBaselineVersion}',
      '5'::jsonb,
      true
    ) as repaired_state
  from baseline_candidates c
)
update mazer.mazer_progression_states s
set
  player_level = 1,
  player_rank = 'E',
  player_target_complexity = 8,
  player_completed_cycles = 0,
  revision = s.revision + 1,
  state = n.repaired_state,
  last_completed_cycle_at = null,
  level_reached_at = pg_catalog.clock_timestamp(),
  updated_at = pg_catalog.clock_timestamp()
from normalized n
where n.user_id = s.user_id
  and (
    s.player_level <> 1
    or s.player_rank <> 'E'
    or s.player_target_complexity <> 8
    or s.player_completed_cycles <> 0
    or s.state is distinct from n.repaired_state
  );

do $$
begin
  if exists (
    select 1
    from mazer.mazer_progression_states s
    where not exists (
      select 1
      from mazer.mazer_cycle_receipts r
      where r.user_id = s.user_id
        and r.surface = 'play'
        and r.client_run_id is not null
    )
      and (
        s.player_level <> 1
        or s.player_rank <> 'E'
        or s.player_target_complexity <> 8
        or s.player_completed_cycles <> 0
        or s.state #>> '{tracks,player,level}' <> '1'
        or s.state #>> '{tracks,player,completedCycles}' <> '0'
        or s.state #>> '{tracks,player,targetComplexity}' <> '8'
        or s.state #>> '{tracks,player,struggleCycles}' <> '9007199254740991'
      )
  ) then
    raise exception 'MAZER_ACCOUNT_REPAIR_POSTIMAGE_FAILED';
  end if;
end;
$$;
