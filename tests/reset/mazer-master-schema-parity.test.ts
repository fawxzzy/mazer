import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const migrationUrl = new URL(
  '../../supabase/migrations/20260824170156_mazer_master_schema_parity.sql',
  import.meta.url
);
const migration = readFileSync(migrationUrl, 'utf8');

describe('master Mazer schema parity migration', () => {
  test('is reproducibly generated from the reviewed legacy contracts', () => {
    execFileSync(
      process.execPath,
      ['scripts/build/compose-master-migrations.mjs', '--check'],
      { cwd: fileURLToPath(new URL('../..', import.meta.url)), stdio: 'pipe' }
    );
  });

  test('fails closed unless the authoritative custom schema and all four tables exist', () => {
    expect(migration).toContain("to_regnamespace('mazer')");
    for (const table of [
      'mazer_profiles',
      'mazer_progression_states',
      'mazer_ai_progression_states',
      'mazer_cycle_receipts'
    ]) {
      expect(migration).toContain(`to_regclass('mazer.${table}')`);
    }
    expect(migration).toContain('MAZER_MASTER_SCHEMA_MISSING');
    expect(migration).toContain('MAZER_MASTER_TABLES_INCOMPLETE');
    expect(migration).not.toMatch(/\bpublic\.mazer_/);
    expect(migration).not.toContain('set search_path = public');
  });

  test('ports unbounded ordinals, bounded difficulty, revisions, and receipt idempotency', () => {
    expect(migration).toMatch(/alter column player_level type bigint/);
    expect(migration).toMatch(/alter column player_completed_cycles type bigint/);
    expect(migration).toMatch(/alter column level type bigint/);
    expect(migration).toMatch(/alter column completed_cycles type bigint/);
    expect(migration).toContain('check (player_level >= 1)');
    expect(migration).toContain('check (level >= 1)');
    expect(migration).toContain('check (player_target_complexity between 8 and 400)');
    expect(migration).toContain('check (target_complexity between 8 and 400)');
    expect(migration).toContain('add column if not exists revision bigint not null default 0');
    expect(migration).toContain('add column if not exists level_reached_at timestamp with time zone');
    expect(migration).toContain('add column if not exists client_run_id uuid');
    expect(migration).toContain('mazer_cycle_receipts_user_client_run_id_unique_idx');
    expect(migration).toContain("ruleset_id in ('legacy-v1', 'endless-v1')");
  });

  test('adds required usernames without granting anonymous enumeration', () => {
    expect(migration).toContain('add column if not exists username text');
    expect(migration).toContain("username ~ '^[a-zA-Z0-9._-]+$'");
    expect(migration).toContain('mazer_profiles_username_unique_idx');
    expect(migration).toContain('create or replace function mazer.mazer_is_username_available(candidate text)');
    expect(migration).toContain('revoke all on function mazer.mazer_is_username_available(text) from public, anon, service_role');
    expect(migration).toContain('grant execute on function mazer.mazer_is_username_available(text) to authenticated');
    expect(migration).not.toMatch(/grant execute on function mazer\.mazer_is_username_available\(text\) to anon/);
  });

  test('preserves forced owner isolation on every Mazer table', () => {
    for (const table of [
      'mazer_profiles',
      'mazer_progression_states',
      'mazer_ai_progression_states',
      'mazer_cycle_receipts'
    ]) {
      expect(migration).toContain(`alter table mazer.${table} force row level security`);
    }
  });
});
