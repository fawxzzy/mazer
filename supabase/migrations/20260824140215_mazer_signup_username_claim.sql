-- Source-only contract. Applying this migration and selecting the Postgres
-- function under Authentication > Hooks are separate provider actions.
-- The Before User Created hook is intentionally SECURITY INVOKER and receives
-- only the narrow username-column read access needed for its best-effort
-- availability check. The partial unique index from
-- 20260821000000_mazer_profile_username.sql remains final race authority.

grant usage on schema public to supabase_auth_admin;
grant select (username) on public.mazer_profiles to supabase_auth_admin;

drop policy if exists "Mazer Auth hook can inspect usernames" on public.mazer_profiles;
create policy "Mazer Auth hook can inspect usernames"
on public.mazer_profiles
for select
to supabase_auth_admin
using (true);

create or replace function public.mazer_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  user_metadata jsonb := coalesce(event -> 'user' -> 'user_metadata', '{}'::jsonb);
  app_namespace text := user_metadata ->> 'app_namespace';
  candidate text := user_metadata ->> 'username';
  display_name text := user_metadata ->> 'display_name';
begin
  if app_namespace is distinct from 'mazer'
    or candidate is null
    or display_name is distinct from candidate
    or char_length(candidate) not between 2 and 15
    or candidate !~ '^[A-Za-z0-9._-]+$'
  then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'MAZER_SIGNUP_USERNAME_INVALID'
      )
    );
  end if;

  if exists (
    select 1
    from public.mazer_profiles
    where username is not null
      and lower(username) = lower(candidate)
  ) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 409,
        'message', 'MAZER_SIGNUP_USERNAME_TAKEN'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

comment on function public.mazer_before_user_created(jsonb) is
  'Before User Created hook for Mazer signups. Validates the app marker and canonical username metadata and performs a best-effort case-insensitive availability check. The unique profile index remains final race authority.';

revoke all on function public.mazer_before_user_created(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mazer_before_user_created(jsonb)
  to supabase_auth_admin;

-- auth.users triggers execute as Supabase Auth's database role. This narrowly
-- scoped SECURITY DEFINER function is required to create the RLS-protected
-- public profile in the same transaction as the Auth user. Every identifier is
-- schema-qualified and search_path is empty.
create or replace function public.mazer_claim_signup_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  app_namespace text := user_metadata ->> 'app_namespace';
  candidate text := user_metadata ->> 'username';
  display_name text := user_metadata ->> 'display_name';
begin
  -- The migration may be installed before the hook is activated. Ignore users
  -- explicitly owned by another app, but never admit an invalid Mazer profile.
  if app_namespace is distinct from 'mazer' then
    return new;
  end if;

  if candidate is null
    or display_name is distinct from candidate
    or char_length(candidate) not between 2 and 15
    or candidate !~ '^[A-Za-z0-9._-]+$'
  then
    raise exception using
      errcode = '22023',
      message = 'MAZER_SIGNUP_USERNAME_INVALID';
  end if;

  insert into public.mazer_profiles (user_id, display_name, username)
  values (new.id, display_name, candidate);

  return new;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'MAZER_SIGNUP_USERNAME_TAKEN';
end;
$$;

comment on function public.mazer_claim_signup_username() is
  'Creates the Mazer profile and claims its canonical username atomically after auth.users insertion. Non-Mazer users are ignored; malformed Mazer metadata fails the Auth transaction.';

revoke all on function public.mazer_claim_signup_username()
  from public, anon, authenticated, service_role;
grant execute on function public.mazer_claim_signup_username()
  to supabase_auth_admin;

drop trigger if exists mazer_claim_signup_username_after_insert on auth.users;
create trigger mazer_claim_signup_username_after_insert
after insert on auth.users
for each row
execute function public.mazer_claim_signup_username();
