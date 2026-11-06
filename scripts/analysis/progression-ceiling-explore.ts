// Exploration harness: samples UNGATED mazes for a generation profile on the
// frozen boards and prints distributions of the H1 proxy and the independent
// metrics. Used to establish how high each lever can push difficulty.
//
//   npx vite-node --script scripts/analysis/progression-ceiling-explore.ts -- '<json profile overrides>' [n=60]
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_TAPE,
  measureGeometryBudgetProxy,
  resolveGeometryBudgetProfileForRungs
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { analyzeMazeDifficulty } from '../../src/legacy-runtime/legacyMazeDifficultyMetrics';
import { resolveLegacyMazeComplexity } from '../../src/legacy-runtime/legacyProgression';

const args = process.argv.slice(2).filter((a) => a !== '--');
const overrides = args[0] ? JSON.parse(args[0]) : {};
const n = Number(args[1] ?? 60);
const rungs = overrides.__rungs ?? GEOMETRY_BUDGET_TAPE.length;
delete overrides.__rungs;
const scale = overrides.__scale ?? 35;
delete overrides.__scale;
const boards = [
  { name: 'phone', ratio: 23 / 51 },
  { name: 'desktop', ratio: 45 / 27 }
];
const stat = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  const s = [...xs].sort((a, b) => a - b);
  return { mean: m, sd, p5: s[Math.floor(xs.length * 0.05)]!, p95: s[Math.floor(xs.length * 0.95)]!, max: s[s.length - 1]! };
};
for (const board of boards) {
  const profile = { ...resolveGeometryBudgetProfileForRungs(rungs), ...overrides };
  const rows: Record<string, number[]> = {};
  const push = (k: string, v: number) => { (rows[k] ??= []).push(v); };
  let dims = '';
  for (let i = 0; i < n; i += 1) {
    const t0 = performance.now();
    const maze = createLegacyRuntimeMazeForMode('play', scale, 1000 + i * 7919, profile, {}, board.ratio);
    push('ms', performance.now() - t0);
    dims = `${maze.width}x${maze.height}`;
    const c = resolveLegacyMazeComplexity(maze);
    push('H1', measureGeometryBudgetProxy(maze, c).total);
    const m = analyzeMazeDifficulty(maze);
    for (const [k, v] of Object.entries(m)) { push(k, v as number); }
  }
  console.log(`== ${board.name} ${dims} profile=${JSON.stringify(overrides)} rungs=${rungs}`);
  for (const [k, xs] of Object.entries(rows)) {
    const s = stat(xs);
    console.log(`${k.padEnd(16)} mean ${s.mean.toFixed(1).padStart(8)} sd ${s.sd.toFixed(1).padStart(6)} p5 ${s.p5.toFixed(1).padStart(8)} p95 ${s.p95.toFixed(1).padStart(8)} max ${s.max.toFixed(1).padStart(8)}`);
  }
}
