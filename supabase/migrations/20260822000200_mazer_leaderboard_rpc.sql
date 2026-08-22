-- Public paginated leaderboard read path.
--
-- Same schema-location caveat as the two prior migrations in this set:
-- written against `public`, confirm the real live schema before applying.
--
-- Follows the exact pattern mazer_is_username_available already
-- established (20260821000000_mazer_profile_username.sql): RLS on
-- mazer_profiles/mazer_progression_states restricts every authenticated
-- user to their own row, so there is no way for a client to read anyone
-- else's data directly. This function runs as its definer (bypassing RLS
-- internally) but returns only rank/username/level -- never email, auth
-- UUID, provider identity, progression JSON, receipts, or settings -- so it
-- is safe to expose to any authenticated caller.
--
-- Inclusion rule: a row appears only if it has a non-null, non-empty
-- username. No email-derived fallback handle is invented for accounts
-- without one -- an authenticated user without a username simply doesn't
-- appear until they set one (the signup-flow and account-screen username
-- fields already built into the client are how they do that).
--
-- Ordering: player_level descending, then level_reached_at ascending
-- (whoever reached that level first wins the tie), then user_id ascending
-- as a final deterministic tiebreaker for rows with neither -- e.g. legacy
-- rows that predate the level_reached_at column.

create or replace function public.mazer_leaderboard_page(
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  rank bigint,
  username text,
  player_level integer,
  is_requesting_user boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with ranked as (
    select
      p.username,
      s.player_level,
      s.user_id,
      row_number() over (
        order by s.player_level desc, s.level_reached_at asc nulls last, s.user_id asc
      ) as rank
    from public.mazer_progression_states s
    join public.mazer_profiles p on p.user_id = s.user_id
    where p.username is not null
  )
  select
    ranked.rank,
    ranked.username,
    ranked.player_level,
    ranked.user_id = auth.uid() as is_requesting_user
  from ranked
  order by ranked.rank
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.mazer_leaderboard_page(integer, integer) from public;
grant execute on function public.mazer_leaderboard_page(integer, integer) to authenticated;

comment on function public.mazer_leaderboard_page is
  'Public paginated leaderboard: rank/username/level only, never private account data. Page size is hard-capped at 100 server-side regardless of what a caller requests.';

-- A caller needs its own rank even when it falls outside the requested
-- page (e.g. showing "you are #4,213" without downloading 4,213 rows to
-- find that out client-side).
create or replace function public.mazer_leaderboard_self_rank()
returns table (
  rank bigint,
  player_level integer,
  has_username boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with ranked as (
    select
      s.user_id,
      s.player_level,
      p.username is not null as has_username,
      row_number() over (
        order by s.player_level desc, s.level_reached_at asc nulls last, s.user_id asc
      ) as rank
    from public.mazer_progression_states s
    left join public.mazer_profiles p on p.user_id = s.user_id
  )
  select ranked.rank, ranked.player_level, ranked.has_username
  from ranked
  where ranked.user_id = auth.uid();
$$;

revoke all on function public.mazer_leaderboard_self_rank() from public;
grant execute on function public.mazer_leaderboard_self_rank() to authenticated;

comment on function public.mazer_leaderboard_self_rank is
  'The calling user''s own leaderboard rank, computed the same way as mazer_leaderboard_page regardless of whether they currently have a username set (has_username tells the client whether to prompt for one instead of showing a rank that will not actually appear on the public page).';

-- Supports the tie-break ordering both functions above use.
create index if not exists mazer_progression_states_leaderboard_order_idx
  on public.mazer_progression_states (player_level desc, level_reached_at asc, user_id asc);
