-- DEMO proposal for the harness (not a real change). Applies as the runner role postgres, in one transaction.
-- Shows the two things every real apply file needs: a hash guard that pins the LIVE body, and a trigger on auth.users.
begin;

-- 1. Hash guard: abort unless the function body is exactly the one the proposal was written against.
--    The pin is md5(prosrc) as the DATABASE stores it (preimage query 02, column md5_stored), not the md5 of the repository file.
do $guard$
declare
  v_pinned constant text := 'a499f853f85a46c16eac025827a23a17';
  v_live text;
begin
  select md5(p.prosrc) into v_live
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'example_app' and p.proname = 'example_fn';
  if v_live is distinct from v_pinned then
    raise exception 'DEMO_GUARD_ABORT live md5 % does not match the pinned %', v_live, v_pinned;
  end if;
end
$guard$;

create or replace function example_app.example_fn(p_id uuid) returns text
  language plpgsql security definer set search_path to ''
  as $f$ begin return 'v2'; end $f$;

-- 2. A trigger function owned by the runner and a trigger on auth.users (the runner holds TRIGGER on it).
create function example_app.demo_guard() returns trigger
  language plpgsql security definer set search_path to ''
  as $f$ begin return new; end $f$;
revoke all on function example_app.demo_guard() from public, anon, authenticated;

create trigger demo_guard before insert on auth.users
  for each row execute function example_app.demo_guard();

commit;
