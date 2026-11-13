-- auth stub for a faithful Supabase scratch database. Run as the scratch superuser, inside the database to stub.
--
-- What is faithful on purpose (each one bit a real proposal on 2026-11-12):
--  * auth.users is OWNED by supabase_auth_admin and the applier role (postgres) is not a member of it, so
--    DROP TRIGGER / DISABLE TRIGGER on auth.users fail for postgres. The rollback that works is
--    DROP FUNCTION ... CASCADE on a function postgres owns.
--  * postgres may CREATE a trigger on auth.users (it holds TRIGGER) and read/write rows.
--  * auth.users.id has NO default: an insert without an id fails with a not-null violation.
-- The column list is a reduced copy of the real table. Extend it when a proposal reads another column, and confirm the
-- live shape with preimage query 04 first. The privileges below are the assumption to re-check with preimage query 90.
create schema if not exists auth authorization supabase_auth_admin;

create table auth.users (
  id uuid primary key,
  instance_id uuid,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz
);
alter table auth.users owner to supabase_auth_admin;

create function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
alter function auth.uid() owner to supabase_auth_admin;

grant usage on schema auth to postgres, anon, authenticated, service_role;
grant select, insert, update, delete, references, trigger on auth.users to postgres;
grant execute on function auth.uid() to postgres, anon, authenticated, service_role;

-- the runner needs to create objects in the databases it applies to
grant all on schema public to postgres;
