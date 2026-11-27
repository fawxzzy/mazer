-- PG17 scratch stub for the Mazer Help messages v1 proposal. Runs as the runner role (postgres) via scratch-pg.mjs
-- build --extra, so every object is owned by postgres like production. Shape from the live read-only preimage of
-- 2026-11-27 (../../preimage/c_help_v1.json + preimage/pack): schema mazer owned by the runner, usage for anon and
-- authenticated, no default ACLs in schema mazer, auth.users owned by supabase_auth_admin (harness template),
-- existing mazer tables reference auth.users with on delete cascade.
create schema if not exists mazer;
grant usage on schema mazer to anon, authenticated, service_role;

-- Reduced stand-in for mazer.mazer_profiles: only the two columns ops/read-open-help-requests.sql reads.
create table mazer.mazer_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text
);
