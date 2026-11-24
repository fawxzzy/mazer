// MAZER-GEN-031: measured gate figures over a level x seed grid on the real ladder generator: how often a gate
// level really carries a gate, what the gate saves, and the dead-end figures of the gated mazes. Shared by
// scripts/analysis/gate-survival-report.ts and tests/reset/legacy-gate-survival.test.ts.
import { isBleedGateLevel } from '../../../src/legacy-runtime/legacyBleedGates';
import { LAST_BUDGET_LEVEL } from '../../../src/legacy-runtime/legacyGeometryBudget';
import type { LegacyMazeSnapshot } from '../../../src/legacy-runtime/legacyMaze';
import { measureMazeQuality } from '../../../src/legacy-runtime/legacyMazeQualityMetrics';
import { LADDER_BOARDS, generateLadderMaze, seedForIndex } from './progressionLadderSampling';

export interface GateSurvivalAggregate {
  // Levels in the sweep that the cadence marks as gate levels, and mazes built on them (levels x seeds).
  gateLevels: number;
  mazes: number;
  // Mazes of a gate level that carry a gate.
  gated: number;
  gatedShare: number;
  // Steps a gate saves a player who lights it (gatedSaving) over the gated mazes.
  meanGatedSaving: number;
  minGatedSaving: number;
  // Short dead ends (3 cells or fewer) and dead ends over the gated mazes.
  meanShortDeadEnds: number;
  meanDeadEnds: number;
  shortShare: number;
  // Share of the gated mazes that have no short dead end at all.
  cleanShare: number;
  maxShortDeadEnds: number;
  // Gate-level mazes that still own a wrap (wrapStats.rungs > 0).
  wrapShare: number;
}

const mean = (xs: number[]): number => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const sweepGateSurvival = (
  levels: readonly number[],
  seedCount: number,
  board: typeof LADDER_BOARDS[number] = LADDER_BOARDS[0]
): GateSurvivalAggregate => {
  // The generator keys the cadence on the budget level, which stops at the felt saturation level (LAST_BUDGET_LEVEL).
  const gateLevels = levels.filter((level) => isBleedGateLevel(Math.min(level, LAST_BUDGET_LEVEL)));
  let mazes = 0;
  let wrapped = 0;
  const savings: number[] = [];
  const shorts: number[] = [];
  const deads: number[] = [];
  const shares: number[] = [];
  for (const level of gateLevels) {
    for (let k = 0; k < seedCount; k += 1) {
      const maze = generateLadderMaze(level, board, seedForIndex(k)) as LegacyMazeSnapshot;
      mazes += 1;
      if ((maze.wrapStats?.rungs ?? 0) > 0) { wrapped += 1; }
      const gate = maze.bleedGates?.[0];
      if (!gate) { continue; }
      savings.push(gate.gatedSaving);
      const quality = measureMazeQuality(maze);
      shorts.push(quality.shortDeadEnds);
      deads.push(quality.deadEnds);
      shares.push(quality.shortShare);
    }
  }
  return {
    gateLevels: gateLevels.length,
    mazes,
    gated: savings.length,
    gatedShare: mazes > 0 ? savings.length / mazes : 0,
    meanGatedSaving: mean(savings),
    minGatedSaving: savings.length > 0 ? Math.min(...savings) : 0,
    meanShortDeadEnds: mean(shorts),
    meanDeadEnds: mean(deads),
    shortShare: mean(shares),
    cleanShare: shorts.length > 0 ? shorts.filter((n) => n === 0).length / shorts.length : 0,
    maxShortDeadEnds: shorts.length > 0 ? Math.max(...shorts) : 0,
    wrapShare: mazes > 0 ? wrapped / mazes : 0
  };
};
