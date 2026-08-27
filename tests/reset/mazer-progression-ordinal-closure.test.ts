import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260827170000_mazer_progression_ordinal_closure.sql', import.meta.url),
  'utf8'
).replace(/\r\n/g, '\n');

const closeOrdinals = (level: string, completedCycles: string) => {
  const currentLevel = BigInt(level);
  const currentCycles = BigInt(completedCycles);
  const canonicalLevel = currentLevel > currentCycles + 1n
    ? currentLevel
    : currentCycles + 1n;
  return {
    level: canonicalLevel.toString(),
    completedCycles: (canonicalLevel - 1n).toString()
  };
};

describe('Mazer progression ordinal closure', () => {
  test('closes historical drift without lowering either monotonic value', () => {
    expect(closeOrdinals('5', '109')).toEqual({ level: '110', completedCycles: '109' });
    expect(closeOrdinals('60', '75')).toEqual({ level: '76', completedCycles: '75' });
    expect(closeOrdinals('4', '2')).toEqual({ level: '4', completedCycles: '3' });
    expect(closeOrdinals('9007199254740993', '9007199254740992')).toEqual({
      level: '9007199254740993',
      completedCycles: '9007199254740992'
    });
  });

  test('binds the repair to the master schema and fails closed at its exact boundaries', () => {
    expect(migration).toContain("to_regnamespace('mazer')");
    expect(migration).toContain("raise exception 'MAZER_PROGRESSION_ORDINAL_CLOSURE_PREIMAGE_MISSING'");
    expect(migration).toContain("raise exception 'MAZER_PROGRESSION_ORDINAL_EXHAUSTED'");
    expect(migration).toContain('lock table mazer.mazer_progression_states in share row exclusive mode');
    expect(migration).toContain("raise exception 'MAZER_PROGRESSION_ORDINAL_CLOSURE_POSTIMAGE_FAILED'");
    expect(migration).not.toMatch(/public\.mazer_|email|display_name/i);
  });

  test('updates both scalar and JSON projections and ratchets the invariant', () => {
    expect(migration).toContain('player_level = closure.canonical_level');
    expect(migration).toContain('player_completed_cycles = closure.canonical_completed_cycles');
    expect(migration).toContain("'level', closure.canonical_level::text");
    expect(migration).toContain("'completedCycles', closure.canonical_completed_cycles::text");
    expect(migration).toContain('revision = coalesce(s.revision, 0) + 1');
    expect(migration).toContain('check (player_level - 1 = player_completed_cycles) not valid');
    expect(migration).toContain('validate constraint mazer_progression_states_completion_ordinal_check');
    expect(migration).not.toMatch(/player_rank\s*=|player_target_complexity\s*=|delete\s+from\s+mazer/i);
  });

  test('uses the latest owned play receipt only as repaired tie-break time', () => {
    expect(migration).toContain("r.surface = 'play'");
    expect(migration).toContain('select max(r.completed_at)');
    expect(migration).toContain('when closure.canonical_level > s.player_level then closure.canonical_level_reached_at');
  });
});
