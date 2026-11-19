-- ROLLBACK for 20260828170000_mazer_leaderboard_game_mode.sql
-- Restores the two leaderboard functions to the post-hide-QA bodies (20260828160000, applied live
-- 2026-11-16), then drops the mode index, the shape check and the mode column.
-- Rolling back does not touch scores or rankings: every row was endless, and the restored
-- functions rank all rows. Not a migration: lives under docs/ops/sql-proposals, never applied by
-- supabase db push. CREATE OR REPLACE keeps owner, ACL and comments (restated nowhere).

begin;

create or replace function mazer.mazer_leaderboard_page(
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  rank text,
  username text,
  player_level text,
  is_requesting_user boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  with ranked as (
    select
      p.username,
      s.player_level,
      s.user_id,
      row_number() over (
        order by s.player_level desc, s.level_reached_at asc nulls last, s.user_id asc
      ) as rank_value
    from mazer.mazer_progression_states s
    join mazer.mazer_profiles p on p.user_id = s.user_id
    where p.username is not null
      and not p.leaderboard_hidden
  )
  select
    ranked.rank_value::text,
    ranked.username,
    ranked.player_level::text,
    ranked.user_id = auth.uid() as is_requesting_user
  from ranked
  order by ranked.rank_value
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function mazer.mazer_leaderboard_self_rank()
returns table (
  rank text,
  player_level text,
  has_username boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  -- Ranked over the exact same population mazer_leaderboard_page counts
  -- (only rows with a username that are not leaderboard_hidden) -- an earlier
  -- version of this query ranked over every progression row via a bare left
  -- join, so a caller's number here could disagree with where they actually
  -- sit on the public page. base is the caller's own row; ranked only ever
  -- matches it when they are listed on the page, leaving rank null otherwise
  -- (no username, or leaderboard_hidden).
  with ranked as (
    select
      s.user_id,
      row_number() over (
        order by s.player_level desc, s.level_reached_at asc nulls last, s.user_id asc
      ) as rank_value
    from mazer.mazer_progression_states s
    join mazer.mazer_profiles p on p.user_id = s.user_id
    where p.username is not null
      and not p.leaderboard_hidden
  ),
  base as (
    select s.user_id, s.player_level, p.username is not null as has_username
    from mazer.mazer_progression_states s
    left join mazer.mazer_profiles p on p.user_id = s.user_id
    where s.user_id = auth.uid()
  )
  select ranked.rank_value::text, base.player_level::text, base.has_username
  from base
  left join ranked on ranked.user_id = base.user_id;
$$;

drop index if exists mazer.mazer_progression_states_mode_level_idx;
alter table mazer.mazer_progression_states drop constraint if exists mazer_progression_states_mode_check;
alter table mazer.mazer_progression_states drop column if exists mode;

do $postimage$
begin
  if pg_catalog.md5((select p.prosrc from pg_catalog.pg_proc p
       where p.oid = 'mazer.mazer_leaderboard_page(integer, integer)'::regprocedure)) <> '15a7b4655d7cb4cfe8778eb3379220bc' then
    raise exception 'MAZER_LB_MODE_ROLLBACK_PAGE_BODY_MISMATCH';
  end if;
  if pg_catalog.md5((select p.prosrc from pg_catalog.pg_proc p
       where p.oid = 'mazer.mazer_leaderboard_self_rank()'::regprocedure)) <> '1289597dc20bcebf6594ce19c21acd5b' then
    raise exception 'MAZER_LB_MODE_ROLLBACK_SELF_RANK_BODY_MISMATCH';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'mazer' and table_name = 'mazer_progression_states'
               and column_name = 'mode') then
    raise exception 'MAZER_LB_MODE_ROLLBACK_COLUMN_STILL_PRESENT';
  end if;
end;
$postimage$;

commit;
