// Slice H2: census of the hazard generation overlay over the shipped ladder (both boards).
//
//   npx vite-node --script scripts/analysis/hazard-overlay-census.ts -- [--from=10] [--to=300] [--step=1] [--seeds=2] [--felt=1]
//     [--boards=phone,desktop,square] [--out=<file.json>]
//
// `square` (aspect 1:1) is not a shipped board; it is an off-ladder probe for the roadmap's third aspect.
//
// For every (level, board, seed) it generates the shipped maze, deep-freezes it, runs the overlay and checks with its
// own measurement code that the maze is unchanged (fingerprint, openings and, with --felt=1, the felt number). It
// reports the overlay time (graph build + allocation + placement + verdict + escape slack, node at 1x) as median /
// p95 / worst per board against the H2 budget (25 ms median / 80 ms worst), plus status and degrade-reason counts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { resolveLegacyHazardOverlay } from '../../src/legacy-runtime/legacyHazardOverlay';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import { measureFelt } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { LADDER_BOARDS, generateLadderMaze, hashLadderMaze, seedForIndex } from './lib/progressionLadderSampling';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

export const H2_BUDGET_MEDIAN_MS = 25;
export const H2_BUDGET_WORST_MS = 80;

export interface HazardOverlayCensusRow {
  readonly level: number;
  readonly board: string;
  readonly seedIndex: number;
  readonly width: number;
  readonly height: number;
  readonly status: string;
  readonly gates: number;
  readonly sentries: number;
  readonly allocatedGates: number;
  readonly allocatedSentries: number;
  readonly reasons: readonly string[];
  readonly escapeSlack: number | null;
  readonly witnessTicks: number | null;
  readonly digest: string;
  readonly mazeUnchanged: boolean;
  readonly ms: number;
}

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
};

export const countOpenings = (maze: Pick<LegacyMazeSnapshot, 'grid' | 'width' | 'height'>): number => {
  let count = 0;
  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      if ((x === 0 || y === 0 || x === maze.width - 1 || y === maze.height - 1) && maze.grid[y]![x] === true) { count += 1; }
    }
  }
  return count;
};

type CensusBoard = { readonly name: string; readonly aspectRatio: number };
export const CENSUS_BOARDS: readonly CensusBoard[] = [...LADDER_BOARDS, { name: 'square', aspectRatio: 1 }];

const quantile = (values: readonly number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};

export const runCensus = (options: {
  from: number; to: number; step: number; seeds: number; felt: boolean; boards?: readonly CensusBoard[];
}): HazardOverlayCensusRow[] => {
  const boards = options.boards ?? LADDER_BOARDS;
  const rows: HazardOverlayCensusRow[] = [];
  // Warm-up so JIT compilation is not billed to the first level.
  const warm = generateLadderMaze(40, LADDER_BOARDS[0], seedForIndex(0));
  for (let i = 0; i < 3; i += 1) { resolveLegacyHazardOverlay(warm, { enabled: true, level: 40 }); }
  for (let level = options.from; level <= options.to; level += options.step) {
    for (const board of boards) {
      for (let seedIndex = 0; seedIndex < options.seeds; seedIndex += 1) {
        const maze = generateLadderMaze(level, board as typeof LADDER_BOARDS[number], seedForIndex(seedIndex)) as LegacyMazeSnapshot;
        const hashBefore = hashLadderMaze(maze);
        const openingsBefore = countOpenings(maze);
        const feltBefore = options.felt ? JSON.stringify(measureFelt(maze)) : '';
        deepFreeze(maze);
        const begin = performance.now();
        const overlay = resolveLegacyHazardOverlay(maze, { enabled: true, level });
        const ms = performance.now() - begin;
        if (overlay === null) { throw new Error('enabled overlay returned null'); }
        const mazeUnchanged = hashLadderMaze(maze) === hashBefore
          && countOpenings(maze) === openingsBefore
          && (!options.felt || JSON.stringify(measureFelt(maze)) === feltBefore);
        rows.push({
          level,
          board: board.name,
          seedIndex,
          width: maze.width,
          height: maze.height,
          status: overlay.status,
          gates: overlay.specs.filter((spec) => spec.kind === 'timedGate').length,
          sentries: overlay.specs.filter((spec) => spec.kind === 'patrol').length,
          allocatedGates: overlay.allocation.gates,
          allocatedSentries: overlay.allocation.sentries,
          reasons: overlay.degradeReasons.map((reason) => reason.code),
          escapeSlack: overlay.escapeSlack?.ratio ?? null,
          witnessTicks: overlay.verdict?.witness?.ticks ?? null,
          digest: overlay.digest,
          mazeUnchanged,
          ms: Math.round(ms * 100) / 100
        });
      }
    }
  }
  return rows;
};

export const summarize = (rows: readonly HazardOverlayCensusRow[]): string => {
  const lines: string[] = [];
  lines.push('| board | runs | median ms | p95 ms | worst ms (level) | full | degraded | none | maze changed |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const board of CENSUS_BOARDS) {
    const subset = rows.filter((row) => row.board === board.name);
    if (subset.length === 0) { continue; }
    const worst = subset.reduce((best, row) => (row.ms > best.ms ? row : best));
    const count = (status: string): number => subset.filter((row) => row.status === status).length;
    lines.push(`| ${board.name} | ${subset.length} | ${quantile(subset.map((row) => row.ms), 0.5).toFixed(2)} | `
      + `${quantile(subset.map((row) => row.ms), 0.95).toFixed(2)} | ${worst.ms.toFixed(2)} (L${worst.level}) | `
      + `${count('full')} | ${count('degraded')} | ${count('none')} | ${subset.filter((row) => !row.mazeUnchanged).length} |`);
  }
  const reasonCounts = new Map<string, number>();
  for (const row of rows) {
    for (const reason of new Set(row.reasons)) { reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1); }
  }
  lines.push('');
  lines.push(`degrade reasons (runs carrying each): ${[...reasonCounts.entries()].map(([code, n]) => `${code}=${n}`).join(', ') || 'none'}`);
  const slack = rows.map((row) => row.escapeSlack).filter((value): value is number => value !== null);
  lines.push(`escape slack: min ${slack.length ? Math.min(...slack).toFixed(4) : 'n/a'} over ${slack.length} runs with hazards`);
  const all = rows.map((row) => row.ms);
  const median = quantile(all, 0.5);
  const worst = Math.max(...all);
  lines.push(`overall: median ${median.toFixed(2)} ms, worst ${worst.toFixed(2)} ms; budget ${H2_BUDGET_MEDIAN_MS} / ${H2_BUDGET_WORST_MS} ms -> `
    + `${median <= H2_BUDGET_MEDIAN_MS && worst <= H2_BUDGET_WORST_MS ? 'WITHIN' : 'OVER'}`);
  return lines.join('\n');
};

const isMain = process.argv.some((value) => value.endsWith('hazard-overlay-census.ts'));
if (isMain) {
  const rows = runCensus({
    from: Number(arg('from', '10')),
    to: Number(arg('to', '300')),
    step: Number(arg('step', '1')),
    seeds: Number(arg('seeds', '2')),
    felt: arg('felt', '0') === '1',
    boards: arg('boards', 'phone,desktop').split(',').map((name) => {
      const board = CENSUS_BOARDS.find((entry) => entry.name === name);
      if (!board) { throw new Error(`unknown board ${name}`); }
      return board;
    })
  });
  console.log(summarize(rows));
  const out = arg('out', '');
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(rows, null, 2)}\n`);
    console.log(`wrote ${rows.length} rows to ${out}`);
  }
}
