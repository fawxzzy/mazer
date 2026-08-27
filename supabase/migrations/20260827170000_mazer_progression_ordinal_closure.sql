-- Restore the superseding completion-ordinal invariant after the R017
-- monotonic union preserved historical level and completed-cycle maxima
-- independently. Neither value is allowed to move backward: the canonical
-- closure is max(player_level, player_completed_cycles + 1), and the paired
-- completed-cycle value becomes canonical_level - 1.

begin;

do $preflight$
begin
  if to_regnamespace('mazer') is null
    or to_regclass('mazer.mazer_profiles') is null
    or to_regclass('mazer.mazer_progression_states') is null
    or to_regclass('mazer.mazer_cycle_receipts') is null
  then
    raise exception 'MAZER_PROGRESSION_ORDINAL_CLOSURE_PREIMAGE_MISSING';
  end if;

  if exists (
    select 1
    from mazer.mazer_progression_states
    where player_completed_cycles = 9223372036854775807
  ) then
    raise exception 'MAZER_PROGRESSION_ORDINAL_EXHAUSTED';
  end if;
end;
$preflight$;

lock table mazer.mazer_progression_states in share row exclusive mode;

alter table mazer.mazer_progression_states
  drop constraint if exists mazer_progression_states_completion_ordinal_check;

with closure as (
  select
    s.user_id,
    case
      when s.player_level > s.player_completed_cycles + 1 then s.player_level
      else s.player_completed_cycles + 1
    end as canonical_level,
    case
      when s.player_level > s.player_completed_cycles + 1 then s.player_level - 1
      else s.player_completed_cycles
    end as canonical_completed_cycles,
    coalesce(
      (
        select max(r.completed_at)
        from mazer.mazer_cycle_receipts r
        where r.user_id = s.user_id
          and r.surface = 'play'
      ),
      s.level_reached_at,
      s.last_completed_cycle_at,
      s.updated_at,
      s.created_at,
      pg_catalog.clock_timestamp()
    ) as canonical_level_reached_at
  from mazer.mazer_progression_states s
  where s.player_level - 1 is distinct from s.player_completed_cycles
)
update mazer.mazer_progression_states s
set
  player_level = closure.canonical_level,
  player_completed_cycles = closure.canonical_completed_cycles,
  level_reached_at = case
    when closure.canonical_level > s.player_level then closure.canonical_level_reached_at
    else s.level_reached_at
  end,
  state = (coalesce(s.state, '{}'::jsonb) - 'tracks')
    || pg_catalog.jsonb_build_object(
      'tracks',
      (
        case
          when pg_catalog.jsonb_typeof(s.state -> 'tracks') = 'object' then s.state -> 'tracks'
          else '{}'::jsonb
        end - 'player'
      )
      || pg_catalog.jsonb_build_object(
        'player',
        (
          case
            when pg_catalog.jsonb_typeof(s.state -> 'tracks' -> 'player') = 'object'
              then s.state -> 'tracks' -> 'player'
            else '{}'::jsonb
          end
        )
        || pg_catalog.jsonb_build_object(
          'level', closure.canonical_level::text,
          'completedCycles', closure.canonical_completed_cycles::text
        )
      )
    ),
  revision = coalesce(s.revision, 0) + 1,
  updated_at = pg_catalog.clock_timestamp()
from closure
where s.user_id = closure.user_id;

alter table mazer.mazer_progression_states
  add constraint mazer_progression_states_completion_ordinal_check
  check (player_level - 1 = player_completed_cycles) not valid;

alter table mazer.mazer_progression_states
  validate constraint mazer_progression_states_completion_ordinal_check;

do $postimage$
begin
  if exists (
    select 1
    from mazer.mazer_progression_states
    where player_level - 1 is distinct from player_completed_cycles
      or state #>> '{tracks,player,level}' is distinct from player_level::text
      or state #>> '{tracks,player,completedCycles}' is distinct from player_completed_cycles::text
  ) then
    raise exception 'MAZER_PROGRESSION_ORDINAL_CLOSURE_POSTIMAGE_FAILED';
  end if;
end;
$postimage$;

comment on constraint mazer_progression_states_completion_ordinal_check
  on mazer.mazer_progression_states is
  'The visible player completion ordinal and completed-cycle count advance in lockstep from Level 1. Historical reconciliation closes monotonically and never lowers either value.';

commit;
