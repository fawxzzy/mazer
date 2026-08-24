import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const readSource = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
  .replace(/\r\n/g, '\n');

describe('legacy signup username server authority', () => {
  const migrationPath = 'supabase/migrations/20260824140215_mazer_signup_username_claim.sql';
  const migrationSource = readSource(migrationPath);
  const authSource = readSource('src/legacy-runtime/legacyAuth.ts');

  test('uses the CLI-generated forward migration and preserves the prior unique index as race authority', () => {
    expect(migrationPath).toMatch(/\/\d{14}_mazer_signup_username_claim\.sql$/);
    expect(migrationSource).toContain('20260821000000_mazer_profile_username.sql remains final race authority');
    expect(migrationSource).toContain('where username is not null\n      and lower(username) = lower(candidate)');
    expect(migrationSource).toContain("message = 'MAZER_SIGNUP_USERNAME_TAKEN'");
    expect(migrationSource).not.toContain('on conflict');
  });

  test('defines a total Before User Created hook with exact validation and categorical sentinels', () => {
    const hookSource = migrationSource.slice(
      migrationSource.indexOf('create or replace function public.mazer_before_user_created(event jsonb)'),
      migrationSource.indexOf('create or replace function public.mazer_claim_signup_username()')
    );

    expect(hookSource).toContain("app_namespace is distinct from 'mazer'");
    expect(hookSource).toContain('display_name is distinct from candidate');
    expect(hookSource).toContain('char_length(candidate) not between 2 and 15');
    expect(hookSource).toContain("candidate !~ '^[A-Za-z0-9._-]+$'");
    expect(hookSource).toContain("'message', 'MAZER_SIGNUP_USERNAME_INVALID'");
    expect(hookSource).toContain("'message', 'MAZER_SIGNUP_USERNAME_TAKEN'");
    expect(hookSource).toContain("return '{}'::jsonb;");
    expect(hookSource).toContain("set search_path = ''");
    expect(hookSource).not.toContain('security definer');
    expect(hookSource).not.toContain("event -> 'user' -> 'email'");
  });

  test('grants the hook only to Supabase Auth and gives it a narrow RLS-protected username read', () => {
    expect(migrationSource).toContain('grant usage on schema public to supabase_auth_admin;');
    expect(migrationSource).toContain('grant select (username) on public.mazer_profiles to supabase_auth_admin;');
    expect(migrationSource).toContain('to supabase_auth_admin\nusing (true);');
    expect(migrationSource).toContain(
      'revoke all on function public.mazer_before_user_created(jsonb)\n  from public, anon, authenticated, service_role;'
    );
    expect(migrationSource).toContain(
      'grant execute on function public.mazer_before_user_created(jsonb)\n  to supabase_auth_admin;'
    );
    expect(migrationSource).not.toMatch(/grant execute on function public\.mazer_before_user_created\(jsonb\)[\s\S]*to (anon|authenticated|service_role)/);
  });

  test('claims the profile in the auth.users transaction without widening runtime data access', () => {
    const triggerSource = migrationSource.slice(
      migrationSource.indexOf('create or replace function public.mazer_claim_signup_username()'),
      migrationSource.indexOf('drop trigger if exists mazer_claim_signup_username_after_insert')
    );

    expect(triggerSource).toContain('security definer');
    expect(triggerSource).toContain("set search_path = ''");
    expect(triggerSource).toContain("if app_namespace is distinct from 'mazer' then\n    return new;");
    expect(triggerSource).toContain('insert into public.mazer_profiles (user_id, display_name, username)');
    expect(triggerSource).toContain('values (new.id, display_name, candidate);');
    expect(triggerSource).toContain("errcode = '22023'");
    expect(triggerSource).toContain("errcode = '23505'");
    expect(migrationSource).toContain('after insert on auth.users');
    expect(migrationSource).toContain('execute function public.mazer_claim_signup_username();');
  });

  test('prepares canonical signup metadata without retiring the authenticated rename helpers', () => {
    const metadataBuilder = authSource.slice(
      authSource.indexOf('export const buildLegacySignUpMetadata = ('),
      authSource.indexOf('export const resolveLegacySignUpInfo = (')
    );

    expect(authSource).toContain("app_namespace: 'mazer'");
    expect(authSource).toContain('display_name: candidate');
    expect(authSource).toContain('username: candidate');
    expect(authSource).toContain('options: { data: metadata }');
    expect(metadataBuilder).not.toContain('email');
    expect(authSource).toContain('export const checkLegacyUsernameAvailable = async (');
    expect(authSource).toContain('export const saveLegacyAccountUsername = async (');
  });
});
