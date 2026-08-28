-- Closes player_rank (and its JSON mirror, tracks.player.rank /
-- tracks.player.colorTier) against player_target_complexity, using the
-- exact same case/threshold formula mazer_complete_level's own v_next_rank
-- and v_next_color_tier derivation uses.
--
-- Root cause: 20260828140000_mazer_progression_target_complexity_closure.sql
-- repaired player_target_complexity (and its JSON mirror) for rows the
-- earlier R017 monotonic-union repair had left inconsistent with
-- player_level, but rank/colorTier are dependent fields derived FROM
-- target_complexity, not from level directly -- normally kept in sync by
-- mazer_complete_level on every completion, but that repair wrote
-- target_complexity directly via UPDATE, bypassing that derivation. Left 5
-- rows with a target_complexity that no longer matches their own rank (the
-- account this session has been diagnosing: target_complexity 400, rank
-- still D from before the repair -- the formula says 400 should be S).
--
-- This is the second half of the same partial-closure mistake: repairing a
-- source field without recalculating every field that deterministically
-- depends on it. Checked the menu-AI track (mazer_ai_progression_states)
-- for the same gap -- zero SQL-column mismatches there, no repair needed.

begin;

do $preflight$
begin
  if to_regclass('mazer.mazer_progression_states') is null then
    raise exception 'MAZER_RANK_CLOSURE_PREIMAGE_MISSING';
  end if;
end;
$preflight$;

lock table mazer.mazer_progression_states in share row exclusive mode;

with closure as (
  select
    s.user_id,
    (case
      when s.player_target_complexity >= 125 then 'S'
      when s.player_target_complexity >= 96 then 'A'
      when s.player_target_complexity >= 70 then 'B'
      when s.player_target_complexity >= 46 then 'C'
      when s.player_target_complexity >= 28 then 'D'
      else 'E'
    end) as canonical_rank,
    least(5, greatest(0, ((s.player_target_complexity - 8) / 4) / 5)) as canonical_color_tier
  from mazer.mazer_progression_states s
  where s.player_rank is distinct from (case
      when s.player_target_complexity >= 125 then 'S'
      when s.player_target_complexity >= 96 then 'A'
      when s.player_target_complexity >= 70 then 'B'
      when s.player_target_complexity >= 46 then 'C'
      when s.player_target_complexity >= 28 then 'D'
      else 'E'
    end)
)
update mazer.mazer_progression_states s
set
  player_rank = closure.canonical_rank,
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
          'rank', closure.canonical_rank,
          'colorTier', closure.canonical_color_tier
        )
      )
    ),
  revision = coalesce(s.revision, 0) + 1,
  updated_at = pg_catalog.clock_timestamp()
from closure
where s.user_id = closure.user_id;

do $postimage$
begin
  -- The SQL-column check applies to every row (player_rank is a not-null
  -- column with a default, so every row has some value to compare). The
  -- JSON checks are scoped to rows that already carry that key -- a fresh,
  -- never-hydrated account's state can be '{}' with no tracks.player block
  -- at all, and that absence is a separate, pre-existing, benign gap, not
  -- the rank/target_complexity desync this migration targets. Matches the
  -- same scoping the AI-progression target-complexity closure used for the
  -- identical reason.
  if exists (
    select 1
    from mazer.mazer_progression_states s
    where s.player_rank is distinct from (case
        when s.player_target_complexity >= 125 then 'S'
        when s.player_target_complexity >= 96 then 'A'
        when s.player_target_complexity >= 70 then 'B'
        when s.player_target_complexity >= 46 then 'C'
        when s.player_target_complexity >= 28 then 'D'
        else 'E'
      end)
  ) then
    raise exception 'MAZER_RANK_CLOSURE_POSTIMAGE_FAILED_COLUMN';
  end if;

  if exists (
    select 1
    from mazer.mazer_progression_states s
    where s.state #> '{tracks,player}' ? 'rank'
      and s.state #>> '{tracks,player,rank}' is distinct from (case
        when s.player_target_complexity >= 125 then 'S'
        when s.player_target_complexity >= 96 then 'A'
        when s.player_target_complexity >= 70 then 'B'
        when s.player_target_complexity >= 46 then 'C'
        when s.player_target_complexity >= 28 then 'D'
        else 'E'
      end)
  ) then
    raise exception 'MAZER_RANK_CLOSURE_POSTIMAGE_FAILED_JSON_RANK';
  end if;

  if exists (
    select 1
    from mazer.mazer_progression_states s
    where s.state #> '{tracks,player}' ? 'colorTier'
      and (s.state #>> '{tracks,player,colorTier}')::integer is distinct from
        least(5, greatest(0, ((s.player_target_complexity - 8) / 4) / 5))
  ) then
    raise exception 'MAZER_RANK_CLOSURE_POSTIMAGE_FAILED_JSON_COLOR_TIER';
  end if;
end;
$postimage$;

commit;
