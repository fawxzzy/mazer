-- PG17 scratch stub for the Mazer feedback v2 proposal. Runs as the runner role (postgres) via scratch-pg.mjs build --extra,
-- so every object is owned by postgres like production. Shape from the live read-only preimage of 2026-11-24
-- (../../preimage/c_feedback_v2.json): schema mazer owned by the runner, auth.users owned by supabase_auth_admin
-- (stub template), no default ACLs in schema mazer, existing mazer tables reference auth.users with on delete cascade.
create schema if not exists mazer;
grant usage on schema mazer to anon, authenticated, service_role;

-- Stand-in for the existing mazer tables that already cascade from auth.users (one is enough for the shape).
create table mazer.stub_existing (
  user_id uuid not null references auth.users (id) on delete cascade,
  note text
);
