import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260824170159_mazer_master_runtime_contracts.sql', import.meta.url),
  'utf8'
);

describe('master Mazer runtime contracts migration', () => {
  test('creates every runtime RPC only in the custom Mazer schema', () => {
    for (const name of [
      'mazer_initialize_progression',
      'mazer_complete_level',
      'mazer_complete_ai_level',
      'mazer_reset_progression',
      'mazer_leaderboard_page',
      'mazer_leaderboard_self_rank'
    ]) {
      expect(migration).toMatch(new RegExp(`function mazer\\.${name}\\b`));
    }
    expect(migration).not.toMatch(/\bpublic\.mazer_/);
  });

  test('keeps completion server-authoritative, sequential, and idempotent', () => {
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain('v_completed_level <> v_current.player_level');
    expect(migration).toContain('p_client_run_id');
    expect(migration).toContain('revoke insert, update on table mazer.mazer_progression_states from authenticated');
    expect(migration).toContain('revoke insert, update on table mazer.mazer_ai_progression_states from authenticated');
    expect(migration).toContain('revoke insert on table mazer.mazer_cycle_receipts from authenticated');
  });

  test('exposes only the public leaderboard page to guests', () => {
    expect(migration).toContain('grant usage on schema mazer to anon, authenticated, service_role');
    expect(migration).toContain(
      'grant execute on function mazer.mazer_leaderboard_page(integer, integer) to anon, authenticated'
    );
    expect(migration).toContain(
      'revoke all on function mazer.mazer_leaderboard_self_rank() from anon'
    );
    expect(migration).toContain(
      'grant execute on function mazer.mazer_leaderboard_self_rank() to authenticated'
    );
    expect(migration).not.toMatch(/grant execute on function mazer\.mazer_leaderboard_self_rank\(\) to anon/);
    expect(migration).not.toContain('set search_path = public');
  });

  test('pins function ownership and forced RLS', () => {
    expect(migration.match(/owner to postgres/g)?.length).toBe(6);
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
