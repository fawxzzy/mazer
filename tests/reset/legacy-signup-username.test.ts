import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const readSource = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
  .replace(/\r\n/g, '\n');

type HookEvent = {
  user?: {
    user_metadata?: Record<string, unknown>;
  };
};

type HookOutcome =
  | { error: { http_code: 400 | 409; message: string } }
  | Record<string, never>;

const expectedHookOutcome = (
  event: HookEvent,
  claimedUsernames: readonly string[] = []
): HookOutcome => {
  const metadata = event.user?.user_metadata ?? {};
  if (metadata.app_namespace !== 'mazer') return {};

  const username = metadata.username;
  const displayName = metadata.display_name;
  if (
    typeof username !== 'string'
    || displayName !== username
    || username.length < 2
    || username.length > 15
    || !/^[A-Za-z0-9._-]+$/.test(username)
  ) {
    return {
      error: {
        http_code: 400,
        message: 'MAZER_SIGNUP_USERNAME_INVALID'
      }
    };
  }

  if (claimedUsernames.some((claimed) => claimed.toLowerCase() === username.toLowerCase())) {
    return {
      error: {
        http_code: 409,
        message: 'MAZER_SIGNUP_USERNAME_TAKEN'
      }
    };
  }

  return {};
};

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

    const routeIndex = hookSource.indexOf("if app_namespace is distinct from 'mazer' then\n    return '{}'::jsonb;\n  end if;");
    const validationIndex = hookSource.indexOf('if candidate is null');

    expect(routeIndex).toBeGreaterThan(-1);
    expect(validationIndex).toBeGreaterThan(routeIndex);
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

  test.each([
    {
      event: {},
      label: 'an absent namespace',
      outcome: {}
    },
    {
      event: { user: { user_metadata: { app_namespace: 'fitness' } } },
      label: 'a Fitness signup',
      outcome: {}
    },
    {
      event: { user: { user_metadata: { app_namespace: 'website' } } },
      label: 'a Website signup',
      outcome: {}
    },
    {
      event: {
        user: {
          user_metadata: {
            app_namespace: 'mazer',
            display_name: 'x',
            username: 'x'
          }
        }
      },
      label: 'malformed explicit Mazer metadata',
      outcome: {
        error: {
          http_code: 400,
          message: 'MAZER_SIGNUP_USERNAME_INVALID'
        }
      }
    },
    {
      event: {
        user: {
          user_metadata: {
            app_namespace: 'mazer',
            display_name: 'Maze.Player-1',
            username: 'Maze.Player-1'
          }
        }
      },
      label: 'valid explicit Mazer metadata',
      outcome: {}
    }
  ])('routes $label correctly', ({ event, outcome }) => {
    expect(expectedHookOutcome(event)).toEqual(outcome);
  });

  test('returns the exact taken sentinel only for an explicit Mazer username collision', () => {
    const event = {
      user: {
        user_metadata: {
          app_namespace: 'mazer',
          display_name: 'Maze.Player-1',
          username: 'Maze.Player-1'
        }
      }
    };

    expect(expectedHookOutcome(event, ['maze.player-1'])).toEqual({
      error: {
        http_code: 409,
        message: 'MAZER_SIGNUP_USERNAME_TAKEN'
      }
    });
  });

  test('documents app_namespace as routing metadata rather than authorization', () => {
    expect(migrationSource).toContain('app_namespace routes this shared Auth hook');
    expect(migrationSource).toContain('not an authorization claim');
    expect(migrationSource).toContain('app_namespace is a routing marker, not authorization');
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
