import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260827190000_mazer_account_username_and_progression_repair.sql', import.meta.url),
  'utf8'
).replace(/\r\n/g, '\n');
const authSource = readFileSync(
  new URL('../../src/legacy-runtime/legacyAuth.ts', import.meta.url),
  'utf8'
).replace(/\r\n/g, '\n');
const pg17Verifier = readFileSync(
  new URL('../../scripts/analysis/verify-account-username-progression-repair-pg17.ps1', import.meta.url),
  'utf8'
).replace(/\r\n/g, '\n');

describe('Mazer account username and progression repair', () => {
  test('routes username renames through one auth-bound definer without restoring direct table writes', () => {
    expect(migration).toContain('create or replace function mazer.mazer_set_username(');
    expect(migration).toContain('v_user_id uuid := (select auth.uid())');
    expect(migration).toContain('p_expected_user_id is distinct from v_user_id');
    expect(migration).toContain("v_username !~ '^[a-zA-Z0-9._-]+$'");
    expect(migration).toContain('where p.user_id = v_user_id');
    expect(migration).toContain('grant execute on function mazer.mazer_set_username(uuid, text) to authenticated');
    expect(migration).toContain('revoke all on function mazer.mazer_set_username(uuid, text) from public, anon');
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)\s+on\s+mazer\.mazer_profiles/i);

    const saveSource = authSource.slice(
      authSource.indexOf('export const saveLegacyAccountUsername = async ('),
      authSource.indexOf('\n};', authSource.indexOf('export const saveLegacyAccountUsername = async (')) + 3
    );
    expect(saveSource).toContain("client.rpc('mazer_set_username'");
    expect(saveSource).toContain('p_expected_user_id: userId');
    expect(saveSource).toContain('p_username: username');
    expect(saveSource).not.toContain(".from('mazer_profiles')");
    expect(saveSource).not.toContain('.upsert(');
  });

  test('treats every conserved play receipt as historical completion evidence', () => {
    expect(migration).toContain("r.surface = 'play'");
    expect(migration).not.toContain('r.client_run_id is not null');
    expect(migration).not.toContain('r.ruleset_id is not null');
    expect(migration).not.toContain('r.recipe_version is not null');
    expect(migration).not.toContain('r.recipe_hash is not null');
    expect(migration).toContain('Historical receipts legitimately predate');
    expect(migration).toContain('nullable idempotency metadata');
    expect(migration).toContain('where not exists (');
  });

  test('restores scalar and JSON progression to the exact runtime baseline without deleting receipts', () => {
    expect(migration).toContain('player_level = 1');
    expect(migration).toContain("player_rank = 'E'");
    expect(migration).toContain('player_target_complexity = 8');
    expect(migration).toContain('player_completed_cycles = 0');
    expect(migration).toContain("'completedCycles', '0'");
    expect(migration).toContain("'level', '1'");
    expect(migration).toContain("'struggleCycles', 9007199254740991");
    expect(migration).toContain("'{playerProgressionBaselineVersion}'");
    expect(migration).toContain("raise exception 'MAZER_ACCOUNT_REPAIR_POSTIMAGE_FAILED'");
    expect(migration).not.toMatch(/delete\s+from\s+mazer\.mazer_cycle_receipts/i);
  });

  test('proves PostgreSQL 17 apply, adversarial auth checks, receipt conservation, and exact rollback', () => {
    expect(pg17Verifier).toContain("'show data_directory'");
    expect(pg17Verifier).toContain("throw 'PG_CLUSTER_IDENTITY_MISMATCH'");
    expect(pg17Verifier.indexOf("'show data_directory'")).toBeLessThan(pg17Verifier.indexOf('Invoke-PsqlFile $migrationPath'));
    expect(pg17Verifier).toContain("'legacy-v1', null, null");
    expect(pg17Verifier).toContain("'endless-v1', 1, null");
    expect(pg17Verifier).toContain("raise exception 'PRE_IDEMPOTENCY_RECEIPT_ACCOUNT_WAS_MUTATED'");
    expect(pg17Verifier).toContain("raise exception 'ZERO_RECEIPT_BASELINE_REPAIR_FAILED'");
    expect(pg17Verifier).toContain("raise exception 'LEGACY_V1_ACCEPTED_RECEIPT_ACCOUNT_WAS_MUTATED'");
    expect(pg17Verifier).toContain("raise exception 'ENDLESS_V1_ACCEPTED_RECEIPT_ACCOUNT_WAS_MUTATED'");
    expect(pg17Verifier).toContain("raise exception 'RECEIPT_CONSERVATION_FAILED'");
    expect(pg17Verifier).toContain("raise exception 'USERNAME_OWNER_MISMATCH_WAS_ACCEPTED'");
    expect(pg17Verifier).toContain("raise exception 'USERNAME_COLLISION_WAS_ACCEPTED'");
    expect(pg17Verifier).toContain("raise exception 'INVALID_USERNAME_WAS_ACCEPTED'");
    expect(pg17Verifier).toContain("raise exception 'USERNAME_RENAME_FAILED'");
    expect(pg17Verifier).toContain("raise exception 'R020_LOCAL_POSTIMAGE_FAILED'");
    expect(pg17Verifier).toContain("raise exception 'R020_LOCAL_EXACT_ROLLBACK_FAILED'");
    expect(pg17Verifier).toContain('MAZER_R020_PROGRESSION_RESTORE_APPLY_ROLLBACK_PASS');
    expect(pg17Verifier).toContain("raise exception 'EXACT_ROLLBACK_FAILED'");
    expect(pg17Verifier).toContain('drop function mazer.mazer_set_username(uuid, text)');
    expect(pg17Verifier).toContain("raise exception 'FUNCTION_ROLLBACK_FAILED'");
    expect(pg17Verifier).toContain("Write-Output 'MAZER_ACCOUNT_USERNAME_PROGRESSION_REPAIR_PG17_PASS'");
  });
});
