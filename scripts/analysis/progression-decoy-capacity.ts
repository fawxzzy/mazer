// How many decoy branches fit on the frozen board, and what they do to the
// independent metrics. Usage: vite-node --script <this> -- [n=20] [minLen] [maxLen]
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { GEOMETRY_BUDGET_TAPE, measureGeometryBudgetProxy, resolveGeometryBudgetProfileForRungs } from '../../src/legacy-runtime/legacyGeometryBudget';
import { analyzeMazeDifficulty } from '../../src/legacy-runtime/legacyMazeDifficultyMetrics';
import { tuneMazeProxyToTarget } from '../../src/legacy-runtime/legacyMazeDecoyTuning';
import { resolveLegacyMazeComplexity } from '../../src/legacy-runtime/legacyProgression';

const args = process.argv.slice(2).filter((a) => a !== '--');
const n = Number(args[0] ?? 20);
const minLength = Number(args[1] ?? 2);
const maxLength = Number(args[2] ?? 6);
const rungs = Number(args[3] ?? GEOMETRY_BUDGET_TAPE.length);
const overrides = args[4] ? JSON.parse(args[4]) : {};
for (const [name, ratio] of [['phone', 23 / 51], ['desktop', 45 / 27], ['square', 1]] as const) {
  const hs: number[] = []; const adds: number[] = []; const ms: number[] = []; const fl: number[] = []; const h0s: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const maze = createLegacyRuntimeMazeForMode('play', 35, 5000 + i * 31, { ...resolveGeometryBudgetProfileForRungs(rungs), ...overrides }, {}, ratio);
    const bd = measureGeometryBudgetProxy(maze, resolveLegacyMazeComplexity(maze));
    const t0 = performance.now();
    const r = tuneMazeProxyToTarget(maze, bd, 1e9, 99 + i, { minLength, maxLength, maxEdits: 5000 });
    ms.push(performance.now() - t0);
    hs.push(r.proxy); adds.push(r.added); h0s.push(bd.total);
    fl.push(r.grid.flat().filter(Boolean).length / (maze.width * maze.height));
  }
  const m = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
  console.log(`${name} len ${minLength}-${maxLength}: base H1 ${m(h0s)} -> capacity H1 mean ${m(hs)} min ${Math.min(...hs).toFixed(0)} max ${Math.max(...hs).toFixed(0)}, decoys ${m(adds)}, fill ${m(fl.map((x) => x * 100))}%, tune ms ${m(ms)}, capacity pct: ${[0, 0.01, 0.05, 0.1, 0.25, 0.5].map((q) => [...hs].sort((a, b) => a - b)[Math.floor(q * (hs.length - 1))]!.toFixed(0)).join('/')} (min/p1/p5/p10/p25/p50)`);
}
