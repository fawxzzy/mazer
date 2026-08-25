-- Stable, non-PII Mazer usernames for the authoritative shared project.
-- The keyed digest is evaluated only inside SECURITY DEFINER database code;
-- neither the key nor a user's UUID is exposed by the generated handle.

do $preflight$
begin
  if to_regnamespace('mazer') is null
    or to_regclass('mazer.mazer_profiles') is null
    or to_regclass('mazer.mazer_profiles_username_unique_idx') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'mazer' and table_name = 'mazer_profiles' and column_name = 'username'
    )
  then
    raise exception 'MAZER_USERNAME_CONTRACT_PREIMAGE_MISSING';
  end if;

  if to_regprocedure('extensions.hmac(bytea,bytea,text)') is null
    or to_regclass('vault.secrets') is null
    or to_regclass('vault.decrypted_secrets') is null
  then
    raise exception 'MAZER_USERNAME_SECRET_CAPABILITY_MISSING';
  end if;
end;
$preflight$;

do $key$
begin
  if (select count(*) from vault.secrets where name = 'mazer_username_handle_key') <> 1 then
    raise exception 'MAZER_USERNAME_HANDLE_KEY_CARDINALITY';
  end if;
end;
$key$;

alter table mazer.mazer_profiles
  add column if not exists username_origin text;

alter table mazer.mazer_profiles
  drop constraint if exists mazer_profiles_username_origin_check;
alter table mazer.mazer_profiles
  add constraint mazer_profiles_username_origin_check
    check (username_origin in ('generated', 'claimed')) not valid;

create or replace function mazer.mazer_generated_username(p_user_id uuid, p_attempt integer)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_digest bytea;
  v_number bigint;
begin
  if p_user_id is null or p_attempt not between 0 and 999999 then
    raise exception using errcode = '22023', message = 'MAZER_USERNAME_GENERATION_INPUT_INVALID';
  end if;

  select decrypted_secret into strict v_key
  from vault.decrypted_secrets
  where name = 'mazer_username_handle_key';

  v_digest := extensions.hmac(
    convert_to(p_user_id::text || ':' || p_attempt::text, 'UTF8'),
    convert_to(v_key, 'UTF8'),
    'sha256'
  );
  v_number := ('x' || substr(encode(v_digest, 'hex'), 1, 15))::bit(60)::bigint % 1000000;
  return 'Mazer-' || lpad(v_number::text, 6, '0');
end;
$$;

comment on function mazer.mazer_generated_username(uuid, integer) is
  'Internal deterministic candidate generator. HMAC(UUID, attempt) uses the protected Vault key and emits only Mazer-######.';

alter function mazer.mazer_generated_username(uuid, integer) owner to postgres;
revoke all on function mazer.mazer_generated_username(uuid, integer)
  from public, anon, authenticated, service_role, supabase_auth_admin;

-- Preserve every explicit username byte-for-byte. Only rows with no username
-- enter the deterministic UUID-ordered collision-resolution pass.
update mazer.mazer_profiles
set username_origin = 'claimed'
where username_origin is null and username is not null and btrim(username) <> '';

do $backfill$
declare
  profile record;
  attempt integer;
  candidate text;
  assigned boolean;
  collision_constraint text;
begin
  for profile in
    select user_id from mazer.mazer_profiles
    where username is null or btrim(username) = ''
    order by user_id
  loop
    assigned := false;
    for attempt in 0..999999 loop
      candidate := mazer.mazer_generated_username(profile.user_id, attempt);
      begin
        update mazer.mazer_profiles
        set username = candidate, username_origin = 'generated'
        where user_id = profile.user_id;
        assigned := true;
        exit;
      exception when unique_violation then
        get stacked diagnostics collision_constraint = CONSTRAINT_NAME;
        if collision_constraint is distinct from 'mazer_profiles_username_unique_idx' then raise; end if;
        -- Only the case-insensitive username index is a retryable collision.
      end;
    end loop;
    if not assigned then
      raise exception 'MAZER_USERNAME_SPACE_EXHAUSTED';
    end if;
  end loop;
end;
$backfill$;

alter table mazer.mazer_profiles alter column username set not null;
alter table mazer.mazer_profiles alter column username_origin set not null;
alter table mazer.mazer_profiles validate constraint mazer_profiles_username_origin_check;

comment on column mazer.mazer_profiles.username is
  'Case-insensitively unique public Mazer handle. Explicit values are preserved; unnamed accounts receive stable keyed Mazer-###### handles.';
comment on column mazer.mazer_profiles.username_origin is
  'Exact provenance: generated for a system-derived handle, claimed after any explicit claim or rename.';

create or replace function mazer.mazer_enforce_username_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.username is distinct from old.username then
    new.username_origin := 'claimed';
  else
    new.username_origin := old.username_origin;
  end if;
  return new;
end;
$$;

revoke all on function mazer.mazer_enforce_username_origin()
  from public, anon, authenticated, service_role;
drop trigger if exists mazer_enforce_username_origin_before_update on mazer.mazer_profiles;
create trigger mazer_enforce_username_origin_before_update
before update of username, username_origin on mazer.mazer_profiles
for each row execute function mazer.mazer_enforce_username_origin();

create or replace function mazer.mazer_before_user_created(event jsonb)
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
  if app_namespace is distinct from 'mazer' then return '{}'::jsonb; end if;
  if candidate is null then return '{}'::jsonb; end if;
  if display_name is distinct from candidate
    or char_length(candidate) not between 2 and 15
    or candidate !~ '^[A-Za-z0-9._-]+$'
  then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'MAZER_SIGNUP_USERNAME_INVALID'));
  end if;
  if exists (select 1 from mazer.mazer_profiles where lower(username) = lower(candidate)) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 409, 'message', 'MAZER_SIGNUP_USERNAME_TAKEN'));
  end if;
  return '{}'::jsonb;
end;
$$;

create or replace function mazer.mazer_claim_signup_username()
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
  attempt integer;
  collision_constraint text;
begin
  if app_namespace is distinct from 'mazer' then return new; end if;

  if candidate is not null then
    if display_name is distinct from candidate
      or char_length(candidate) not between 2 and 15
      or candidate !~ '^[A-Za-z0-9._-]+$'
    then
      raise exception using errcode = '22023', message = 'MAZER_SIGNUP_USERNAME_INVALID';
    end if;
    begin
      insert into mazer.mazer_profiles (user_id, display_name, username, username_origin)
      values (new.id, display_name, candidate, 'claimed');
    exception when unique_violation then
      get stacked diagnostics collision_constraint = CONSTRAINT_NAME;
      if collision_constraint = 'mazer_profiles_username_unique_idx' then
        raise exception using errcode = '23505', message = 'MAZER_SIGNUP_USERNAME_TAKEN';
      end if;
      raise;
    end;
    return new;
  end if;

  for attempt in 0..999999 loop
    candidate := mazer.mazer_generated_username(new.id, attempt);
    begin
      insert into mazer.mazer_profiles (user_id, display_name, username, username_origin)
      values (new.id, display_name, candidate, 'generated');
      return new;
    exception when unique_violation then
      get stacked diagnostics collision_constraint = CONSTRAINT_NAME;
      if collision_constraint is distinct from 'mazer_profiles_username_unique_idx' then raise; end if;
      -- Retry only the username collision; unrelated unique failures fail closed.
    end;
  end loop;
  raise exception 'MAZER_USERNAME_SPACE_EXHAUSTED';
end;
$$;

comment on function mazer.mazer_claim_signup_username() is
  'Atomically creates a Mazer profile. Explicit signup handles remain claimed; absent handles receive a protected keyed Mazer-###### value.';

alter function mazer.mazer_before_user_created(jsonb) owner to postgres;
alter function mazer.mazer_claim_signup_username() owner to postgres;
alter function mazer.mazer_enforce_username_origin() owner to postgres;
revoke all on function mazer.mazer_before_user_created(jsonb) from public, anon, authenticated, service_role;
grant execute on function mazer.mazer_before_user_created(jsonb) to supabase_auth_admin;
revoke all on function mazer.mazer_claim_signup_username() from public, anon, authenticated, service_role;
grant execute on function mazer.mazer_claim_signup_username() to supabase_auth_admin;
