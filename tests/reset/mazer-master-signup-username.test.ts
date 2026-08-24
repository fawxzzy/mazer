import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260824170202_mazer_master_signup_username_claim.sql', import.meta.url),
  'utf8'
);

describe('master Mazer signup username migration', () => {
  test('routes only explicit Mazer signups and never derives a username from email', () => {
    expect(migration).toContain("if app_namespace is distinct from 'mazer' then");
    expect(migration).toContain("candidate text := user_metadata ->> 'username'");
    expect(migration).toContain("display_name text := user_metadata ->> 'display_name'");
    expect(migration).not.toMatch(/->>\s*'email'/);
    expect(migration).not.toMatch(/split_part\s*\([^)]*email/i);
  });

  test('validates and atomically claims the exact required username contract', () => {
    expect(migration).toContain('char_length(candidate) not between 2 and 15');
    expect(migration).toContain("candidate !~ '^[A-Za-z0-9._-]+$'");
    expect(migration).toContain('MAZER_SIGNUP_USERNAME_INVALID');
    expect(migration).toContain('MAZER_SIGNUP_USERNAME_TAKEN');
    expect(migration).toContain('insert into mazer.mazer_profiles (user_id, display_name, username)');
    expect(migration).toContain('after insert on auth.users');
    expect(migration).toContain('execute function mazer.mazer_claim_signup_username()');
  });

  test('uses least privilege for the shared Auth hook', () => {
    expect(migration).toContain('grant usage on schema mazer to supabase_auth_admin');
    expect(migration).toContain('grant select (username) on mazer.mazer_profiles to supabase_auth_admin');
    expect(migration).toContain('to supabase_auth_admin');
    expect(migration).toContain('revoke all on function mazer.mazer_before_user_created(jsonb)');
    expect(migration).toContain('from public, anon, authenticated, service_role');
    expect(migration).not.toMatch(/security definer[\s\S]{0,120}mazer_before_user_created/i);
  });

  test('pins empty search paths and contains no legacy schema qualifiers', () => {
    expect(migration.match(/set search_path = ''/g)?.length).toBe(2);
    expect(migration).not.toMatch(/\bpublic\.mazer_/);
    expect(migration).toContain('alter function mazer.mazer_before_user_created(jsonb) owner to postgres');
    expect(migration).toContain('alter function mazer.mazer_claim_signup_username() owner to postgres');
  });
});
