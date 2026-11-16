-- Hides QA / test accounts from the public leaderboard without deleting them.
--
-- Root cause: nothing marked an account as non-public, so the standing QA
-- accounts (mzr-qa-1112, mzr-qa-2, cqa-a-1105, claude) were ranked beside
-- real players by mazer_leaderboard_page and counted by
-- mazer_leaderboard_self_rank.
--
-- Change (one transaction):
--   1. mazer.mazer_profiles.leaderboard_hidden boolean not null default false.
--   2. A BEFORE INSERT/UPDATE trigger so the signed-in client roles
--      (authenticated, anon) can never set or flip the flag. mazer_profiles
--      has a TABLE-level UPDATE/INSERT grant to authenticated (own row via
--      RLS), so a column-level revoke would be a no-op; the trigger is the
--      enforcement. postgres / service_role / SECURITY DEFINER functions are
--      unaffected.
--   3. CREATE OR REPLACE of mazer_leaderboard_page and
--      mazer_leaderboard_self_rank: same signatures, same ordering, same
--      SECURITY DEFINER / search_path / grants, plus
--      "and not p.leaderboard_hidden" in EVERY ranking population so page
--      ranks and self ranks stay the same dense 1..N sequence.
--      A hidden caller gets rank = null, has_username = true: the client
--      (legacyLeaderboard.ts) maps "named caller with null rank" to "no
--      usable self-rank" and does not prompt for a username.
--   4. Sets the flag for exactly four usernames. fawxzzy, MazerMaster,
--      cudding_muisc, cuddlingmuisc and Mazer-269110 are NOT hidden.
--
-- Guard: the two live function bodies were captured read-only on 2026-11-16
-- (md5(prosrc), LF, owner postgres) and equal the repository bodies in
-- 20260824170159_mazer_master_runtime_contracts.sql. The preflight aborts if a
-- body is neither that live preimage nor already carries the new column
-- (re-run safe).

begin;

do $preflight$
declare
  v_page text;
  v_self text;
begin
  if to_regclass('mazer.mazer_profiles') is null
    or to_regclass('mazer.mazer_progression_states') is null
  then
    raise exception 'MAZER_LB_HIDE_PREIMAGE_MISSING_TABLE';
  end if;

  select p.prosrc into v_page
  from pg_catalog.pg_proc p
  where p.oid = 'mazer.mazer_leaderboard_page(integer, integer)'::regprocedure;
  select p.prosrc into v_self
  from pg_catalog.pg_proc p
  where p.oid = 'mazer.mazer_leaderboard_self_rank()'::regprocedure;

  if pg_catalog.md5(v_page) <> '57b52e11c3aa16d5d9672e43c056b486'
    and v_page not like '%leaderboard_hidden%'
  then
    raise exception 'MAZER_LB_HIDE_PREIMAGE_DRIFT_PAGE';
  end if;
  if pg_catalog.md5(v_self) <> '7f4912db0e015d565a88383e8610e86e'
    and v_self not like '%leaderboard_hidden%'
  then
    raise exception 'MAZER_LB_HIDE_PREIMAGE_DRIFT_SELF_RANK';
  end if;
end;
$preflight$;

alter table mazer.mazer_profiles
  add column if not exists leaderboard_hidden boolean not null default false;

comment on column mazer.mazer_profiles.leaderboard_hidden is
  'Operator-only flag: true removes the account from mazer_leaderboard_page and mazer_leaderboard_self_rank (QA/test accounts). Not writable by authenticated/anon; see mazer_protect_leaderboard_hidden.';

-- Client roles may not set or change the flag (silently keeps the old value /
-- the default, so a client that round-trips a whole row cannot break).
create or replace function mazer.mazer_protect_leaderboard_hidden()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.leaderboard_hidden := false;
    else
      new.leaderboard_hidden := old.leaderboard_hidden;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function mazer.mazer_protect_leaderboard_hidden()
  from public, anon, authenticated, service_role;
alter function mazer.mazer_protect_leaderboard_hidden() owner to postgres;

drop trigger if exists mazer_protect_leaderboard_hidden_before_write on mazer.mazer_profiles;
create trigger mazer_protect_leaderboard_hidden_before_write
before insert or update on mazer.mazer_profiles
for each row execute function mazer.mazer_protect_leaderboard_hidden();

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

revoke all on function mazer.mazer_leaderboard_page(integer, integer) from public;
revoke all on function mazer.mazer_leaderboard_page(integer, integer) from anon;
grant execute on function mazer.mazer_leaderboard_page(integer, integer) to anon, authenticated;
alter function mazer.mazer_leaderboard_page(integer, integer) owner to postgres;

comment on function mazer.mazer_leaderboard_page is
  'Public paginated leaderboard: rank/username/level only, never private account data. Page size is hard-capped at 100 server-side regardless of what a caller requests. Accounts with leaderboard_hidden are excluded from the ranking population.';

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

revoke all on function mazer.mazer_leaderboard_self_rank() from public;
revoke all on function mazer.mazer_leaderboard_self_rank() from anon;
grant execute on function mazer.mazer_leaderboard_self_rank() to authenticated;
alter function mazer.mazer_leaderboard_self_rank() owner to postgres;

comment on function mazer.mazer_leaderboard_self_rank is
  'The calling user''s own leaderboard rank, computed the same way as mazer_leaderboard_page regardless of whether they currently have a username set (has_username tells the client whether to prompt for one instead of showing a rank that will not actually appear on the public page). A leaderboard_hidden caller gets rank null with has_username true.';

-- Runs as the migration role (postgres), which the trigger above lets through.
update mazer.mazer_profiles
set leaderboard_hidden = true
where lower(username) in ('mzr-qa-1112', 'mzr-qa-2', 'cqa-a-1105', 'claude')
  and not leaderboard_hidden;

do $postimage$
begin
  if exists (
    select 1
    from mazer.mazer_profiles
    where leaderboard_hidden
      and lower(username) not in ('mzr-qa-1112', 'mzr-qa-2', 'cqa-a-1105', 'claude')
  ) then
    raise exception 'MAZER_LB_HIDE_POSTIMAGE_UNEXPECTED_HIDDEN';
  end if;
  if exists (
    select 1
    from mazer.mazer_profiles
    where lower(username) in ('fawxzzy', 'mazermaster', 'cudding_muisc', 'cuddlingmuisc', 'mazer-269110')
      and leaderboard_hidden
  ) then
    raise exception 'MAZER_LB_HIDE_POSTIMAGE_REAL_PLAYER_HIDDEN';
  end if;
  if (select count(*) from pg_catalog.pg_proc p
      where p.oid in ('mazer.mazer_leaderboard_page(integer, integer)'::regprocedure,
                      'mazer.mazer_leaderboard_self_rank()'::regprocedure)
        and p.prosrc like '%not p.leaderboard_hidden%') <> 2 then
    raise exception 'MAZER_LB_HIDE_POSTIMAGE_FUNCTION_BODY';
  end if;
end;
$postimage$;

commit;