-- In-game feedback v2: one star rating (1-5), an optional short comment, saved server-side. SIGNED IN ONLY.
-- PROPOSED, NOT APPLIED. Draft of 2026-11-24. Supersedes ../mazer-feedback-20261123/apply.sql (v1, never applied).
-- See README.md in this folder.
--
-- What changed from v1 (round-2 review findings and the owner decisions Zac delegated on 2026-11-24):
--   * lock_timeout = 3s (and statement_timeout = 15s) for the whole transaction. The foreign key to
--     auth.users takes SHARE ROW EXCLUSIVE on auth.users, which conflicts with the row locks sign-in takes;
--     without a timeout a stuck transaction would queue every sign-in behind this DDL. Now it fails fast and
--     changes nothing.
--   * Signed-in only. A call without auth.uid() raises MAZER_FEEDBACK_NOT_SIGNED_IN (28000) before anything
--     else; EXECUTE is granted to authenticated only (anon and public are denied). There is no signed-out
--     budget any more.
--   * A global hourly cap (100 rows per rolling hour for every user together) on top of 5 per hour and 20
--     per 24 hours per user. With open email signup, each new account gets a fresh per-user budget; the
--     global cap bounds what many accounts can write in total. When it is hit, everyone's submission answers
--     rate_limited until the oldest row of the hour ages out (feedback only; sign-in and the game are not
--     touched).
--   * user_id is NOT NULL and the foreign key is ON DELETE CASCADE: deleting an account deletes its feedback
--     (comments are free text and may contain personal details; this matches the owner decision "Delete live
--     data, keep archives" and the other four mazer tables, which all cascade). FawxzzyWeb's delete function
--     (live since 2026-11-16) does not list this table, which is fine at run time: the cascade removes the
--     rows. The matching manifest entry is a separate FawxzzyWeb change (see README).
--   * One advisory lock for all submissions (volume is low), so the per-user and the global counts are exact.
--   * The post-image also asserts SECURITY DEFINER, search_path, lock_timeout, owner and the foreign key action.
--
-- Shape (one transaction):
--   1. mazer.mazer_feedback: one row per submission. rating smallint 1..5 NOT NULL, comment capped at 500
--      characters (stored as plain text, see below), user_id NOT NULL, plus best-effort context (build id,
--      level, game mode, where the popup was opened). No email, no IP, no user agent, no device id: the only
--      identity stored is the auth user id.
--   2. Client roles (anon, authenticated) get NO table privileges and the table has RLS enabled with NO
--      policy, so a direct insert, select, update or delete is denied twice over (privilege first, RLS
--      second). Feedback is write-only for clients.
--   3. The only write path is mazer.mazer_submit_feedback_v1(): SECURITY DEFINER, the user id comes from
--      auth.uid() (never from a parameter, so nobody can file as someone else), rating and comment are
--      validated with stable error codes, context fields are sanitised to NULL instead of rejected (a bad
--      build id must never lose the feedback), and the rate limits answer
--      {"status":"rate_limited","retry_after_seconds":n}.
--
-- COMMENT TEXT IS UNTRUSTED PLAIN TEXT. It is stored exactly as typed (trimmed). Any viewer (admin page, SQL
-- console export, CSV) must escape it: HTML-escape for a page, and neutralise a leading = + - @ (formula
-- injection) for a spreadsheet export. Nothing in this proposal renders it.
--
-- Rate limits (constants in the function body; change them with a new function version):
--   per user : 5 per rolling hour, 20 per rolling 24 hours.
--   global   : 100 per rolling hour, all users together.
--   The count and the insert run under one transaction advisory lock, so two concurrent submissions cannot
--   both pass the count (single-connection pglite cannot demonstrate the race; the lock is source-reviewed
--   only).
--
-- Deliberately NOT here: any read path for clients, any admin view, any change to existing objects. Owner
-- reads rows with service_role / the SQL runner.

begin;

-- Fail fast instead of queueing behind (or in front of) other sessions' locks on auth.users.
set local lock_timeout = '3s';
set local statement_timeout = '15s';

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
  user_id uuid not null references auth.users (id) on delete cascade,
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
  'In-game feedback (star rating 1-5, optional comment), signed-in users only. Write-only for clients through mazer_submit_feedback_v1; no table privilege and no RLS policy for anon/authenticated. user_id is the only identity and the row is deleted with the account (on delete cascade). comment is UNTRUSTED plain text: any viewer or export must escape it (HTML, and spreadsheet formula characters).';

-- (user_id, created_at) serves the per-user budget and the cascade from auth.users; (created_at) serves the
-- global budget.
create index mazer_feedback_user_created_idx
  on mazer.mazer_feedback (user_id, created_at desc);
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
set lock_timeout = '3s'
volatile
as $$
declare
  v_uid uuid := auth.uid();
  v_comment text;
  v_build text;
  v_level integer;
  v_mode text;
  v_source text;
  -- Limits (change only with a new function version).
  c_user_hour_limit constant integer := 5;
  c_user_day_limit constant integer := 20;
  c_global_hour_limit constant integer := 100;
  v_user_hour_count integer;
  v_user_hour_oldest timestamptz;
  v_user_day_count integer;
  v_user_day_oldest timestamptz;
  v_global_hour_count integer;
  v_global_hour_oldest timestamptz;
  v_retry integer := 0;
begin
  if v_uid is null then
    raise exception 'MAZER_FEEDBACK_NOT_SIGNED_IN' using errcode = '28000';
  end if;

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

  -- One lock for every submission: the per-user and the global count are exact, and the volume is low.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mazer_feedback', 0));

  select
    count(*) filter (where f.user_id = v_uid and f.created_at > pg_catalog.now() - interval '1 hour'),
    min(f.created_at) filter (where f.user_id = v_uid and f.created_at > pg_catalog.now() - interval '1 hour'),
    count(*) filter (where f.user_id = v_uid),
    min(f.created_at) filter (where f.user_id = v_uid),
    count(*) filter (where f.created_at > pg_catalog.now() - interval '1 hour'),
    min(f.created_at) filter (where f.created_at > pg_catalog.now() - interval '1 hour')
    into v_user_hour_count, v_user_hour_oldest, v_user_day_count, v_user_day_oldest,
         v_global_hour_count, v_global_hour_oldest
  from mazer.mazer_feedback f
  where f.created_at > pg_catalog.now() - interval '24 hours';

  -- Over any limit: answer with the LONGEST wait among the limits that are used up, so one retry is enough.
  if v_user_hour_count >= c_user_hour_limit then
    v_retry := greatest(v_retry,
      ceil(extract(epoch from (v_user_hour_oldest + interval '1 hour' - pg_catalog.now())))::integer);
  end if;
  if v_user_day_count >= c_user_day_limit then
    v_retry := greatest(v_retry,
      ceil(extract(epoch from (v_user_day_oldest + interval '24 hours' - pg_catalog.now())))::integer);
  end if;
  if v_global_hour_count >= c_global_hour_limit then
    v_retry := greatest(v_retry,
      ceil(extract(epoch from (v_global_hour_oldest + interval '1 hour' - pg_catalog.now())))::integer);
  end if;
  if v_user_hour_count >= c_user_hour_limit
     or v_user_day_count >= c_user_day_limit
     or v_global_hour_count >= c_global_hour_limit then
    return pg_catalog.jsonb_build_object('status', 'rate_limited', 'retry_after_seconds', greatest(1, v_retry));
  end if;

  insert into mazer.mazer_feedback (user_id, rating, comment, build_id, player_level, game_mode, source)
  values (v_uid, p_rating::smallint, v_comment, v_build, v_level, v_mode, v_source);

  return pg_catalog.jsonb_build_object('status', 'saved');
end;
$$;

revoke all on function mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text) from public, anon, authenticated;
grant execute on function mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text) to authenticated;

comment on function mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text) is
  'Saves one in-game feedback row for the signed-in caller (auth.uid()). Errors: MAZER_FEEDBACK_NOT_SIGNED_IN (28000), MAZER_FEEDBACK_BAD_RATING (22023), MAZER_FEEDBACK_COMMENT_TOO_LONG (22001). Returns {"status":"saved"} or {"status":"rate_limited","retry_after_seconds":n}. Limits: 5/hour and 20/24h per user, 100/hour for all users together.';

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
  -- Signed in only: public and anon can NOT execute, authenticated can.
  if has_function_privilege('public', 'mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text)', 'execute')
    or has_function_privilege('anon', 'mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text)', 'execute')
    or not has_function_privilege('authenticated', 'mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text)', 'execute')
  then
    raise exception 'MAZER_FEEDBACK_POSTIMAGE_FUNCTION_ACL';
  end if;
  -- DEFINER, pinned search_path, lock_timeout, and the same owner as the table (so the insert works).
  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = 'mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text)'::regprocedure
      and p.prosecdef
      and p.proconfig @> array['search_path=""', 'lock_timeout=3s']
      and p.proowner = (select c.relowner from pg_catalog.pg_class c where c.oid = 'mazer.mazer_feedback'::regclass)
  ) then
    raise exception 'MAZER_FEEDBACK_POSTIMAGE_FUNCTION_SHAPE';
  end if;
  -- The one foreign key: user_id -> auth.users(id), ON DELETE CASCADE, and the column is NOT NULL.
  if not exists (
    select 1
    from pg_catalog.pg_constraint k
    join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.conrelid = 'mazer.mazer_feedback'::regclass
      and k.contype = 'f'
      and k.confrelid = 'auth.users'::regclass
      and k.confdeltype = 'c'
      and array_length(k.conkey, 1) = 1
      and a.attname = 'user_id'
      and a.attnotnull
  ) or (
    select count(*) from pg_catalog.pg_constraint k
    where k.conrelid = 'mazer.mazer_feedback'::regclass and k.contype = 'f'
  ) <> 1 then
    raise exception 'MAZER_FEEDBACK_POSTIMAGE_FOREIGN_KEY';
  end if;
end;
$postimage$;

commit;
