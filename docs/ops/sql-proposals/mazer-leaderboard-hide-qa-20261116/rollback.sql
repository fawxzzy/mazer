-- ROLLBACK for 20260828160000_mazer_leaderboard_hide_qa_accounts.sql
-- Restores the two leaderboard functions to the exact live bodies captured
-- read-only on 2026-11-16 (equal to 20260824170159_mazer_master_runtime_contracts.sql),
-- then removes the protection trigger and the leaderboard_hidden column.
-- Hidden accounts become visible again (their flag is dropped with the column).
-- Not a migration: lives under docs/ops/sql-proposals, never applied by supabase db push.

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

revoke all on function mazer.mazer_leaderboard_page(integer, integer) from public;
revoke all on function mazer.mazer_leaderboard_page(integer, integer) from anon;
grant execute on function mazer.mazer_leaderboard_page(integer, integer) to anon, authenticated;

comment on function mazer.mazer_leaderboard_page is
  'Public paginated leaderboard: rank/username/level only, never private account data. Page size is hard-capped at 100 server-side regardless of what a caller requests.';

-- A caller needs its own rank even when it falls outside the requested
-- page (e.g. showing "you are #4,213" without downloading 4,213 rows to
-- find that out client-side).
drop function if exists mazer.mazer_leaderboard_self_rank();

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
  -- (only rows with a username) -- an earlier version of this query ranked
  -- over every progression row via a bare left join, so a caller's number
  -- here could disagree with where they actually sit on the public page
  -- (counting no-username accounts against them that the page itself never
  -- shows). base is the caller's own row; ranked only ever matches it when
  -- they have a username, leaving rank null otherwise.
  with ranked as (
    select
      s.user_id,
      row_number() over (
        order by s.player_level desc, s.level_reached_at asc nulls last, s.user_id asc
      ) as rank_value
    from mazer.mazer_progression_states s
    join mazer.mazer_profiles p on p.user_id = s.user_id
    where p.username is not null
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

revoke all on function mazer.mazer_leaderboard_self_rank() from public;
revoke all on function mazer.mazer_leaderboard_self_rank() from anon;
grant execute on function mazer.mazer_leaderboard_self_rank() to authenticated;

comment on function mazer.mazer_leaderboard_self_rank is
  'The calling user''s own leaderboard rank, computed the same way as mazer_leaderboard_page regardless of whether they currently have a username set (has_username tells the client whether to prompt for one instead of showing a rank that will not actually appear on the public page).';

alter function mazer.mazer_leaderboard_page(integer, integer) owner to postgres;
alter function mazer.mazer_leaderboard_self_rank() owner to postgres;

drop trigger if exists mazer_protect_leaderboard_hidden_before_write on mazer.mazer_profiles;
drop function if exists mazer.mazer_protect_leaderboard_hidden();
alter table mazer.mazer_profiles drop column if exists leaderboard_hidden;

do $postimage$
declare
  v_page text;
  v_self text;
begin
  select p.prosrc into v_page from pg_catalog.pg_proc p
  where p.oid = 'mazer.mazer_leaderboard_page(integer, integer)'::regprocedure;
  select p.prosrc into v_self from pg_catalog.pg_proc p
  where p.oid = 'mazer.mazer_leaderboard_self_rank()'::regprocedure;
  if pg_catalog.md5(v_page) <> '57b52e11c3aa16d5d9672e43c056b486' then
    raise exception 'MAZER_LB_HIDE_ROLLBACK_PAGE_BODY_MISMATCH';
  end if;
  if pg_catalog.md5(v_self) <> '7f4912db0e015d565a88383e8610e86e' then
    raise exception 'MAZER_LB_HIDE_ROLLBACK_SELF_RANK_BODY_MISMATCH';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'mazer' and table_name = 'mazer_profiles'
               and column_name = 'leaderboard_hidden') then
    raise exception 'MAZER_LB_HIDE_ROLLBACK_COLUMN_STILL_PRESENT';
  end if;
end;
$postimage$;

commit;
