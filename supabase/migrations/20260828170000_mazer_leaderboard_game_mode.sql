-- Game mode tag for leaderboard scores (lane L11, "Game modes shell"). PROPOSED, NOT APPLIED.
-- Product contract: docs/architecture/MAZER-GAME-MODES-PRODUCT-CONTRACT.md.
-- Proposal folder (README, rollback, scratch evidence): docs/ops/sql-proposals/mazer-leaderboard-mode-20261119.
--
-- Change (one transaction, additive):
--   1. mazer.mazer_progression_states.mode text not null default 'endless'. Adding a column with a
--      constant default is metadata-only on PostgreSQL 11+ (no table rewrite): every existing row
--      reads as 'endless' without a data change, which IS the backfill (the post-image asserts that
--      no row is anything else). An explicit UPDATE would rewrite every row to change nothing.
--   2. A shape check on the value (lower-case id, 1..32 chars). It does not list modes, so adding a
--      mode later needs no migration of this constraint.
--   3. An index to rank one mode's scores: (mode, player_level desc, level_reached_at, user_id).
--   4. CREATE OR REPLACE of mazer_leaderboard_page and mazer_leaderboard_self_rank: same
--      signatures, same ordering, same SECURITY DEFINER / search_path, plus "and s.mode = 'endless'"
--      in every ranking population, so today's two calls keep ranking exactly what they rank now
--      (Endless) and stay correct if a row of another mode ever exists. CREATE OR REPLACE keeps the
--      existing owner, ACL and comments, so no grant is restated and nothing about access changes.
--      Page ranks and self ranks stay the same dense 1..N sequence.
--   No new function and no new argument: a mode-aware read belongs to the card that adds a second
--   mode. The progression row is keyed by user_id alone (one score per account); a second mode with
--   its own score per account needs a key change or its own table, decided there, not here.
--   Client roles cannot write the column: authenticated has no INSERT/UPDATE on the progression
--   table (20260824170159_mazer_master_runtime_contracts.sql), writes go through SECURITY DEFINER
--   completion functions whose INSERT lists do not name the column (default 'endless'). The fresh
--   read-only preimage must re-confirm those grants and the completion function bodies.
--
-- Guard: the two function bodies must be either the post-hide-QA bodies (migration
-- 20260828160000, applied live 2026-11-16: md5(prosrc) pinned below) or already carry the
-- new filter (re-run safe). The md5 pins are computed from that repository file as LF; they are NOT
-- yet confirmed against a fresh live read (see the proposal README, "Preimage questions").

begin;

do $preflight$
declare
  v_page text;
  v_self text;
begin
  if to_regclass('mazer.mazer_progression_states') is null
    or to_regclass('mazer.mazer_profiles') is null
  then
    raise exception 'MAZER_LB_MODE_PREIMAGE_MISSING_TABLE';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'mazer' and table_name = 'mazer_profiles'
      and column_name = 'leaderboard_hidden'
  ) then
    raise exception 'MAZER_LB_MODE_PREIMAGE_HIDE_QA_NOT_APPLIED';
  end if;

  select p.prosrc into v_page
  from pg_catalog.pg_proc p
  where p.oid = 'mazer.mazer_leaderboard_page(integer, integer)'::regprocedure;
  select p.prosrc into v_self
  from pg_catalog.pg_proc p
  where p.oid = 'mazer.mazer_leaderboard_self_rank()'::regprocedure;

  if pg_catalog.md5(v_page) <> '15a7b4655d7cb4cfe8778eb3379220bc'
    and v_page not like '%s.mode = ''endless''%'
  then
    raise exception 'MAZER_LB_MODE_PREIMAGE_DRIFT_PAGE';
  end if;
  if pg_catalog.md5(v_self) <> '1289597dc20bcebf6594ce19c21acd5b'
    and v_self not like '%s.mode = ''endless''%'
  then
    raise exception 'MAZER_LB_MODE_PREIMAGE_DRIFT_SELF_RANK';
  end if;
end;
$preflight$;

alter table mazer.mazer_progression_states
  add column if not exists mode text not null default 'endless';

alter table mazer.mazer_progression_states
  drop constraint if exists mazer_progression_states_mode_check;
alter table mazer.mazer_progression_states
  add constraint mazer_progression_states_mode_check
    check (mode ~ '^[a-z][a-z0-9_]{0,31}$');

comment on column mazer.mazer_progression_states.mode is
  'Game mode this score belongs to (docs/architecture/MAZER-GAME-MODES-PRODUCT-CONTRACT.md). Every existing row is endless. Written only by the SECURITY DEFINER completion functions (default endless); client roles have no write grant on this table.';

-- Plain (non-concurrent) build: it holds a SHARE lock on the table for the build, which blocks
-- progression writes for its duration. Row count is a preimage question; the table has one row per account.
create index if not exists mazer_progression_states_mode_level_idx
  on mazer.mazer_progression_states (mode, player_level desc, level_reached_at asc nulls last, user_id);

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
      and s.mode = 'endless'
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
  -- (only rows with a username that are not leaderboard_hidden, in the endless
  -- mode) -- an earlier version of this query ranked over every progression row
  -- via a bare left join, so a caller's number here could disagree with where
  -- they actually sit on the public page. base is the caller's own endless row;
  -- ranked only ever matches it when they are listed on the page, leaving rank
  -- null otherwise (no username, or leaderboard_hidden).
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
      and s.mode = 'endless'
  ),
  base as (
    select s.user_id, s.player_level, p.username is not null as has_username
    from mazer.mazer_progression_states s
    left join mazer.mazer_profiles p on p.user_id = s.user_id
    where s.user_id = auth.uid()
      and s.mode = 'endless'
  )
  select ranked.rank_value::text, base.player_level::text, base.has_username
  from base
  left join ranked on ranked.user_id = base.user_id;
$$;

do $postimage$
begin
  if exists (select 1 from mazer.mazer_progression_states where mode <> 'endless') then
    raise exception 'MAZER_LB_MODE_POSTIMAGE_NON_ENDLESS_ROW';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'mazer' and table_name = 'mazer_progression_states'
      and column_name = 'mode' and is_nullable = 'NO' and column_default = '''endless''::text'
  ) then
    raise exception 'MAZER_LB_MODE_POSTIMAGE_COLUMN';
  end if;
  if to_regclass('mazer.mazer_progression_states_mode_level_idx') is null then
    raise exception 'MAZER_LB_MODE_POSTIMAGE_INDEX';
  end if;
  if (select count(*) from pg_catalog.pg_proc p
      where p.oid in ('mazer.mazer_leaderboard_page(integer, integer)'::regprocedure,
                      'mazer.mazer_leaderboard_self_rank()'::regprocedure)
        and p.prosrc like '%s.mode = ''endless''%'
        and p.prosrc like '%not p.leaderboard_hidden%') <> 2 then
    raise exception 'MAZER_LB_MODE_POSTIMAGE_FUNCTION_BODY';
  end if;
end;
$postimage$;

commit;
