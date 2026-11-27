-- In-app Help messages v1: a player sends a reply email and a message from the Help tab ("Contact us",
-- form C "Email first"). Guests AND signed-in players. Saved server-side for the owner to read and answer.
-- PROPOSED, NOT APPLIED. Draft of 2026-11-26. See README.md in this folder.
--
-- Shape (one transaction, new objects only, nothing existing is altered):
--   1. mazer.mazer_help_requests: one row per message. contact_email (required, trimmed, 3..254 characters,
--      one @, no spaces), message (required, trimmed, 1..2000 characters, plain text), status open/closed
--      with closed_at, user_id (NULL for a guest; for a signed-in player it comes from auth.uid() and the row
--      is deleted with the account by ON DELETE CASCADE), best-effort context (build id, level, game mode).
--      No IP, no user agent, no device id.
--      A separate table, not mazer_feedback: ratings are anonymous-ish product signals with no contact data,
--      kept indefinitely and safe to aggregate; help messages carry an email address (PII), have a workflow
--      (open/closed), a shorter retention and a smaller set of viewers, and must accept guests.
--   2. Client roles (anon, authenticated) get NO table privileges and the table has RLS enabled with NO
--      policy, so a direct insert, select, update or delete is denied twice over. Messages are write-only
--      for clients; nobody can read anyone's message (not even their own) through the API.
--   3. The only write path is mazer.mazer_submit_help_request_v1(): SECURITY DEFINER, search_path '',
--      lock_timeout 3s. The user id comes from auth.uid() only (never a parameter). Email and message are
--      validated with stable error codes; context fields are sanitised to NULL, never rejected. Over a rate
--      limit it answers {"status":"rate_limited","retry_after_seconds":n} and stores nothing.
--
-- EMAIL IS PII. It is stored as typed (trimmed only, case kept so the reply goes to exactly what was
-- typed), compared case-insensitively only for the per-address rate limit, and NEVER echoed: no error
-- message, notice or return value contains it. The function validates every value BEFORE the insert with
-- the same rules as the table CHECKs, so a CHECK violation (whose DETAIL would echo the whole row to the
-- caller and the server log) cannot be reached through the function.
--
-- MESSAGE TEXT IS UNTRUSTED PLAIN TEXT (from guests too). Any viewer must escape it: HTML-escape for a page,
-- and neutralise a leading = + - @ (formula injection) in a spreadsheet export. Nothing here renders it.
--
-- Rate limits (constants in the function body; change them only with a new function version). IP-free:
--   per signed-in user : 3 per rolling hour, 10 per rolling 24 hours.
--   per email address  : 3 per rolling hour, 10 per rolling 24 hours (lower-cased; guests and signed-in).
--   all guests together: 30 per rolling hour (rows with user_id NULL).
--   global             : 90 per rolling hour, everyone together.
--   The guest pool is smaller than the global cap, so a flood of guest messages can never take more than
--   30 of the 90 hourly slots: signed-in players always keep at least 60 per hour. When several limits are
--   used up the answer is the LONGEST wait, so one retry is enough. A first count runs without any lock and
--   answers rate_limited at once when a limit is already used up (a flood does not queue on the lock); a
--   call that passes it takes one transaction advisory lock and counts again, and only that second count
--   decides, so two concurrent calls cannot both pass.
--   Known trade-off (README): 30 anonymous calls with invented addresses fill the guest pool for an hour.
--
-- Locks: the foreign key to auth.users takes SHARE ROW EXCLUSIVE on auth.users, which conflicts with the
-- ROW EXCLUSIVE lock every writer of auth.users holds (sign-up, sign-in bookkeeping) and waits behind
-- autovacuum. lock_timeout 3s makes a blocked apply fail fast and change nothing.
--
-- Deliberately NOT here: any client read path, any admin view or page, retention automation, any change
-- to existing objects. The owner reads rows with the SQL runner (README: ops/read-open-help-requests.sql).

begin;

-- Fail fast instead of queueing behind (or in front of) other sessions' locks on auth.users.
set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $preflight$
begin
  if to_regnamespace('mazer') is null then
    raise exception 'MAZER_HELP_PREIMAGE_MISSING_SCHEMA';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'MAZER_HELP_PREIMAGE_MISSING_AUTH_USERS';
  end if;
  -- A function of this name with any signature would mean someone already built this.
  if exists (
    select 1
    from pg_catalog.pg_proc p
    where p.pronamespace = 'mazer'::regnamespace
      and p.proname = 'mazer_submit_help_request_v1'
  ) then
    raise exception 'MAZER_HELP_PREIMAGE_FUNCTION_EXISTS';
  end if;
  -- New objects only: never adopt a table of this name (any shape), never re-run over a live install.
  if to_regclass('mazer.mazer_help_requests') is not null then
    raise exception 'MAZER_HELP_PREIMAGE_TABLE_EXISTS';
  end if;
end;
$preflight$;

create table mazer.mazer_help_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  contact_email text not null,
  message text not null,
  status text not null default 'open',
  closed_at timestamptz,
  build_id text,
  player_level integer,
  game_mode text,
  created_at timestamptz not null default now(),
  constraint mazer_help_requests_email_check check (
    char_length(contact_email) between 3 and 254
    and contact_email ~ '^[^[:space:][:cntrl:]@]+@[^[:space:][:cntrl:]@]+\.[^[:space:][:cntrl:]@]+$'
  ),
  constraint mazer_help_requests_message_check check (
    char_length(message) between 1 and 2000 and message = btrim(message, E' \t\r\n')
  ),
  constraint mazer_help_requests_status_check check (status in ('open', 'closed')),
  constraint mazer_help_requests_closed_at_check check ((status = 'closed') = (closed_at is not null)),
  constraint mazer_help_requests_build_id_check check (
    build_id is null or build_id ~ '^[A-Za-z0-9._+-]{1,64}$'
  ),
  constraint mazer_help_requests_player_level_check check (
    player_level is null or player_level between 0 and 1000000
  ),
  constraint mazer_help_requests_game_mode_check check (
    game_mode is null or game_mode ~ '^[a-z][a-z0-9_]{0,31}$'
  )
);

comment on table mazer.mazer_help_requests is
  'In-app Help messages (reply email + message), guests and signed-in players. Write-only for clients through mazer_submit_help_request_v1; no table privilege and no RLS policy for anon/authenticated. contact_email is PII: never log or echo it. user_id is NULL for guests; signed-in rows are deleted with the account (on delete cascade). message is UNTRUSTED plain text: any viewer or export must escape it (HTML, and spreadsheet formula characters).';

-- (user_id, created_at) serves the per-user budget and the cascade from auth.users (guests are NULL and
-- never looked up by user); (lower(email), created_at) serves the per-address budget; (created_at) serves
-- the guest and global budgets and the owner's newest-first read.
create index mazer_help_requests_user_created_idx
  on mazer.mazer_help_requests (user_id, created_at desc) where user_id is not null;
create index mazer_help_requests_email_created_idx
  on mazer.mazer_help_requests (lower(contact_email), created_at desc);
create index mazer_help_requests_created_idx
  on mazer.mazer_help_requests (created_at desc);

-- RLS is enabled but deliberately NOT forced: the SECURITY DEFINER function runs as the table owner,
-- which must be able to insert; clients have no policy and no privilege.
alter table mazer.mazer_help_requests enable row level security;

revoke all on table mazer.mazer_help_requests from public;
revoke all on table mazer.mazer_help_requests from anon, authenticated;
-- service_role (a future owner-only page): read, delete, and change only the status columns.
grant select, delete on table mazer.mazer_help_requests to service_role;
grant update (status, closed_at) on table mazer.mazer_help_requests to service_role;

create function mazer.mazer_submit_help_request_v1(
  p_email text,
  p_message text,
  p_build_id text default null,
  p_player_level integer default null,
  p_game_mode text default null
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
  v_email text;
  v_email_key text;
  v_message text;
  v_build text;
  v_level integer;
  v_mode text;
  -- Limits (change only with a new function version).
  c_user_hour_limit constant integer := 3;
  c_user_day_limit constant integer := 10;
  c_email_hour_limit constant integer := 3;
  c_email_day_limit constant integer := 10;
  c_guest_hour_limit constant integer := 30;
  c_global_hour_limit constant integer := 90;
  v_user_hour_count integer;
  v_user_hour_oldest timestamptz;
  v_user_day_count integer;
  v_user_day_oldest timestamptz;
  v_email_hour_count integer;
  v_email_hour_oldest timestamptz;
  v_email_day_count integer;
  v_email_day_oldest timestamptz;
  v_guest_hour_count integer;
  v_guest_hour_oldest timestamptz;
  v_global_hour_count integer;
  v_global_hour_oldest timestamptz;
  v_limited boolean;
  v_retry integer;
begin
  -- Email: required, trimmed, same rules as the table CHECK. The value is never echoed.
  v_email := pg_catalog.btrim(p_email, E' \t\r\n');
  if v_email is null
     or pg_catalog.char_length(v_email) < 3
     or pg_catalog.char_length(v_email) > 254 then
    raise exception 'MAZER_HELP_BAD_EMAIL' using errcode = '22023';
  end if;
  if v_email !~ '^[^[:space:][:cntrl:]@]+@[^[:space:][:cntrl:]@]+\.[^[:space:][:cntrl:]@]+$' then
    raise exception 'MAZER_HELP_BAD_EMAIL' using errcode = '22023';
  end if;
  v_email_key := pg_catalog.lower(v_email);

  -- Message: required, trimmed, 1..2000 characters (characters, not bytes).
  v_message := nullif(pg_catalog.btrim(p_message, E' \t\r\n'), '');
  if v_message is null then
    raise exception 'MAZER_HELP_MESSAGE_EMPTY' using errcode = '22023';
  end if;
  if pg_catalog.char_length(v_message) > 2000 then
    raise exception 'MAZER_HELP_MESSAGE_TOO_LONG' using errcode = '22001';
  end if;

  -- Context is best effort: an unusable value becomes NULL, it never loses the message.
  v_build := case when p_build_id ~ '^[A-Za-z0-9._+-]{1,64}$' then p_build_id else null end;
  v_level := case when p_player_level between 0 and 1000000 then p_player_level else null end;
  v_mode := case when p_game_mode ~ '^[a-z][a-z0-9_]{0,31}$' then p_game_mode else null end;

  -- Pass 1 counts without a lock: when a limit is already used up it answers at once, so a flood is
  -- refused without queueing on the lock. Pass 2 takes one transaction advisory lock for every submission
  -- and counts again (a new snapshot, so it sees every message committed before the lock was granted);
  -- only pass 2 decides, so the counts that let a message in are exact.
  for v_pass in 1..2 loop
    if v_pass = 2 then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mazer_help_requests', 0));
    end if;
    v_limited := false;
    v_retry := 0;

    select
      count(*) filter (where v_uid is not null and h.user_id = v_uid and h.created_at > pg_catalog.now() - interval '1 hour'),
      min(h.created_at) filter (where v_uid is not null and h.user_id = v_uid and h.created_at > pg_catalog.now() - interval '1 hour'),
      count(*) filter (where v_uid is not null and h.user_id = v_uid),
      min(h.created_at) filter (where v_uid is not null and h.user_id = v_uid),
      count(*) filter (where pg_catalog.lower(h.contact_email) = v_email_key and h.created_at > pg_catalog.now() - interval '1 hour'),
      min(h.created_at) filter (where pg_catalog.lower(h.contact_email) = v_email_key and h.created_at > pg_catalog.now() - interval '1 hour'),
      count(*) filter (where pg_catalog.lower(h.contact_email) = v_email_key),
      min(h.created_at) filter (where pg_catalog.lower(h.contact_email) = v_email_key),
      count(*) filter (where h.user_id is null and h.created_at > pg_catalog.now() - interval '1 hour'),
      min(h.created_at) filter (where h.user_id is null and h.created_at > pg_catalog.now() - interval '1 hour'),
      count(*) filter (where h.created_at > pg_catalog.now() - interval '1 hour'),
      min(h.created_at) filter (where h.created_at > pg_catalog.now() - interval '1 hour')
      into v_user_hour_count, v_user_hour_oldest, v_user_day_count, v_user_day_oldest,
           v_email_hour_count, v_email_hour_oldest, v_email_day_count, v_email_day_oldest,
           v_guest_hour_count, v_guest_hour_oldest, v_global_hour_count, v_global_hour_oldest
    from mazer.mazer_help_requests h
    where h.created_at > pg_catalog.now() - interval '24 hours';

    -- Over any limit: answer with the LONGEST wait among the limits that are used up.
    if v_uid is not null and v_user_hour_count >= c_user_hour_limit then
      v_limited := true;
      v_retry := greatest(v_retry,
        ceil(extract(epoch from (v_user_hour_oldest + interval '1 hour' - pg_catalog.now())))::integer);
    end if;
    if v_uid is not null and v_user_day_count >= c_user_day_limit then
      v_limited := true;
      v_retry := greatest(v_retry,
        ceil(extract(epoch from (v_user_day_oldest + interval '24 hours' - pg_catalog.now())))::integer);
    end if;
    if v_email_hour_count >= c_email_hour_limit then
      v_limited := true;
      v_retry := greatest(v_retry,
        ceil(extract(epoch from (v_email_hour_oldest + interval '1 hour' - pg_catalog.now())))::integer);
    end if;
    if v_email_day_count >= c_email_day_limit then
      v_limited := true;
      v_retry := greatest(v_retry,
        ceil(extract(epoch from (v_email_day_oldest + interval '24 hours' - pg_catalog.now())))::integer);
    end if;
    if v_uid is null and v_guest_hour_count >= c_guest_hour_limit then
      v_limited := true;
      v_retry := greatest(v_retry,
        ceil(extract(epoch from (v_guest_hour_oldest + interval '1 hour' - pg_catalog.now())))::integer);
    end if;
    if v_global_hour_count >= c_global_hour_limit then
      v_limited := true;
      v_retry := greatest(v_retry,
        ceil(extract(epoch from (v_global_hour_oldest + interval '1 hour' - pg_catalog.now())))::integer);
    end if;
    if v_limited then
      return pg_catalog.jsonb_build_object('status', 'rate_limited', 'retry_after_seconds', greatest(1, v_retry));
    end if;
  end loop;

  insert into mazer.mazer_help_requests (user_id, contact_email, message, build_id, player_level, game_mode)
  values (v_uid, v_email, v_message, v_build, v_level, v_mode);

  return pg_catalog.jsonb_build_object('status', 'saved');
end;
$$;

revoke all on function mazer.mazer_submit_help_request_v1(text, text, text, integer, text) from public, anon, authenticated;
grant execute on function mazer.mazer_submit_help_request_v1(text, text, text, integer, text) to anon, authenticated;

comment on function mazer.mazer_submit_help_request_v1(text, text, text, integer, text) is
  'Saves one Help message (reply email + message) for a guest or the signed-in caller (user id from auth.uid() only). Errors: MAZER_HELP_BAD_EMAIL (22023), MAZER_HELP_MESSAGE_EMPTY (22023), MAZER_HELP_MESSAGE_TOO_LONG (22001). Returns {"status":"saved"} or {"status":"rate_limited","retry_after_seconds":n}. Limits: 3/hour and 10/24h per user and per email, 30/hour for all guests, 90/hour for everyone.';

-- Post-image assertions: abort the whole transaction if the result is not what the proposal says.
do $postimage$
begin
  if has_table_privilege('anon', 'mazer.mazer_help_requests', 'select,insert,update,delete,truncate,references,trigger')
    or has_table_privilege('authenticated', 'mazer.mazer_help_requests', 'select,insert,update,delete,truncate,references,trigger')
    or has_any_column_privilege('anon', 'mazer.mazer_help_requests', 'select,insert,update,references')
    or has_any_column_privilege('authenticated', 'mazer.mazer_help_requests', 'select,insert,update,references')
  then
    raise exception 'MAZER_HELP_POSTIMAGE_CLIENT_TABLE_PRIVILEGE';
  end if;
  -- service_role: select + delete, and UPDATE on the two status columns only; never insert.
  if not has_table_privilege('service_role', 'mazer.mazer_help_requests', 'select')
    or not has_table_privilege('service_role', 'mazer.mazer_help_requests', 'delete')
    or has_table_privilege('service_role', 'mazer.mazer_help_requests', 'insert,update,truncate,references,trigger')
    or has_any_column_privilege('service_role', 'mazer.mazer_help_requests', 'insert')
    or not has_column_privilege('service_role', 'mazer.mazer_help_requests', 'status', 'update')
    or not has_column_privilege('service_role', 'mazer.mazer_help_requests', 'closed_at', 'update')
    or has_column_privilege('service_role', 'mazer.mazer_help_requests', 'message', 'update')
    or has_column_privilege('service_role', 'mazer.mazer_help_requests', 'contact_email', 'update')
    or has_column_privilege('service_role', 'mazer.mazer_help_requests', 'user_id', 'update')
  then
    raise exception 'MAZER_HELP_POSTIMAGE_SERVICE_ROLE_PRIVILEGE';
  end if;
  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'mazer.mazer_help_requests'::regclass) then
    raise exception 'MAZER_HELP_POSTIMAGE_RLS_OFF';
  end if;
  if exists (select 1 from pg_catalog.pg_policy where polrelid = 'mazer.mazer_help_requests'::regclass) then
    raise exception 'MAZER_HELP_POSTIMAGE_UNEXPECTED_POLICY';
  end if;
  -- Guests and signed-in players: anon and authenticated may execute; public may not.
  if has_function_privilege('public', 'mazer.mazer_submit_help_request_v1(text, text, text, integer, text)', 'execute')
    or not has_function_privilege('anon', 'mazer.mazer_submit_help_request_v1(text, text, text, integer, text)', 'execute')
    or not has_function_privilege('authenticated', 'mazer.mazer_submit_help_request_v1(text, text, text, integer, text)', 'execute')
  then
    raise exception 'MAZER_HELP_POSTIMAGE_FUNCTION_ACL';
  end if;
  -- DEFINER, pinned search_path, lock_timeout, and the same owner as the table (so the insert works).
  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = 'mazer.mazer_submit_help_request_v1(text, text, text, integer, text)'::regprocedure
      and p.prosecdef
      and p.proconfig @> array['search_path=""', 'lock_timeout=3s']
      and p.proowner = (select c.relowner from pg_catalog.pg_class c where c.oid = 'mazer.mazer_help_requests'::regclass)
  ) then
    raise exception 'MAZER_HELP_POSTIMAGE_FUNCTION_SHAPE';
  end if;
  -- The one foreign key: user_id -> auth.users(id), ON DELETE CASCADE, and the column is NULLABLE (guests).
  if not exists (
    select 1
    from pg_catalog.pg_constraint k
    join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.conrelid = 'mazer.mazer_help_requests'::regclass
      and k.contype = 'f'
      and k.confrelid = 'auth.users'::regclass
      and k.confdeltype = 'c'
      and array_length(k.conkey, 1) = 1
      and a.attname = 'user_id'
      and not a.attnotnull
  ) or (
    select count(*) from pg_catalog.pg_constraint k
    where k.conrelid = 'mazer.mazer_help_requests'::regclass and k.contype = 'f'
  ) <> 1 then
    raise exception 'MAZER_HELP_POSTIMAGE_FOREIGN_KEY';
  end if;
end;
$postimage$;

commit;
