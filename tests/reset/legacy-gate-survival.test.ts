// MAZER-GEN-031: gates survive past level 140. The wrap fade took every wrap away by level 140 and a gate hides a
// wrap, so the gate puzzle used to end there. A gate level now keeps a wrap for its gate to guard, the maze search keeps
// trying until a base lands with a gate, and the GEN-030 quality pass runs on gate levels edit by edit without moving
// the gate's saving. Figures below are measured on the real ladder generator (scripts/analysis/gate-survival-report.ts).
//
// Measured before / after on origin/main 56043a17 (phone | desktop, 2 seeds per gate level, every 3rd level;
// gated = share of gate-level mazes carrying a gate; the cadence keys on min(level, 288), so every level from 288
// up shares one roll):
//   levels 100-139   gated 0.35 | 0.42 -> 0.89 | 1.00   max short dead ends in a maze 6 | 12 -> 3 | 3
//   levels 140-199   gated 0.00 | 0.00 -> 0.78 | 0.94   saving mean 14.5 | 15.8
//   levels 200-282   gated 0.00 | 0.00 -> 0.50 | 0.93   saving mean 12.1 | 13.6
//   levels 283-600   unchanged: a wrap there gave gated 0.28 | 0.25 at saving 1 only (the felt ceiling leaves a gate
//                    one step of saving) and cost the level its 905 reverse floor, so the floor stops at 282.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { isBleedGateLevel, placeLegacyBleedGateWithHint } from '../../src/legacy-runtime/legacyBleedGates';
import {
  GEOMETRY_BUDGET_FELT_SATURATION_LEVEL,
  GEOMETRY_BUDGET_WRAP_FADE_FROM_LEVEL,
  GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL,
  LAST_BUDGET_LEVEL,
  resolveGeometryBudgetGateWrapFloor,
  resolveGeometryBudgetTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { measurePricedFeltSteps } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import { LADDER_BOARDS, generateLadderMaze, hashLadderMaze, seedForIndex } from '../../scripts/analysis/lib/progressionLadderSampling';
import { sweepGateSurvival } from '../../scripts/analysis/lib/gateSurvivalSweep';

const FROM = GEOMETRY_BUDGET_WRAP_FADE_FROM_LEVEL;
const TO = GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL;
const range = (from: number, to: number, step: number): number[] => {
  const levels: number[] = [];
  for (let level = from; level <= to; level += step) { levels.push(level); }
  return levels;
};
// The generator keys the cadence on the budget level, which stops at LAST_BUDGET_LEVEL.
const isGateBudgetLevel = (level: number): boolean => isBleedGateLevel(Math.min(level, LAST_BUDGET_LEVEL));

const golden = JSON.parse(readFileSync(new URL('../fixtures/progression-ladder-golden.v1.json', import.meta.url), 'utf8')) as {
  seed: number;
  hashes: Record<string, Record<string, string>>;
};

describe('MAZER-GEN-031: the gate wrap floor', () => {
  test('a gate level owns at least the vertical corridor from the fade start; no other level gains a rung', () => {
    expect(resolveGeometryBudgetGateWrapFloor(FROM - 1, true)).toBe(0);
    expect(resolveGeometryBudgetGateWrapFloor(FROM, true)).toBe(1);
    expect(resolveGeometryBudgetGateWrapFloor(TO + 50, true)).toBe(1);
    expect(resolveGeometryBudgetGateWrapFloor(GEOMETRY_BUDGET_FELT_SATURATION_LEVEL - 1, true)).toBe(1);
    // The felt ceiling leaves a gate about one step of saving from the felt saturation level on: no wrap there.
    expect(resolveGeometryBudgetGateWrapFloor(GEOMETRY_BUDGET_FELT_SATURATION_LEVEL, true)).toBe(0);
    expect(resolveGeometryBudgetGateWrapFloor(LAST_BUDGET_LEVEL, true)).toBe(0);
    expect(resolveGeometryBudgetGateWrapFloor(1_000, true)).toBe(0);
    expect(resolveGeometryBudgetGateWrapFloor(TO + 50, false)).toBe(0);
    expect(resolveGeometryBudgetGateWrapFloor(FROM, false)).toBe(0);
  });
});

describe('MAZER-GEN-031: gates survive past level 140 (both frozen boards)', () => {
  // [from, to, step, minGatedShare, minMeanSaving, maxMeanShortDeadEnds]; every floor sits below the measured value.
  const BANDS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [100, 139, 3, 0.7, 5, 1],
    [140, 199, 4, 0.5, 5, 1],
    [200, 282, 5, 0.35, 5, 1]
  ];
  test.each(BANDS)('levels %i-%i: gate levels carry gates, keep their wrap and stay clean of short dead ends', (from, to, step, minShare, minSaving, maxShort) => {
    for (const board of LADDER_BOARDS) {
      const result = sweepGateSurvival(range(from, to, step), 2, board);
      const label = `${board.name} ${from}-${to} ${JSON.stringify(result)}`;
      expect(result.gateLevels, label).toBeGreaterThan(2);
      expect(result.gatedShare, label).toBeGreaterThanOrEqual(minShare);
      expect(result.meanGatedSaving, label).toBeGreaterThanOrEqual(minSaving);
      expect(result.minGatedSaving, label).toBeGreaterThanOrEqual(1);
      expect(result.wrapShare, label).toBeGreaterThanOrEqual(0.99);
      expect(result.meanShortDeadEnds, label).toBeLessThanOrEqual(maxShort);
      expect(result.shortShare, label).toBeLessThan(0.1);
    }
  }, 300_000);
});

describe('MAZER-GEN-031: a gated maze past the fade is a sound maze', () => {
  const LEVELS = [150, 163, 201, 240, 279, 282];
  test('deterministic per (level, seed, board); solvable; the gate lands again with exactly its recorded saving', () => {
    let gated = 0;
    for (const board of LADDER_BOARDS) {
      for (const level of LEVELS) {
        if (!isGateBudgetLevel(level)) { continue; }
        for (let index = 0; index < 3; index += 1) {
          const seed = seedForIndex(index);
          const first = generateLadderMaze(level, board, seed) as LegacyMazeSnapshot;
          const again = generateLadderMaze(level, board, seed) as LegacyMazeSnapshot;
          expect(hashLadderMaze(again), `${board.name} ${level} ${index}`).toBe(hashLadderMaze(first));
          expect(first.solutionPath.length, `${board.name} ${level}`).toBeGreaterThan(1);
          expect(first.solutionPath[0]).toEqual(first.start);
          expect(first.solutionPath[first.solutionPath.length - 1]).toEqual(first.goal);
          const gate = first.bleedGates?.[0];
          if (!gate) { continue; }
          gated += 1;
          const placement = placeLegacyBleedGateWithHint(first, gate);
          expect(placement?.gate, `${board.name} ${level}`).toEqual(gate);
          expect(gate.gatedSaving).toBeGreaterThan(0);
          expect(gate.ungatedSaving).toBeGreaterThanOrEqual(gate.gatedSaving);
        }
      }
    }
    expect(gated).toBeGreaterThan(6);
  }, 120_000);

  test('from the felt saturation level the gate has no room to save anything, so those levels stay plain and keep their 905 reverse floor', () => {
    for (const board of LADDER_BOARDS) {
      for (const level of [GEOMETRY_BUDGET_FELT_SATURATION_LEVEL, LAST_BUDGET_LEVEL, 300, 450, 1_000]) {
        const maze = generateLadderMaze(level, board, seedForIndex(1)) as LegacyMazeSnapshot;
        expect(maze.wrapStats, `${board.name} ${level}`).toBeUndefined();
        expect(maze.bleedGates ?? [], `${board.name} ${level}`).toEqual([]);
        expect(maze.reverseStats?.floor, `${board.name} ${level}`).toBe(905);
      }
    }
  }, 120_000);

  test('a gated maze still lands its felt window (priced, the gate weighed)', () => {
    let checked = 0;
    for (const board of LADDER_BOARDS) {
      for (const level of [150, 163, 201, 240, 279]) {
        if (!isGateBudgetLevel(level)) { continue; }
        for (let index = 0; index < 3; index += 1) {
          const maze = generateLadderMaze(level, board, seedForIndex(index)) as LegacyMazeSnapshot;
          if (!maze.bleedGates?.length) { continue; }
          const target = resolveGeometryBudgetTarget(level)!;
          const priced = measurePricedFeltSteps(maze);
          expect(priced, `${board.name} ${level}`).toBeGreaterThanOrEqual(target);
          expect(priced, `${board.name} ${level}`).toBeLessThanOrEqual(target + 1);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(4);
  }, 120_000);

  test('the level 1 corridor has no gate and keeps its pinned fingerprint', () => {
    for (const board of LADDER_BOARDS) {
      const maze = generateLadderMaze(1, board, golden.seed + 1) as LegacyMazeSnapshot;
      expect(maze.bleedGates ?? []).toEqual([]);
      expect(maze.wrapStats).toBeUndefined();
      expect(hashLadderMaze(maze)).toBe(golden.hashes[board.name]!['1']);
    }
  });

  test('levels without a gate keep a plain maze past the fade (no wrap, no gate)', () => {
    let checked = 0;
    for (const board of LADDER_BOARDS) {
      let onBoard = 0;
      for (const level of range(TO + 1, 282, 1)) {
        if (isGateBudgetLevel(level) || onBoard >= 6) { continue; }
        const maze = generateLadderMaze(level, board, seedForIndex(0)) as LegacyMazeSnapshot;
        expect(maze.wrapStats, `${board.name} ${level}`).toBeUndefined();
        expect(maze.bleedGates ?? [], `${board.name} ${level}`).toEqual([]);
        onBoard += 1;
        checked += 1;
      }
    }
    expect(checked).toBe(12);
  }, 120_000);
});
