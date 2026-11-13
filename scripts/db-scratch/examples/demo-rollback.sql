-- DEMO rollback for demo-apply.sql. The runner (postgres) does NOT own auth.users, so
--   drop trigger demo_guard on auth.users;      -- fails: must be owner of relation users
--   alter table auth.users disable trigger ...; -- fails the same way
-- The rollback that works is to drop the trigger FUNCTION with CASCADE: the runner owns the function, and the dependent
-- trigger goes with it. Check first that the trigger is the only dependent (here it is).
begin;

drop function example_app.demo_guard() cascade;

create or replace function example_app.example_fn(p_id uuid) returns text
  language plpgsql security definer set search_path to ''
  as $f$ begin return 'v1'; end $f$;

commit;
