import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const migration = read('../../supabase/migrations/20260828160000_mazer_leaderboard_hide_qa_accounts.sql');
const rollback = read('../../docs/ops/sql-proposals/mazer-leaderboard-hide-qa-20261116/rollback.sql');
const runtimeContracts = read('../../supabase/migrations/20260824170159_mazer_master_runtime_contracts.sql');

const section = (sql: string, from: string, to: string) => {
  const start = sql.indexOf(from);
  const end = sql.indexOf(to, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
};

describe('Mazer leaderboard hides QA accounts', () => {
  test('runs in one transaction and fails closed on a drifted live body', () => {
    expect(migration).toMatch(/^begin;$/m);
    expect(migration).toMatch(/^commit;$/m);
    expect(migration).toContain("'57b52e11c3aa16d5d9672e43c056b486'");
    expect(migration).toContain("'7f4912db0e015d565a88383e8610e86e'");
    expect(migration).toContain("raise exception 'MAZER_LB_HIDE_PREIMAGE_DRIFT_PAGE'");
    expect(migration).toContain("raise exception 'MAZER_LB_HIDE_PREIMAGE_DRIFT_SELF_RANK'");
  });

  test('adds a not-null default-false column that client roles cannot write', () => {
    expect(migration).toContain(
      'add column if not exists leaderboard_hidden boolean not null default false'
    );
    expect(migration).toContain("if current_user in ('authenticated', 'anon') then");
    expect(migration).toContain('new.leaderboard_hidden := old.leaderboard_hidden');
    expect(migration).toContain('before insert or update on mazer.mazer_profiles');
    expect(migration).toContain(
      'revoke all on function mazer.mazer_protect_leaderboard_hidden()'
    );
  });

  test('every ranking population excludes hidden accounts and keeps the ordering', () => {
    const page = section(migration, 'create or replace function mazer.mazer_leaderboard_page(', 'revoke all on function mazer.mazer_leaderboard_page');
    const selfRank = section(migration, 'create or replace function mazer.mazer_leaderboard_self_rank(', 'revoke all on function mazer.mazer_leaderboard_self_rank');
    const order = 'order by s.player_level desc, s.level_reached_at asc nulls last, s.user_id asc';
    for (const body of [page, selfRank]) {
      expect(body).toContain(order);
      expect(body).toContain('where p.username is not null\n      and not p.leaderboard_hidden');
      expect(body).toContain('security definer');
      expect(body).toContain("set search_path = ''");
    }
    expect(page).toContain('limit least(greatest(coalesce(p_limit, 25), 1), 100)');
    expect(migration).toContain('grant execute on function mazer.mazer_leaderboard_page(integer, integer) to anon, authenticated');
    expect(migration).toContain('grant execute on function mazer.mazer_leaderboard_self_rank() to authenticated');
    expect(migration).toContain('revoke all on function mazer.mazer_leaderboard_self_rank() from anon');
    expect(migration).not.toMatch(/grant execute on function mazer\.mazer_leaderboard_self_rank\(\) to anon/);
  });

  test('hides exactly the four QA usernames and no real player', () => {
    const update = section(migration, 'update mazer.mazer_profiles', 'do $postimage$');
    expect(update).toContain("lower(username) in ('mzr-qa-1112', 'mzr-qa-2', 'cqa-a-1105', 'claude')");
    for (const real of ['fawxzzy', 'mazermaster', 'cudding_muisc', 'cuddlingmuisc', 'mazer-269110']) {
      expect(update).not.toContain(real);
    }
    expect(migration).toContain("raise exception 'MAZER_LB_HIDE_POSTIMAGE_REAL_PLAYER_HIDDEN'");
    expect(migration).toContain("raise exception 'MAZER_LB_HIDE_POSTIMAGE_UNEXPECTED_HIDDEN'");
  });

  test('rollback restores the exact prior function text and drops the column', () => {
    // The rollback re-grants the page function one role at a time (so the ACL array order matches the
    // live one), so compare each function definition exactly, up to its closing $$;, not the grant text.
    const definition = (sql: string, name: string) =>
      section(sql, `create or replace function mazer.${name}(`, '\n$$;\n') + '\n$$;\n';
    for (const name of ['mazer_leaderboard_page', 'mazer_leaderboard_self_rank']) {
      expect(rollback).toContain(definition(runtimeContracts, name));
    }
    expect(rollback).toContain('grant execute on function mazer.mazer_leaderboard_page(integer, integer) to anon;');
    expect(rollback).toContain('grant execute on function mazer.mazer_leaderboard_page(integer, integer) to authenticated;');
    expect(rollback).toContain('grant execute on function mazer.mazer_leaderboard_self_rank() to authenticated;');
    expect(rollback).toContain('drop trigger if exists mazer_protect_leaderboard_hidden_before_write on mazer.mazer_profiles');
    expect(rollback).toContain('alter table mazer.mazer_profiles drop column if exists leaderboard_hidden');
    expect(rollback).not.toContain('leaderboard_hidden\n      and');
    expect(rollback).toContain("'57b52e11c3aa16d5d9672e43c056b486'");
  });
});
