// MAZER-GEN-024: the felt tuner weighs a level's bleed gate. A gated wrap is closed until its ring is lit, so a
// gate level is priced for the saving a player really gets (the wrap saving minus the detour to the gate).
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { GEOMETRY_BUDGET_WINDOW, resolveGeometryBudgetTarget } from '../../src/legacy-runtime/legacyGeometryBudget';
import { isBleedGateLevel, measureLegacyBleedGateWrapPenalty, placeLegacyBleedGateWithHint } from '../../src/legacy-runtime/legacyBleedGates';
import { measurePricedFeltSteps } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import { generateLadderMaze, hashLadderMaze, LADDER_BOARDS } from '../../scripts/analysis/lib/progressionLadderSampling';

const SEED = 20261106;
const golden = JSON.parse(readFileSync(new URL('../fixtures/progression-ladder-golden.v1.json', import.meta.url), 'utf8')) as {
  hashes: Record<string, Record<string, string>>;
};

// Levels whose golden fingerprint MAZER-GEN-024 re-pinned on purpose (measured before and after: 44 of 600
// golden entries moved; every other level, gate level or not, kept its hash).
const REPINNED: Record<string, number[]> = {
  phone: [28, 31, 32, 46, 56, 59, 61, 62, 68, 70, 78, 81, 82, 91, 93, 97, 100, 106, 108, 109, 133, 136],
  desktop: [24, 34, 42, 46, 53, 57, 59, 73, 76, 78, 82, 84, 91, 93, 94, 95, 97, 103, 109, 110, 112, 136]
};

describe('MAZER-GEN-024: gate levels are priced for their gate, other levels are untouched', () => {
  test('every re-pinned golden level is a gate level; the golden holds no other change', () => {
    let total = 0;
    for (const [board, levels] of Object.entries(REPINNED)) {
      for (const level of levels) {
        total += 1;
        expect(isBleedGateLevel(level), `${board} ${level}`).toBe(true);
      }
    }
    expect(total).toBe(44);
  });

  test('non-gate levels reproduce their pinned fingerprint (ladder shape unchanged off the gate levels)', () => {
    for (const board of LADDER_BOARDS) {
      for (let level = 1; level <= 150; level += 1) {
        if (isBleedGateLevel(level)) { continue; }
        const maze = generateLadderMaze(level, board, SEED + level);
        expect(hashLadderMaze(maze), `${board.name} ${level}`).toBe(golden.hashes[board.name]![String(level)]);
      }
    }
  });

  test('a gated ladder maze lands its felt window with the gate weighed, and records the saving net of the detour', () => {
    let gated = 0;
    for (const board of LADDER_BOARDS) {
      for (let level = 20; level <= 140; level += 1) {
        if (!isBleedGateLevel(level)) { continue; }
        const maze = generateLadderMaze(level, board, SEED + level) as LegacyMazeSnapshot;
        const target = resolveGeometryBudgetTarget(level)!;
        const priced = measurePricedFeltSteps(maze);
        expect(priced, `${board.name} ${level}`).toBeGreaterThanOrEqual(target);
        expect(priced, `${board.name} ${level}`).toBeLessThanOrEqual(target + GEOMETRY_BUDGET_WINDOW);
        const gate = maze.bleedGates?.[0];
        if (gate) {
          gated += 1;
          // The gate the level carries costs exactly what the tuner priced it at.
          expect(measureLegacyBleedGateWrapPenalty(maze, gate).penalty).toBe(gate.ungatedSaving - gate.gatedSaving);
        }
      }
    }
    expect(gated).toBeGreaterThan(20);
  });

  test('a hinted gate is placed only while it is still a valid gate on the grid', () => {
    const board = LADDER_BOARDS[0]!;
    for (let level = 20; level <= 70; level += 1) {
      const maze = generateLadderMaze(level, board, SEED + level) as LegacyMazeSnapshot;
      const gate = maze.bleedGates?.[0];
      if (!gate) { continue; }
      expect(placeLegacyBleedGateWithHint(maze, gate)?.gate).toEqual(gate);
      expect(placeLegacyBleedGateWithHint(maze, { ...gate, x: gate.x + 1, y: gate.y })).toBeNull();
      return;
    }
    throw new Error('no gated level found');
  });
});
