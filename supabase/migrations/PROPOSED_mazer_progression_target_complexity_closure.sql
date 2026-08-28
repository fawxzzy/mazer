-- PROPOSED, NOT YET APPLIED. Named without a timestamp prefix deliberately
-- so it does not run as part of the normal migration sequence -- rename
-- with a real timestamp only after someone who owns the live database has
-- reviewed this and confirmed it against the actual current row shapes.
--
-- Root cause this repairs: 20260827170000_mazer_progression_ordinal_closure.sql
-- ("R017 monotonic union") closed the player_level / player_completed_cycles
-- invariant (player_level - 1 = player_completed_cycles) for any row where
-- the two had drifted apart, by raising whichever was lower to match the
-- higher. It updated player_level, player_completed_cycles, level_reached_at,
-- and the JSON mirror's level/completedCycles -- but never touched
-- player_target_complexity or the JSON mirror's targetComplexity. Any row
-- that migration corrected now has a player_level that no longer matches
-- what player_target_complexity implies (targetComplexity is deterministic
-- from level everywhere else in this codebase --
-- resolveLegacyProgressionPacedTarget / resolveLegacyMazeGenerationProfileForProgression
-- both derive every generation knob from it). Reported symptom: an account
-- showing a high level number (e.g. 111) while the maze actually generated
-- plays like a much lower one (e.g. 6) -- the level climbed in the R017
-- repair, the complexity that should have climbed with it did not.
--
-- This is NOT a client bug. mergeLegacyProgressionStateAdvancements (the
-- client's local/remote merge) was checked against its own test suite
-- first (tests/reset/legacy-remote-progression.test.ts) -- level,
-- completedCycles, and targetComplexity are each intentionally independent
-- monotonic ratchets there, by design, and changing that broke two
-- existing, deliberate tests. The client is correctly reading back exactly
-- what this one repair migration left inconsistent server-side.
--
-- Formula mirrors legacyProgression.ts exactly:
--   LEGACY_PROGRESSION_MIN_COMPLEXITY = 8
--   LEGACY_PROGRESSION_MAX_COMPLEXITY = 400
--   targetComplexity = clamp(8 + (min(level, 99) - 1) * 4, 8, 400)
-- i.e. level climbs unbounded past 99 but complexity clamps at what level
-- 99 already produces (see legacyEndlessProgression.ts's own header comment
-- for why the endless-tier recipe isn't wired into live generation yet --
-- unrelated to this repair, just the reason the clamp exists at all).

begin;

do $preflight$
begin
  if to_regnamespace('mazer') is null
    or to_regclass('mazer.mazer_progression_states') is null
  then
    raise exception 'MAZER_TARGET_COMPLEXITY_CLOSURE_PREIMAGE_MISSING';
  end if;
end;
$preflight$;

lock table mazer.mazer_progression_states in share row exclusive mode;

with closure as (
  select
    s.user_id,
    least(
      greatest(8 + ((least(s.player_level, 99) - 1) * 4), 8),
      400
    )::integer as canonical_target_complexity
  from mazer.mazer_progression_states s
  where s.player_target_complexity is distinct from least(
    greatest(8 + ((least(s.player_level, 99) - 1) * 4), 8),
    400
  )::integer
)
update mazer.mazer_progression_states s
set
  player_target_complexity = closure.canonical_target_complexity,
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
          'targetComplexity', closure.canonical_target_complexity
        )
      )
    ),
  revision = coalesce(s.revision, 0) + 1,
  updated_at = pg_catalog.clock_timestamp()
from closure
where s.user_id = closure.user_id;

do $postimage$
begin
  if exists (
    select 1
    from mazer.mazer_progression_states s
    where s.player_target_complexity is distinct from least(
      greatest(8 + ((least(s.player_level, 99) - 1) * 4), 8),
      400
    )::integer
    or s.state #>> '{tracks,player,targetComplexity}' is distinct from s.player_target_complexity::text
  ) then
    raise exception 'MAZER_TARGET_COMPLEXITY_CLOSURE_POSTIMAGE_FAILED';
  end if;
end;
$postimage$;

commit;

-- Recommended before applying to production:
-- 1. Run the closure-only SELECT (the "with closure as (...) select * from closure")
--    by itself first against a read replica or in a transaction you roll
--    back, and manually spot-check a handful of affected user_ids against
--    what the client actually shows them, to confirm this matches lived
--    reality before writing anything.
-- 2. Consider whether ai-runner tracks need the identical repair --
--    R017's own closure touched both tracks; this proposal currently
--    covers mazer_progression_states directly by user_id/player_* columns,
--    which is player-track-only. If ai-runner has an equivalent
--    ai_target_complexity column that could have drifted the same way,
--    extend this migration to cover it before applying.
