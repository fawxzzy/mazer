// MAZER-GEN-030: before/after sweep of the maze-quality figures over a seed x level grid on the real ladder
// generator. `enabled: false` runs the generator as it was before the quality pass (same seeds), so the two
// columns are an A/B on identical inputs. Shared by scripts/analysis/maze-quality-report.ts and
// tests/reset/legacy-maze-quality.test.ts.
import { measureMazeQuality } from '../../../src/legacy-runtime/legacyMazeQualityMetrics';
import { setMazeQualityPassEnabled } from '../../../src/legacy-runtime/legacyMazeQualityPass';
import { LADDER_BOARDS, generateLadderMaze, seedForIndex } from './progressionLadderSampling';

export interface MazeQualityAggregate {
  mazes: number;
  deadEnds: number;
  shortDeadEnds: number;
  shortShare: number;
  meanDeadEndLen: number;
  alternateRouteRate: number;
  // The same on the board as drawn (wrap corridors not walked): a second way the player can SEE.
  alternateRouteRatePlanar: number;
  bypassShare: number;
  cyclomatic: number;
  solutionLength: number;
}

const mean = (xs: number[]): number => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const sweepMazeQuality = (
  levels: readonly number[],
  seedCount: number,
  enabled: boolean,
  board: typeof LADDER_BOARDS[number] = LADDER_BOARDS[0]
): MazeQualityAggregate => {
  const rows: ReturnType<typeof measureMazeQuality>[] = [];
  const planar: ReturnType<typeof measureMazeQuality>[] = [];
  setMazeQualityPassEnabled(enabled);
  try {
    for (const level of levels) {
      for (let k = 0; k < seedCount; k += 1) {
        const maze = generateLadderMaze(level, board, seedForIndex(k));
        rows.push(measureMazeQuality(maze));
        planar.push(measureMazeQuality(maze, false));
      }
    }
  } finally {
    setMazeQualityPassEnabled(true);
  }
  return {
    mazes: rows.length,
    deadEnds: mean(rows.map((r) => r.deadEnds)),
    shortDeadEnds: mean(rows.map((r) => r.shortDeadEnds)),
    shortShare: mean(rows.map((r) => r.shortShare)),
    meanDeadEndLen: mean(rows.map((r) => r.meanDeadEndLen)),
    alternateRouteRate: mean(rows.map((r) => r.bypassable)),
    alternateRouteRatePlanar: mean(planar.map((r) => r.bypassable)),
    bypassShare: mean(rows.map((r) => r.bypassShare)),
    cyclomatic: mean(rows.map((r) => r.cyclomatic)),
    solutionLength: mean(rows.map((r) => r.solutionLength))
  };
};
