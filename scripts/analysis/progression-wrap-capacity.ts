// Can a maze still LAND with a wrap corridor at level N? The capacity probe behind the end of
// the wrap fade (legacyGeometryBudget.ts, GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL).
//
// The wrap saving is priced into the explorer target (T(N) + saving), so a wrap corridor that
// is too good a shortcut asks the tuner for more than a base maze holds. For sampled levels
// (also levels past the fade, with a forced profile that owns the wrap rungs) and 1 or 2 forced
// rungs this reports, over (board, seed): how often the FIRST base maze landed with its wraps,
// how often the selection fell back to plain bases (no wrap at all), the mean wrap saving of
// the maze that was selected, and the mean raw explorer target it needed (T + priced saving)
// against the capacity ceiling.
//
//   npx vite-node --script scripts/analysis/progression-wrap-capacity.ts \
//     [--levels=100,110,120,130,140,150,160,180,198] [--seeds=40] [--out=<json>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_CEILING,
  resolveGeometryBudgetProfileForRungs,
  resolveGeometryBudgetTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { LEGACY_EMPTY_LOOP_PLAN } from '../../src/legacy-runtime/legacyMazeLoops';
import { LADDER_BOARDS, seedForIndex } from './lib/progressionLadderSampling';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const levels = arg('levels', '100,110,120,130,140,150,160,180,198').split(',').map(Number);
const seeds = Number(arg('seeds', '40'));
const out = arg('out', '');
const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

const rows: Record<string, number>[] = [];
console.log(`ceiling ${GEOMETRY_BUDGET_CEILING}; seeds ${seeds} x ${LADDER_BOARDS.length} boards per cell; loops forced off`);
console.log(['level'.padStart(5), 'rungs'.padStart(5), 'T'.padStart(5), 'first-base'.padStart(11), 'fell-back'.padStart(10), 'saving'.padStart(7), 'raw-need'.padStart(9), 'bases'.padStart(6), 'ms'.padStart(6)].join(' '));
for (const level of levels) {
  for (const rungs of [1, 2]) {
    const target = resolveGeometryBudgetTarget(Math.min(level, 198))!;
    let first = 0; let fell = 0; let n = 0;
    const savings: number[] = []; const bases: number[] = []; const times: number[] = [];
    for (const board of LADDER_BOARDS) {
      for (let index = 0; index < seeds; index += 1) {
        const started = performance.now();
        const maze = createLegacyRuntimeMazeForMode('play', 35, seedForIndex(index), resolveGeometryBudgetProfileForRungs(rungs, Math.min(level, 198)), {
          loopPlan: LEGACY_EMPTY_LOOP_PLAN, wrapRungs: rungs
        }, board.aspectRatio);
        times.push(performance.now() - started);
        n += 1;
        const searched = maze.generation?.selection?.searchedCandidateCount ?? 1;
        const kept = maze.wrapStats?.rungs ?? 0;
        bases.push(searched);
        if (searched === 1 && kept === rungs) { first += 1; }
        if (kept < rungs) { fell += 1; }
        savings.push(maze.wrapStats?.saved ?? 0);
      }
    }
    const row = { level, rungs, target, firstBase: first / n, fellBack: fell / n, saving: mean(savings), rawNeed: target + mean(savings), bases: mean(bases), ms: mean(times) };
    rows.push(row);
    console.log([String(level).padStart(5), String(rungs).padStart(5), String(target).padStart(5), `${(row.firstBase * 100).toFixed(0)}%`.padStart(11), `${(row.fellBack * 100).toFixed(0)}%`.padStart(10), row.saving.toFixed(1).padStart(7), row.rawNeed.toFixed(0).padStart(9), row.bases.toFixed(2).padStart(6), row.ms.toFixed(0).padStart(6)].join(' '));
  }
}
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ levels, seeds, ceiling: GEOMETRY_BUDGET_CEILING, rows }, null, 2));
}
