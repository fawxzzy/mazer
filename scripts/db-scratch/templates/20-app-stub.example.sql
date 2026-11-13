-- TEMPLATE for the application part of a stub. Copy it next to your proposal, edit, and pass it to
--   node scripts/db-scratch/scratch-pg.mjs build --dir <scratch dir> --extra my-app-stub.sql
-- It runs as the production runner role (postgres), so every object it creates is OWNED BY postgres, like production.
--
-- Rules for a faithful stub (the point of the exercise):
--  1. Tables: take columns, defaults and constraints from preimage queries 04 and 05 run against the LIVE database, not from the
--     repository migrations. Production drifts from the repository.
--  2. Functions the proposal does not change: install the LIVE body, not the repository copy. Query 02 returns it.
--     If the live body has CRLF line endings, a plain `psql -f` on Windows strips the CRs; rebuild them at run time as in
--     templates/30-live-body-crlf.example.sql, or the md5 guard will pass in scratch and abort in production.
--  3. Grants and policies: copy from query 06 output.
--  4. Triggers on auth.users: copy from query 03 output.
--  5. Record in the stub header the capture date and the sha256 of the live capture the stub was built from.
--
-- Example shape (replace with the real thing):
create schema if not exists example_app;

create table example_app.profiles (
  user_id uuid primary key,
  username text not null,
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower_idx on example_app.profiles (lower(username));

grant usage on schema example_app to authenticated, service_role;
grant select on example_app.profiles to authenticated;

-- A function the demo proposal replaces. Its body is a single line so the demo can pin its md5.
create function example_app.example_fn(p_id uuid) returns text
  language plpgsql security definer set search_path to ''
  as $f$ begin return 'v1'; end $f$;
revoke all on function example_app.example_fn(uuid) from public, anon;
grant execute on function example_app.example_fn(uuid) to authenticated;
