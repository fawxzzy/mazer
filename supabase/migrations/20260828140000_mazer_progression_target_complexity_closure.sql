-- APPLIED to production 2026-08-28 via the Supabase Management API, with
-- explicit user sign-off first. Preflight found 7 affected rows (spot
-- checked; the highest, player_level 111 with target_complexity 30 instead
-- of 400, matched the exact reported symptom -- "level 111 but plays like
-- level 6"). Postimage confirmed 0 rows remaining inconsistent, both the
-- player_target_complexity column and the JSON mirror. This file is kept,
-- renamed from its original PROPOSED_ (no-timestamp) filename, as the
-- historical record of the fix -- re-running it against the same data is a
-- no-op (its own WHERE clause only touches rows still inconsistent).
--
-- A companion fix for mazer_ai_progression_states (2 affected rows, same
-- root cause, different table/JSON shape) shipped alongside this file --
-- see 20260828140100_mazer_ai_progression_target_complexity_closure.sql.
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
