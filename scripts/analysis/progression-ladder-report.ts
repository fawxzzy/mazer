// Per-level progression ladder report + monotonicity assertion.
//
// For each requested level it generates mazes through the real progression path
// (resolveLegacyMazeGenerationProfileForProgression -> createLegacyRuntimeMazeForMode)
// on the frozen boards (phone 25x51, desktop 45x27 at scale 35) for a fixed set
// of deterministic seeds, and reports
//   PRIMARY    felt difficulty: deterministic pull-to-goal explorer steps (legacyMazeFeltDifficulty.ts),
//              plus its Monte-Carlo cross-check (8 other tie seeds),
//   SECONDARY  the H1 structure proxy (the first ladder's steering metric),
//   INDEPENDENT route length, explorer path, turns, decision points, dead ends,
//              deep dead ends, decoy depth, lure cells, deceptiveness, A* and greedy
//              solver effort, floor cells,
//   and generation time.
//
// Usage (repo root):
//   npx vite-node scripts/analysis/progression-ladder-report.ts \
//     [--levels=1..100,150,185,200,300,500,1000] [--seeds=8] [--out=<dir>] [--assert]
//   --assert  exit 1 unless, for every board and every pair of consecutive levels
//             in the request (both below the ceiling), the WORST seed of level N+1
//             beats the BEST seed of level N on the primary metric (so ordering
//             holds for any two seeds, not on average), every tuned maze landed in
//             [T, T + window], levels at/after the ceiling are one difficulty class,
//             and the independent metrics rise across the ladder (40-level window
//             means of route length, A* effort, greedy effort and decoy depth never
//             fall by more than 10%, and rise overall).
// CI runs a reduced scale of this through tests/reset/legacy-progression-ladder.test.ts
// (and a CI-sized --assert run is listed in the PR).

import { mkdirSync, writeFileSync } from 'node:fs';
import {
  GEOMETRY_BUDGET_CEILING,
  GEOMETRY_BUDGET_SATURATION_LEVEL,
  GEOMETRY_BUDGET_TOP_TARGET,
  GEOMETRY_BUDGET_WINDOW,
  resolveGeometryBudgetTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import {
  LADDER_BOARDS as BOARDS,
  sampleLevel,
  seedForIndex,
  type LadderLevelSample
} from './lib/progressionLadderSampling';

const parseLevels = (spec: string): number[] => {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const range = /^(\d+)\.\.(\d+)$/.exec(part);
    if (range) {
      for (let level = Number(range[1]); level <= Number(range[2]); level += 1) { out.push(level); }
    } else if (/^\d+$/.test(part)) {
      out.push(Number(part));
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
};

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const pct = (values: number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
};

const TREND_METRICS = ['routeLength', 'astarExpansions', 'greedySearchCells', 'maxDecoyDepth'] as const;

const main = (): void => {
  const levels = parseLevels(arg('levels', '1..100,150,185,200,300,500,1000'));
  const seedCount = Number(arg('seeds', '8'));
  const outDir = arg('out', '');
  const assertMode = process.argv.includes('--assert');
  const rows: Record<string, unknown>[] = [];
  const byBoard: Record<string, Map<number, LadderLevelSample[]>> = {};

  for (const board of BOARDS) {
    byBoard[board.name] = new Map();
  }
  for (const level of levels) {
    for (const board of BOARDS) {
      const samples: LadderLevelSample[] = [];
      for (let index = 0; index < seedCount; index += 1) {
        samples.push(sampleLevel(level, board, seedForIndex(index)));
      }
      byBoard[board.name]!.set(level, samples);
      const metricMean = (key: keyof LadderLevelSample['metrics']): number => mean(samples.map((s) => s.metrics[key]));
      const structureMean = (key: keyof LadderLevelSample['structure']): number => mean(samples.map((s) => s.structure[key]));
      rows.push({
        level,
        board: board.name,
        target: resolveGeometryBudgetTarget(Math.min(Math.max(level, 2), GEOMETRY_BUDGET_SATURATION_LEVEL)),
        feltMean: mean(samples.map((s) => s.felt)),
        feltMin: Math.min(...samples.map((s) => s.felt)),
        feltMax: Math.max(...samples.map((s) => s.felt)),
        feltMonteCarloMean: mean(samples.map((s) => s.feltMonteCarlo)),
        onTargetRate: mean(samples.map((s) => (s.onTarget ? 1 : 0))),
        h1Mean: mean(samples.map((s) => s.proxy)),
        routeLength: metricMean('routeLength'),
        explorerPath: mean(samples.map((s) => s.explorerPath)),
        routeTurns: metricMean('routeTurns'),
        decisionPoints: metricMean('decisionPoints'),
        deadEnds: metricMean('deadEnds'),
        deepDeadEnds: structureMean('deepDeadEnds'),
        trapBranches: structureMean('trapBranches'),
        lureCells: structureMean('lureCells'),
        decoyCells: metricMean('decoyCells'),
        maxDecoyDepth: metricMean('maxDecoyDepth'),
        meanDeadEndDepth: metricMean('meanDeadEndDepth'),
        deceptiveness: metricMean('deceptiveness'),
        tortuosity: metricMean('tortuosity'),
        greedySearchCells: metricMean('greedySearchCells'),
        astarExpansions: metricMean('astarExpansions'),
        floorCells: metricMean('floorCells'),
        wrapSteps: metricMean('wrapSteps'),
        cycles: structureMean('cycles'),
        msMean: mean(samples.map((s) => s.ms)),
        msP95: pct(samples.map((s) => s.ms), 0.95),
        msMax: Math.max(...samples.map((s) => s.ms))
      });
    }
  }

  const failures: string[] = [];
  const deltas: { board: string; from: number; to: number; worstGap: number; meanDelta: number }[] = [];
  for (const board of BOARDS) {
    const map = byBoard[board.name]!;
    for (let index = 1; index < levels.length; index += 1) {
      const from = levels[index - 1]!;
      const to = levels[index]!;
      const low = map.get(from)!;
      const high = map.get(to)!;
      const worstGap = Math.min(...high.map((s) => s.felt)) - Math.max(...low.map((s) => s.felt));
      deltas.push({ board: board.name, from, to, worstGap, meanDelta: mean(high.map((s) => s.felt)) - mean(low.map((s) => s.felt)) });
      const consecutive = to === from + 1;
      if (to < GEOMETRY_BUDGET_SATURATION_LEVEL && consecutive && from >= 2 && worstGap <= 0) {
        failures.push(`${board.name} level ${from}->${to}: worst seed of ${to} does not beat best seed of ${from} (gap ${worstGap})`);
      }
    }
    for (const level of levels) {
      const samples = map.get(level)!;
      if (level >= 2 && samples.some((s) => !s.onTarget)) {
        failures.push(`${board.name} level ${level}: ${samples.filter((s) => !s.onTarget).length} maze(s) missed the target window`);
      }
      if (level >= GEOMETRY_BUDGET_SATURATION_LEVEL) {
        for (const s of samples) {
          if (s.felt < GEOMETRY_BUDGET_TOP_TARGET || s.felt > GEOMETRY_BUDGET_TOP_TARGET + GEOMETRY_BUDGET_WINDOW) {
            failures.push(`${board.name} level ${level}: ceiling-class maze felt ${s.felt} is off the top target ${GEOMETRY_BUDGET_TOP_TARGET}`);
          }
        }
      }
    }
  }

  // Independent-metric trends over 40-level windows of the requested ramp levels.
  const trendLines: string[] = [];
  const rampRows = rows.filter((row) => (row.level as number) >= 2 && (row.level as number) <= GEOMETRY_BUDGET_SATURATION_LEVEL);
  const rampLevels = [...new Set(rampRows.map((row) => row.level as number))];
  if (rampLevels.length >= 80) {
    for (const key of TREND_METRICS) {
      const windows: number[] = [];
      for (let start = 0; start + 40 <= rampLevels.length; start += 40) {
        const inWindow = new Set(rampLevels.slice(start, start + 40));
        windows.push(mean(rampRows.filter((row) => inWindow.has(row.level as number)).map((row) => row[key] as number)));
      }
      trendLines.push(`${key}: ${windows.map((value) => value.toFixed(0)).join(' -> ')}`);
      for (let index = 1; index < windows.length; index += 1) {
        if (windows[index]! < windows[index - 1]! * 0.9) {
          failures.push(`independent metric ${key} fell across 40-level windows: ${windows[index - 1]!.toFixed(1)} -> ${windows[index]!.toFixed(1)}`);
        }
      }
      if (windows[windows.length - 1]! <= windows[0]!) {
        failures.push(`independent metric ${key} does not rise overall: ${windows[0]!.toFixed(1)} -> ${windows[windows.length - 1]!.toFixed(1)}`);
      }
    }
  }

  const header = Object.keys(rows[0]!);
  const csv = [header.join(','), ...rows.map((row) => header.map((key) => {
    const value = row[key];
    return typeof value === 'number' ? Number(value.toFixed(3)) : String(value);
  }).join(','))].join('\n');
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${outDir}/ladder-report.csv`, `${csv}\n`);
    writeFileSync(`${outDir}/ladder-report.json`, JSON.stringify({
      levels, seeds: seedCount, saturationLevel: GEOMETRY_BUDGET_SATURATION_LEVEL, ceiling: GEOMETRY_BUDGET_CEILING, topTarget: GEOMETRY_BUDGET_TOP_TARGET, rows, deltas, trendLines, failures
    }, null, 2));
  }
  const worst = deltas.filter((d) => d.to === d.from + 1 && d.to < GEOMETRY_BUDGET_SATURATION_LEVEL && d.from >= 2);
  console.log(`levels ${levels.length}, seeds ${seedCount}, boards ${BOARDS.length}, saturation level ${GEOMETRY_BUDGET_SATURATION_LEVEL}, capacity ceiling ${GEOMETRY_BUDGET_CEILING}, top target ${GEOMETRY_BUDGET_TOP_TARGET}`);
  if (worst.length > 0) {
    console.log(`consecutive ramp pairs ${worst.length}: min worst-seed gap ${Math.min(...worst.map((d) => d.worstGap))}, min mean delta ${Math.min(...worst.map((d) => d.meanDelta)).toFixed(2)}, max mean delta ${Math.max(...worst.map((d) => d.meanDelta)).toFixed(2)}`);
  }
  trendLines.forEach((line) => console.log(`trend ${line}`));
  console.log(failures.length === 0 ? 'ladder assertions: PASS' : `ladder assertions: ${failures.length} FAIL\n${failures.slice(0, 20).join('\n')}`);
  if (assertMode && failures.length > 0) {
    process.exitCode = 1;
  }
  if (!outDir) {
    console.log(csv.split('\n').slice(0, 12).join('\n'));
  }
};

main();
