-- Cluster-level roles for a faithful Supabase stub. Run as the scratch superuser; safe to run twice.
-- postgres is the production SQL runner: NOT a superuser, NOT a member of supabase_auth_admin.
-- supabase_auth_admin owns auth.users (and has no login here).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'postgres') then
    create role postgres login nosuperuser createrole createdb bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;
alter role postgres nosuperuser login;
