import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260825120000_mazer_generated_username_contract.sql', import.meta.url),
  'utf8'
);

describe('generated Mazer username contract', () => {
  test('uses a protected keyed UUID digest and never derives PII or account order', () => {
    expect(migration).toContain("from vault.decrypted_secrets");
    expect(migration).toContain("MAZER_USERNAME_HANDLE_KEY_CARDINALITY");
    expect(migration).toContain("extensions.hmac(");
    expect(migration).toContain("p_user_id::text || ':' || p_attempt::text");
    expect(migration).toContain("return 'Mazer-' || lpad(v_number::text, 6, '0')");
    expect(migration).not.toMatch(/split_part\s*\([^)]*email/i);
    expect(migration).not.toMatch(/created_at\s*\|\|/i);
    expect(migration).not.toMatch(/decrypted_secret\s+(?:as|into)\s+(?:username|candidate)/i);
  });

  test('resolves collisions deterministically and fails closed at the six-digit bound', () => {
    expect(migration.match(/for attempt in 0\.\.999999 loop/g)?.length).toBe(2);
    expect(migration).toContain('exception when unique_violation then');
    expect(migration.match(/get stacked diagnostics collision_constraint = CONSTRAINT_NAME/g)?.length).toBe(3);
    expect(migration.match(/collision_constraint is distinct from 'mazer_profiles_username_unique_idx'/g)?.length).toBe(2);
    expect(migration).toContain("if collision_constraint = 'mazer_profiles_username_unique_idx' then");
    expect(migration).not.toMatch(/end;\s*\$\$;\s*\n\s*exception\s+when unique_violation/i);
    expect(migration).toContain('MAZER_USERNAME_SPACE_EXHAUSTED');
    expect(migration).toContain('mazer_profiles_username_unique_idx');
  });

  test('preserves explicit values, backfills only unnamed rows, and binds exact origin', () => {
    expect(migration).toContain("set username_origin = 'claimed'");
    expect(migration).toContain("where username_origin is null and username is not null");
    expect(migration).toContain("where username is null or btrim(username) = ''");
    expect(migration).toContain("set username = candidate, username_origin = 'generated'");
    expect(migration).toContain("check (username_origin in ('generated', 'claimed'))");
    expect(migration).toContain('alter column username set not null');
    expect(migration).toContain('alter column username_origin set not null');
  });

  test('marks user renames claimed while preventing origin-only spoofing', () => {
    expect(migration).toContain('if new.username is distinct from old.username then');
    expect(migration).toContain("new.username_origin := 'claimed'");
    expect(migration).toContain('new.username_origin := old.username_origin');
    expect(migration).toContain('before update of username, username_origin');
  });

  test('creates future generated or explicit profiles in the Auth transaction', () => {
    expect(migration).toContain("if candidate is null then return '{}'::jsonb; end if");
    expect(migration).toContain("values (new.id, display_name, candidate, 'claimed')");
    expect(migration).toContain("values (new.id, display_name, candidate, 'generated')");
    expect(migration).toContain('create or replace function mazer.mazer_claim_signup_username()');
  });

  test('keeps key access internal and least privilege', () => {
    expect(migration).toContain('revoke all on function mazer.mazer_generated_username(uuid, integer)');
    expect(migration).toContain('from public, anon, authenticated, service_role, supabase_auth_admin');
    expect(migration).not.toMatch(/grant execute on function mazer\.mazer_generated_username/);
    expect(migration).not.toMatch(/select\s+decrypted_secret\s+from\s+vault\.decrypted_secrets\s*;/i);
  });
});
