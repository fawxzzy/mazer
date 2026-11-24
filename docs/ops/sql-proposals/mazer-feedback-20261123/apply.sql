-- In-game feedback: one star rating (1-5), an optional short comment, saved server-side.
-- PROPOSED, NOT APPLIED. Draft of 2026-11-23. See README.md in this folder.
--
-- Shape (one transaction):
--   1. mazer.mazer_feedback: one row per submission. rating smallint 1..5 NOT NULL, comment
--      capped at 500 characters, user_id nullable (signed-out submissions), plus best-effort
--      context (build id, level, game mode, where the popup was opened). No email, no IP,
--      no user agent, no device id: the only identity stored is the auth user id.
--   2. Client roles (anon, authenticated) get NO table privileges and the table has RLS
--      enabled with NO policy, so a direct insert, select, update or delete is denied twice
--      over (privilege first, RLS second). Feedback is write-only for clients.
--   3. The only write path is mazer.mazer_submit_feedback_v1(): SECURITY DEFINER, the user id
--      comes from auth.uid() (never from a parameter, so nobody can file as someone else),
--      rating and comment are validated with stable error codes, context fields are
--      sanitised to NULL instead of rejected (a bad build id must never lose the feedback),
--      and a server-side rate limit answers {"status":"rate_limited","retry_after_seconds":n}.
--
-- Rate limits (constants in the function body; change them with a new function version):
--   signed in : 5 per rolling hour, 20 per rolling 24 hours, per user.
--   signed out: 30 per rolling hour for ALL signed-out callers together. There is no
--               trustworthy per-device key at this layer (no IP, no device id is stored on
--               purpose), so the signed-out cap is a global budget: an abuser can use it up,
--               which only delays other signed-out feedback; it cannot lock anyone out of the
--               game, sign-in or the leaderboard. Signed-in users have their own budget and
--               are not affected.
--   Calls are serialised per budget with a transaction advisory lock so two concurrent
--   submissions cannot both pass the count (single-connection pglite cannot demonstrate the
--   race; the lock is source-reviewed only).
--
-- Deliberately NOT here: any read path for clients, any admin view, any change to existing
-- objects. Owner reads rows with service_role / the SQL runner.

begin;

do $preflight$
begin
  if to_regnamespace('mazer') is null then
    raise exception 'MAZER_FEEDBACK_PREIMAGE_MISSING_SCHEMA';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'MAZER_FEEDBACK_PREIMAGE_MISSING_AUTH_USERS';
  end if;
  -- A function of this name with a different signature would mean someone already built this.
  if exists (
    select 1
    from pg_catalog.pg_proc p
    where p.pronamespace = 'mazer'::regnamespace
      and p.proname = 'mazer_submit_feedback_v1'
      and p.oid is distinct from to_regprocedure('mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text)')
  ) then
    raise exception 'MAZER_FEEDBACK_PREIMAGE_UNEXPECTED_FUNCTION';
  end if;
  -- New objects only: never adopt a table of this name that already exists (any shape), and never
  -- re-run over a live install (a second run aborts here and changes nothing).
  if to_regclass('mazer.mazer_feedback') is not null then
    raise exception 'MAZER_FEEDBACK_PREIMAGE_TABLE_EXISTS';
  end if;
end;
$preflight$;

create table mazer.mazer_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  rating smallint not null,
  comment text,
  build_id text,
  player_level integer,
  game_mode text,
  source text not null default 'menu',
  created_at timestamptz not null default now(),
  constraint mazer_feedback_rating_check check (rating between 1 and 5),
  constraint mazer_feedback_comment_check check (
    comment is null
    or (char_length(comment) between 1 and 500 and comment = btrim(comment, E' \t\r\n'))
  ),
  constraint mazer_feedback_build_id_check check (
    build_id is null or build_id ~ '^[A-Za-z0-9._+-]{1,64}$'
  ),
  constraint mazer_feedback_player_level_check check (
    player_level is null or player_level between 0 and 1000000
  ),
  constraint mazer_feedback_game_mode_check check (
    game_mode is null or game_mode ~ '^[a-z][a-z0-9_]{0,31}$'
  ),
  constraint mazer_feedback_source_check check (source in ('menu', 'post_level', 'pause'))
);

comment on table mazer.mazer_feedback is
  'In-game feedback (star rating 1-5, optional comment). Write-only for clients through mazer_submit_feedback_v1; no table privilege and no RLS policy for anon/authenticated. user_id is the only identity (null = signed out; set null when the account is deleted).';

create index mazer_feedback_user_created_idx
  on mazer.mazer_feedback (user_id, created_at desc)
  where user_id is not null;
create index mazer_feedback_created_idx
  on mazer.mazer_feedback (created_at desc);

-- RLS is enabled but deliberately NOT forced: the SECURITY DEFINER function runs as the table
-- owner, which must be able to insert; clients have no policy and no privilege.
alter table mazer.mazer_feedback enable row level security;

revoke all on table mazer.mazer_feedback from public;
revoke all on table mazer.mazer_feedback from anon, authenticated;
grant select, delete on table mazer.mazer_feedback to service_role;

create function mazer.mazer_submit_feedback_v1(
  p_rating integer,
  p_comment text default null,
  p_build_id text default null,
  p_player_level integer default null,
  p_game_mode text default null,
  p_source text default 'menu'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
volatile
as $$
declare
  v_uid uuid := auth.uid();
  v_comment text;
  v_build text;
  v_level integer;
  v_mode text;
  v_source text;
  v_hour_limit integer;
  v_day_limit integer;
  v_hour_count integer;
  v_day_count integer;
  v_hour_oldest timestamptz;
  v_day_oldest timestamptz;
  v_retry integer;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'MAZER_FEEDBACK_BAD_RATING' using errcode = '22023';
  end if;

  v_comment := nullif(pg_catalog.btrim(p_comment, E' \t\r\n'), '');
  if v_comment is not null and pg_catalog.char_length(v_comment) > 500 then
    raise exception 'MAZER_FEEDBACK_COMMENT_TOO_LONG' using errcode = '22001';
  end if;

  -- Context is best effort: an unusable value becomes NULL, it never loses the feedback.
  v_build := case when p_build_id ~ '^[A-Za-z0-9._+-]{1,64}$' then p_build_id else null end;
  v_level := case when p_player_level between 0 and 1000000 then p_player_level else null end;
  v_mode := case when p_game_mode ~ '^[a-z][a-z0-9_]{0,31}$' then p_game_mode else null end;
  v_source := case when p_source in ('menu', 'post_level', 'pause') then p_source else 'menu' end;

  -- One budget per signed-in user; one shared budget for every signed-out caller.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mazer_feedback:' || coalesce(v_uid::text, 'signed-out'), 0)
  );

  if v_uid is null then
    v_hour_limit := 30;
    v_day_limit := null;
    select count(*), min(f.created_at)
      into v_hour_count, v_hour_oldest
    from mazer.mazer_feedback f
    where f.user_id is null
      and f.created_at > pg_catalog.now() - interval '1 hour';
  else
    v_hour_limit := 5;
    v_day_limit := 20;
    select count(*), min(f.created_at)
      into v_hour_count, v_hour_oldest
    from mazer.mazer_feedback f
    where f.user_id = v_uid
      and f.created_at > pg_catalog.now() - interval '1 hour';
    select count(*), min(f.created_at)
      into v_day_count, v_day_oldest
    from mazer.mazer_feedback f
    where f.user_id = v_uid
      and f.created_at > pg_catalog.now() - interval '24 hours';
  end if;

  -- Over a limit: answer with the LONGER wait when both the hourly and the daily budget are used up,
  -- so one retry is enough.
  if v_hour_count >= v_hour_limit or (v_day_limit is not null and v_day_count >= v_day_limit) then
    v_retry := greatest(
      1,
      case when v_hour_count >= v_hour_limit
        then ceil(extract(epoch from (v_hour_oldest + interval '1 hour' - pg_catalog.now())))::integer else 1 end,
      case when v_day_limit is not null and v_day_count >= v_day_limit
        then ceil(extract(epoch from (v_day_oldest + interval '24 hours' - pg_catalog.now())))::integer else 1 end
    );
    return pg_catalog.jsonb_build_object('status', 'rate_limited', 'retry_after_seconds', v_retry);
  end if;

  insert into mazer.mazer_feedback (user_id, rating, comment, build_id, player_level, game_mode, source)
  values (v_uid, p_rating::smallint, v_comment, v_build, v_level, v_mode, v_source);

  return pg_catalog.jsonb_build_object('status', 'saved');
end;
$$;

revoke all on function mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text) from public;
grant execute on function mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text) to anon, authenticated;

comment on function mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text) is
  'Saves one in-game feedback row for the caller (auth.uid(), or signed out). Errors: MAZER_FEEDBACK_BAD_RATING, MAZER_FEEDBACK_COMMENT_TOO_LONG. Returns {"status":"saved"} or {"status":"rate_limited","retry_after_seconds":n}. Limits: 5/hour and 20/24h per user, 30/hour shared by all signed-out callers.';

-- Post-image assertions: abort the whole transaction if the result is not what the proposal says.
do $postimage$
begin
  if has_table_privilege('anon', 'mazer.mazer_feedback', 'select,insert,update,delete,truncate,references,trigger')
    or has_table_privilege('authenticated', 'mazer.mazer_feedback', 'select,insert,update,delete,truncate,references,trigger')
    or has_any_column_privilege('anon', 'mazer.mazer_feedback', 'select,insert,update,references')
    or has_any_column_privilege('authenticated', 'mazer.mazer_feedback', 'select,insert,update,references')
    or has_table_privilege('service_role', 'mazer.mazer_feedback', 'insert,update')
  then
    raise exception 'MAZER_FEEDBACK_POSTIMAGE_CLIENT_TABLE_PRIVILEGE';
  end if;
  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'mazer.mazer_feedback'::regclass) then
    raise exception 'MAZER_FEEDBACK_POSTIMAGE_RLS_OFF';
  end if;
  if exists (select 1 from pg_catalog.pg_policy where polrelid = 'mazer.mazer_feedback'::regclass) then
    raise exception 'MAZER_FEEDBACK_POSTIMAGE_UNEXPECTED_POLICY';
  end if;
  if has_function_privilege('public', 'mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text)', 'execute')
    or not has_function_privilege('anon', 'mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text)', 'execute')
    or not has_function_privilege('authenticated', 'mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text)', 'execute')
  then
    raise exception 'MAZER_FEEDBACK_POSTIMAGE_FUNCTION_ACL';
  end if;
end;
$postimage$;

commit;
