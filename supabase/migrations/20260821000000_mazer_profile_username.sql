alter table public.mazer_profiles
  add column if not exists username text
    check (username is null or (char_length(username) between 2 and 15 and username ~ '^[a-zA-Z0-9._-]+$'));

comment on column public.mazer_profiles.username is
  'Player-chosen unique display handle. Optional -- null until the player sets one. Case-insensitively unique via mazer_profiles_username_unique_idx, the actual source of truth for the uniqueness guarantee (not the availability-check RPC below, which is a best-effort UX nicety only).';

-- Case-insensitive uniqueness, enforced atomically at the database level so
-- two clients racing to claim the same name can never both succeed --
-- unlike a check-then-write pattern in application code.
create unique index if not exists mazer_profiles_username_unique_idx
  on public.mazer_profiles (lower(username))
  where username is not null;

-- RLS on mazer_profiles restricts reads to a user's own row (see
-- 20260709011209_mazer_account_storage_contracts.sql), so there is no way
-- for a client to check whether another user already holds a given
-- username. This function runs as its definer (bypassing RLS internally)
-- but only ever returns a boolean, never another user's actual profile
-- data -- safe to expose to any authenticated caller. It is a UX
-- convenience for instant "taken/available" feedback while typing; the
-- unique index above is what actually prevents a collision at save time.
create or replace function public.mazer_is_username_available(candidate text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.mazer_profiles
    where lower(username) = lower(candidate)
  );
$$;

revoke all on function public.mazer_is_username_available(text) from public;
grant execute on function public.mazer_is_username_available(text) to authenticated;
