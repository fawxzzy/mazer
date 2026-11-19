// MAZER-L8: measure bleed-off paths per level band (shortest route with vs without each path), the build time
// per maze and whether the level still lands in its felt window [T, T + window].
// Run: npx vite-node scripts/analysis/measure-bleed-paths.ts [seedsPerLevel] [placement] [levels]
//   placement: 'shipped' (default: whatever the ladder profile carries), 'least-saving' (force on) or
//              'seeded' (force the old carve-cost pick, i.e. the ladder before the L8b re-baseline)
//   levels:    comma list, default 10,20,30,50,100,120
import { LADDER_BOARDS, seedForIndex, trackForLevel, ladderScaleForLevel } from "./lib/progressionLadderSampling";
import { createLegacyRuntimeMazeForMode } from "../../src/legacy-runtime/legacyGenerationLifecycle";
import { resolveLegacyMazeGenerationProfileForProgression } from "../../src/legacy-runtime/legacyProgression";
import { auditBleedPaths } from '../../src/legacy-runtime/legacyBleedPaths';
import {
  GEOMETRY_BUDGET_SATURATION_LEVEL,
  GEOMETRY_BUDGET_WINDOW,
  resolveGeometryBudgetTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { measureFelt } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import type { LegacyMazeGenerationProfile, LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';

const seeds = Number(process.argv[2] ?? 6);
const placement = process.argv[3] ?? 'shipped';
const levels = (process.argv[4] ?? '10,20,30,50,100,120').split(',').map(Number);
const profileFor = (level: number): LegacyMazeGenerationProfile => {
  const shipped = resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level));
  if (placement === 'least-saving') { return { ...shipped, bleedPlacement: 'least-saving' }; }
  if (placement === 'seeded') {
    const { bleedPlacement: _dropped, ...rest } = shipped;
    return rest;
  }
  return shipped;
};
const pct = (n: number): string => `${Math.round(n * 100)}%`;
console.log(`placement=${placement} seeds=${seeds}`);
console.log('level | board | mazes | h/v mean | max h/v | route ratio min/mean | worst single saving | ms mean/max | in felt window');
let allRatio = 0, allN = 0, allMs = 0, allMazes = 0, allOff = 0, allUnderHalf = 0;
for (const level of levels) {
  const target = resolveGeometryBudgetTarget(Math.min(Math.max(level, 2), GEOMETRY_BUDGET_SATURATION_LEVEL));
  for (const board of LADDER_BOARDS) {
    let h = 0, v = 0, maxH = 0, maxV = 0, ratioSum = 0, ratioMin = 1, worst = 0, n = 0, msSum = 0, msMax = 0, inWindow = 0;
    for (let i = 0; i < seeds; i += 1) {
      const started = performance.now();
      const maze = createLegacyRuntimeMazeForMode('play', ladderScaleForLevel(level), seedForIndex(i), profileFor(level), {}, board.aspectRatio);
      const ms = performance.now() - started;
      msSum += ms; msMax = Math.max(msMax, ms);
      const saved = ((maze as LegacyMazeSnapshot).loopStats?.saved ?? 0) + ((maze as LegacyMazeSnapshot).wrapStats?.saved ?? 0);
      const felt = measureFelt(maze).steps - saved;
      if (target === null || (felt >= target && felt <= target + GEOMETRY_BUDGET_WINDOW)) { inWindow += 1; }
      const audit = auditBleedPaths(maze.grid, maze.start, maze.goal);
      if (audit.directSteps === null || audit.playableSteps === null) { continue; }
      n += 1;
      h += audit.perAxis.horizontal; v += audit.perAxis.vertical;
      maxH = Math.max(maxH, audit.perAxis.horizontal); maxV = Math.max(maxV, audit.perAxis.vertical);
      const ratio = audit.playableSteps / audit.directSteps;
      ratioSum += ratio; ratioMin = Math.min(ratioMin, ratio);
      if (ratio < 0.5) { allUnderHalf += 1; }
      for (const p of audit.paths) { worst = Math.max(worst, p.saving / audit.directSteps); }
    }
    allRatio += ratioSum; allN += n; allMs += msSum; allMazes += seeds; allOff += seeds - inWindow;
    console.log(`${level} | ${board.name} | ${n} | ${(h / n).toFixed(1)}/${(v / n).toFixed(1)} | ${maxH}/${maxV} | ${pct(ratioMin)}/${pct(ratioSum / n)} | ${pct(worst)} | ${(msSum / seeds).toFixed(1)}/${msMax.toFixed(1)} | ${inWindow}/${seeds}`);
  }
}
console.log(`ALL | mean route ratio ${pct(allRatio / allN)} | mean ms ${(allMs / allMazes).toFixed(1)} | route under 50% ${allUnderHalf}/${allN} | off felt window ${allOff}/${allMazes}`);
