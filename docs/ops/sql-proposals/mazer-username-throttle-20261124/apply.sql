-- MAZER-ACCT-047: server-side rename throttle for mazer.mazer_profiles.username.
-- PROPOSED, NOT APPLIED. Draft of 2026-11-24. See README.md in this folder.
--
-- Why a trigger and not a new RPC: a signed-in player can change the username two ways today,
-- through mazer.mazer_set_username(uuid,text) AND by a direct table write (authenticated holds
-- table-level INSERT/SELECT/UPDATE on mazer.mazer_profiles and the owner-update RLS policy allows
-- the own row). A throttle inside one function would leave the other path open. The one choke
-- point both paths share is the row UPDATE, so the throttle lives in a BEFORE UPDATE trigger.
-- No existing function is replaced: the live mazer_set_username body (md5 pinned below, CRLF)
-- keeps its shape and its error codes 28000 / 22023 / P0002 / 23505 untouched.
--
-- What it does (one transaction, new objects only):
--   1. mazer.mazer_username_changes (user_id, changed_at): one row per THROTTLED rename.
--      FK to mazer.mazer_profiles ON DELETE CASCADE (an account deletion removes it with the
--      profile; no new lock on auth.users). RLS on, no policy, no privilege for any client role.
--   2. mazer.mazer_throttle_username_change(): SECURITY DEFINER trigger function, search_path ''.
--   3. Trigger mazer_throttle_username_change_before_update on mazer.mazer_profiles,
--      BEFORE UPDATE OF username, WHEN the value really changes. It fires after the two existing
--      BEFORE triggers (they sort first by name) and does not modify NEW.
--
-- Rules (constants in the function body; change them with a new function version):
--   * Only end-user requests are throttled: auth.uid() must be set. The SQL runner, service_role
--     and background jobs (auth.uid() is null) are exempt and are not logged.
--   * Same name (exact string): no change, no log, no throttle (the trigger WHEN clause skips it).
--   * The first claim away from an auto-generated handle (username_origin = 'generated') is free
--     and not logged. The existing trigger then marks the row 'claimed', so it happens once.
--   * Every later change: at most 1 per rolling 24 hours and at most 3 per rolling 7 days.
--     A case-only change counts as a change.
--   * Blocked: raises SQLSTATE PT429, message MAZER_USERNAME_RATE_LIMITED, DETAIL
--     'retry_after_seconds=<n> window=day|week'. PostgREST maps a PTxyz SQLSTATE to HTTP xyz, so
--     the client sees HTTP 429 (the FawxzzyWeb account site already maps 429 to "change.rate");
--     a plain 54000 would arrive as HTTP 500. The statement rolls back, so nothing is logged
--     and the budget is not spent by a failed attempt.
--   * A rename that then fails (taken name: unique index 23505, invalid name, anything else)
--     rolls back the log row with it, so a failed attempt never burns budget.
--   * Calls for one account are serialised by a transaction advisory lock (untestable on the
--     single-connection scratch database; source-reviewed only). The unique index on
--     lower(username) stays the only collision authority.
--   * Log rows older than 30 days are pruned on the account's next throttled change.
--
-- Idempotent: re-running converges to the same state and keeps log rows.
-- Guards: pins the md5(prosrc) of the LIVE bodies read on 2026-11-24 (not the repository copies).

begin;

set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $preflight$
declare
  v_set_username text := (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = to_regprocedure('mazer.mazer_set_username(uuid, text)'));
  v_origin_fn text := (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = to_regprocedure('mazer.mazer_enforce_username_origin()'));
  v_hidden_fn text := (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = to_regprocedure('mazer.mazer_protect_leaderboard_hidden()'));
  v_triggers text;
begin
  if to_regnamespace('mazer') is null then
    raise exception 'MAZER_THROTTLE_PREIMAGE_MISSING_SCHEMA';
  end if;
  if to_regclass('mazer.mazer_profiles') is null then
    raise exception 'MAZER_THROTTLE_PREIMAGE_MISSING_PROFILES';
  end if;
  if (select count(*) from pg_catalog.pg_attribute a
      where a.attrelid = 'mazer.mazer_profiles'::regclass and a.attnum > 0 and not a.attisdropped
        and a.attname in ('user_id', 'username', 'username_origin')) <> 3 then
    raise exception 'MAZER_THROTTLE_PREIMAGE_PROFILE_COLUMNS';
  end if;
  -- The live RPC body (CRLF) must be the reviewed one: no throttle of its own, writes display_name.
  if v_set_username is distinct from '1b1fae6c5de66380e55f2f096f2de5cb' then
    raise exception 'MAZER_THROTTLE_PREIMAGE_SET_USERNAME_DRIFT: %', coalesce(v_set_username, 'missing');
  end if;
  if v_origin_fn is distinct from '15faddd63b2eb3bc413f3751203ee961' then
    raise exception 'MAZER_THROTTLE_PREIMAGE_ORIGIN_TRIGGER_DRIFT: %', coalesce(v_origin_fn, 'missing');
  end if;
  if v_hidden_fn is distinct from 'a2d34bf2c78cbcbcf0d1efc14c9a45f0' then
    raise exception 'MAZER_THROTTLE_PREIMAGE_HIDDEN_TRIGGER_DRIFT: %', coalesce(v_hidden_fn, 'missing');
  end if;
  -- Only the two known triggers (and this file's own, on a re-run) may exist on the profile table.
  select string_agg(t.tgname, ',' order by t.tgname) into v_triggers
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'mazer.mazer_profiles'::regclass and not t.tgisinternal;
  if v_triggers is distinct from 'mazer_enforce_username_origin_before_update,mazer_protect_leaderboard_hidden_before_write'
     and v_triggers is distinct from 'mazer_enforce_username_origin_before_update,mazer_protect_leaderboard_hidden_before_write,mazer_throttle_username_change_before_update' then
    raise exception 'MAZER_THROTTLE_PREIMAGE_UNEXPECTED_TRIGGERS: %', coalesce(v_triggers, 'none');
  end if;
  -- A function of this name with another signature would mean someone already built something else.
  if exists (
    select 1 from pg_catalog.pg_proc p
    where p.pronamespace = 'mazer'::regnamespace
      and p.proname = 'mazer_throttle_username_change'
      and p.oid is distinct from to_regprocedure('mazer.mazer_throttle_username_change()')
  ) then
    raise exception 'MAZER_THROTTLE_PREIMAGE_UNEXPECTED_FUNCTION';
  end if;
  -- A table of this name must have exactly the shape created below (a re-run), never another shape.
  if to_regclass('mazer.mazer_username_changes') is not null and (
    (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text, ',' order by a.attnum)
       from pg_catalog.pg_attribute a
       where a.attrelid = to_regclass('mazer.mazer_username_changes') and a.attnum > 0 and not a.attisdropped)
    is distinct from 'user_id:uuid:true,changed_at:timestamp with time zone:true'
  ) then
    raise exception 'MAZER_THROTTLE_PREIMAGE_UNEXPECTED_TABLE_SHAPE';
  end if;
  -- ...and the same primary key and the cascading FK to the profile table (a re-run only).
  if to_regclass('mazer.mazer_username_changes') is not null and (
    (select count(*) from pg_catalog.pg_constraint k
      where k.conrelid = to_regclass('mazer.mazer_username_changes')
        and ((k.contype = 'p' and k.conname = 'mazer_username_changes_pkey')
          or (k.contype = 'f' and k.conname = 'mazer_username_changes_user_fkey'
              and k.confrelid = to_regclass('mazer.mazer_profiles') and k.confdeltype = 'c'))) <> 2
  ) then
    raise exception 'MAZER_THROTTLE_PREIMAGE_UNEXPECTED_TABLE_CONSTRAINTS';
  end if;
end;
$preflight$;

create table if not exists mazer.mazer_username_changes (
  user_id uuid not null,
  changed_at timestamptz not null,
  constraint mazer_username_changes_pkey primary key (user_id, changed_at),
  constraint mazer_username_changes_user_fkey foreign key (user_id)
    references mazer.mazer_profiles (user_id) on delete cascade
);

alter table mazer.mazer_username_changes enable row level security;
revoke all on table mazer.mazer_username_changes from public, anon, authenticated, service_role;

comment on table mazer.mazer_username_changes is
  'MAZER-ACCT-047: one row per throttled username change (user_id, changed_at). Written only by mazer.mazer_throttle_username_change(); no client privilege, RLS on with no policy. Rows are removed with the profile (ON DELETE CASCADE) and pruned after 30 days.';

create or replace function mazer.mazer_throttle_username_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  c_day_limit constant integer := 1;
  c_week_limit constant integer := 3;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_day_edge timestamptz;
  v_week_edge timestamptz;
  v_retry_day integer := 0;
  v_retry_week integer := 0;
  v_retry integer;
begin
  if new.username is not distinct from old.username then
    return new;
  end if;

  -- Not an end-user request (SQL runner, service_role, background job): exempt, not logged.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- First claim away from an auto-generated handle: free, not logged.
  if old.username_origin = 'generated' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mazer_username_change:' || old.user_id::text, 0));

  -- The Nth most recent change decides the window: if it is still inside the window, the budget is spent.
  select c.changed_at into v_day_edge
  from mazer.mazer_username_changes c
  where c.user_id = old.user_id
  order by c.changed_at desc
  offset (c_day_limit - 1) limit 1;
  if v_day_edge is not null and v_day_edge > v_now - interval '24 hours' then
    v_retry_day := pg_catalog.ceil(extract(epoch from (v_day_edge + interval '24 hours' - v_now)))::integer;
  end if;

  select c.changed_at into v_week_edge
  from mazer.mazer_username_changes c
  where c.user_id = old.user_id
  order by c.changed_at desc
  offset (c_week_limit - 1) limit 1;
  if v_week_edge is not null and v_week_edge > v_now - interval '7 days' then
    v_retry_week := pg_catalog.ceil(extract(epoch from (v_week_edge + interval '7 days' - v_now)))::integer;
  end if;

  if v_retry_day > 0 or v_retry_week > 0 then
    v_retry := greatest(v_retry_day, v_retry_week);
    raise exception 'MAZER_USERNAME_RATE_LIMITED' using
      errcode = 'PT429',
      detail = pg_catalog.format('retry_after_seconds=%s window=%s', v_retry, case when v_retry_week >= v_retry_day then 'week' else 'day' end),
      hint = 'The username was changed recently. Try again later.';
  end if;

  insert into mazer.mazer_username_changes (user_id, changed_at) values (old.user_id, v_now);
  delete from mazer.mazer_username_changes c
  where c.user_id = old.user_id and c.changed_at < v_now - interval '30 days';

  return new;
end;
$fn$;

revoke all on function mazer.mazer_throttle_username_change() from public, anon, authenticated, service_role;

comment on function mazer.mazer_throttle_username_change() is
  'MAZER-ACCT-047: BEFORE UPDATE OF username throttle. End-user changes only (auth.uid() set); first claim from a generated handle is free; then 1 per 24 hours and 3 per 7 days. Blocked: SQLSTATE PT429 (HTTP 429 through PostgREST) MAZER_USERNAME_RATE_LIMITED, DETAIL retry_after_seconds=<n> window=day|week.';

drop trigger if exists mazer_throttle_username_change_before_update on mazer.mazer_profiles;
create trigger mazer_throttle_username_change_before_update
  before update of username on mazer.mazer_profiles
  for each row
  when (new.username is distinct from old.username)
  execute function mazer.mazer_throttle_username_change();

-- Postimage: abort (and roll everything back) unless the end state is exactly what was reviewed.
do $postimage$
declare
  v_trigger_def text;
begin
  if (select count(*) from pg_catalog.pg_trigger t
      where t.tgrelid = 'mazer.mazer_profiles'::regclass and not t.tgisinternal) <> 3 then
    raise exception 'MAZER_THROTTLE_POSTIMAGE_TRIGGER_COUNT';
  end if;
  select pg_catalog.pg_get_triggerdef(t.oid) into v_trigger_def
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'mazer.mazer_profiles'::regclass and t.tgname = 'mazer_throttle_username_change_before_update' and t.tgenabled = 'O';
  if v_trigger_def is null or v_trigger_def not like 'CREATE TRIGGER mazer_throttle_username_change_before_update BEFORE UPDATE OF username ON mazer.mazer_profiles FOR EACH ROW WHEN%' then
    raise exception 'MAZER_THROTTLE_POSTIMAGE_TRIGGER_SHAPE: %', coalesce(v_trigger_def, 'missing');
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'mazer.mazer_throttle_username_change()'::regprocedure
      and p.prosecdef and p.proconfig = array['search_path=""']
      and p.proacl is not null
      and not exists (select 1 from pg_catalog.aclexplode(p.proacl) x where x.grantee <> p.proowner)
  ) then
    raise exception 'MAZER_THROTTLE_POSTIMAGE_FUNCTION_SHAPE';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = 'mazer.mazer_username_changes'::regclass and c.relrowsecurity
      and (c.relacl is null or not exists (select 1 from pg_catalog.aclexplode(c.relacl) x where x.grantee <> c.relowner))
  ) then
    raise exception 'MAZER_THROTTLE_POSTIMAGE_TABLE_SHAPE';
  end if;
  if exists (select 1 from pg_catalog.pg_policy where polrelid = 'mazer.mazer_username_changes'::regclass) then
    raise exception 'MAZER_THROTTLE_POSTIMAGE_UNEXPECTED_POLICY';
  end if;
  -- The three guarded bodies are still the pinned ones (nothing here replaces them).
  if (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = 'mazer.mazer_set_username(uuid, text)'::regprocedure) <> '1b1fae6c5de66380e55f2f096f2de5cb' then
    raise exception 'MAZER_THROTTLE_POSTIMAGE_SET_USERNAME_CHANGED';
  end if;
  if (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = 'mazer.mazer_enforce_username_origin()'::regprocedure) <> '15faddd63b2eb3bc413f3751203ee961'
     or (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = 'mazer.mazer_protect_leaderboard_hidden()'::regprocedure) <> 'a2d34bf2c78cbcbcf0d1efc14c9a45f0' then
    raise exception 'MAZER_THROTTLE_POSTIMAGE_TRIGGER_BODY_CHANGED';
  end if;
  if (select t.tgfoid from pg_catalog.pg_trigger t where t.tgrelid = 'mazer.mazer_profiles'::regclass and t.tgname = 'mazer_throttle_username_change_before_update')
     is distinct from 'mazer.mazer_throttle_username_change()'::regprocedure::oid then
    raise exception 'MAZER_THROTTLE_POSTIMAGE_TRIGGER_FUNCTION';
  end if;
end;
$postimage$;

commit;
