import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const migration = read('../../supabase/migrations/20260828170000_mazer_leaderboard_game_mode.sql');
const rollback = read('../../docs/ops/sql-proposals/mazer-leaderboard-mode-20261119/rollback.sql');
const hideQa = read('../../supabase/migrations/20260828160000_mazer_leaderboard_hide_qa_accounts.sql');
const md5 = (text: string) => createHash('md5').update(text).digest('hex');
const bodies = (sql: string) => [...sql.matchAll(/as \$\$([\s\S]*?)\$\$;/g)].map((m) => m[1]!);

describe('Mazer leaderboard game mode SQL proposal (not applied)', () => {
  test('one transaction, additive column with an endless default, guarded by the post-hide-QA bodies', () => {
    expect(migration).toMatch(/^begin;$/m);
    expect(migration).toMatch(/^commit;$/m);
    expect(migration).toContain("add column if not exists mode text not null default 'endless'");
    expect(migration).toContain('MAZER_LB_MODE_PREIMAGE_HIDE_QA_NOT_APPLIED');
    const [, page, self] = bodies(hideQa);
    expect(migration).toContain(`'${md5(page!)}'`);
    expect(migration).toContain(`'${md5(self!)}'`);
  });

  test('both functions keep their ranking and gain only the endless filter, no new argument or grant', () => {
    const [mPage, mSelf] = bodies(migration);
    const [, hPage] = bodies(hideQa);
    expect(mPage!.replace("\n      and s.mode = 'endless'", '')).toBe(hPage);
    expect(mSelf).toContain('order by s.player_level desc, s.level_reached_at asc nulls last, s.user_id asc');
    expect((mSelf!.match(/s\.mode = 'endless'/g) ?? []).length).toBe(2);
    expect(migration).not.toMatch(/p_mode/);
    expect(migration).not.toMatch(/^\s*(grant|revoke) /im);
  });

  test('rollback restores the exact post-hide-QA bodies and drops everything it added', () => {
    const [, hPage, hSelf] = bodies(hideQa);
    const [rPage, rSelf] = bodies(rollback);
    expect(rPage).toBe(hPage);
    expect(rSelf).toBe(hSelf);
    expect(rollback).toContain('drop index if exists mazer.mazer_progression_states_mode_level_idx');
    expect(rollback).toContain('drop column if exists mode');
  });

  test('the client sends no mode to the database', () => {
    const client = read('../../src/legacy-runtime/legacyLeaderboard.ts');
    expect(client).not.toMatch(/p_mode/);
  });
});
