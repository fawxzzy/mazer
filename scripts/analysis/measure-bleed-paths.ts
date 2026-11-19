// MAZER-L8: measure bleed-off paths per level band (shortest route with vs without each path).
// Run: npx vite-node scripts/analysis/measure-bleed-paths.ts [seedsPerLevel] [least-saving]
import { LADDER_BOARDS, seedForIndex, trackForLevel, ladderScaleForLevel } from "./lib/progressionLadderSampling";
import { createLegacyRuntimeMazeForMode } from "../../src/legacy-runtime/legacyGenerationLifecycle";
import { resolveLegacyMazeGenerationProfileForProgression } from "../../src/legacy-runtime/legacyProgression";
import { auditBleedPaths } from '../../src/legacy-runtime/legacyBleedPaths';

const seeds = Number(process.argv[2] ?? 6);
const placement = process.argv[3] === 'least-saving' ? 'least-saving' as const : undefined;
const generateLadderMaze = (level: number, board: typeof LADDER_BOARDS[number], seed: number) => createLegacyRuntimeMazeForMode(
  'play',
  ladderScaleForLevel(level),
  seed,
  { ...resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level)), ...(placement ? { bleedPlacement: placement } : {}) },
  {},
  board.aspectRatio
);
const levels = [10, 20, 30, 50, 100, 120];
const pct = (n: number): string => `${Math.round(n * 100)}%`;
console.log('level | board | mazes | h/v mean | max h/v | route ratio min/mean | worst single saving');
for (const level of levels) {
  for (const board of LADDER_BOARDS) {
    let h = 0, v = 0, maxH = 0, maxV = 0, ratioSum = 0, ratioMin = 1, worst = 0, n = 0;
    for (let i = 0; i < seeds; i += 1) {
      const maze = generateLadderMaze(level, board, seedForIndex(i));
      const audit = auditBleedPaths(maze.grid, maze.start, maze.goal);
      if (audit.directSteps === null || audit.playableSteps === null) { continue; }
      n += 1;
      h += audit.perAxis.horizontal; v += audit.perAxis.vertical;
      maxH = Math.max(maxH, audit.perAxis.horizontal); maxV = Math.max(maxV, audit.perAxis.vertical);
      const ratio = audit.playableSteps / audit.directSteps;
      ratioSum += ratio; ratioMin = Math.min(ratioMin, ratio);
      for (const p of audit.paths) { worst = Math.max(worst, p.saving / audit.directSteps); }
    }
    console.log(`${level} | ${board.name} | ${n} | ${(h / n).toFixed(1)}/${(v / n).toFixed(1)} | ${maxH}/${maxV} | ${pct(ratioMin)}/${pct(ratioSum / n)} | ${pct(worst)}`);
  }
}
