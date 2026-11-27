// Slice H8: the shard runway, from geometry saturation to L2000 (both shipped boards).
//
//   npx vite-node --script scripts/analysis/shard-runway.ts -- [--assert] [--to=2000] [--stride=50] [--run=6]
//     [--saturation=<level>] [--boards=phone,desktop] [--out=<file.json>]
//
// 1. Schedule (every level, saturation..to): the shard route target rises strictly, consecutive bands never overlap
//    (target(L + 1) > target(L) + SHARD_ROUTE_BAND), the shard count equals the allocator and never drops.
// 2. Realized routes (sampled levels: saturation, a run of `--run` consecutive levels, every `--stride`, both edges of
//    each 50-level shard block, `--to`): the shipped maze per board, the H2 overlay on it, then `computeShardLayer`.
//    A failed base is retried with the next seed (emulating the contract's reject-and-try-next-base loop); the bases
//    needed must stay within GEOMETRY_BUDGET_BASE_CANDIDATES. The witness ticks of each shipped route must land in its
//    band, and the shard detour (witness ticks minus the maze's own static start -> star distance; the band is anchored
//    there since 2026-11-27) must rise strictly from one sampled level to the next on the same board.
// 3. Cost: the shard verdict (`validateShardRoute`, timed again on the shipped shards) median must be at most
//    2x the H5 budget (2 x 40 ms). Placement (layer) time is reported, not gated.
//
// `--assert` exits 1 on any failure. The saturation used is the baked GEOMETRY_BUDGET_SATURATION_LEVEL unless
// `--saturation` overrides it (PROG-020 S3 may move it; the shard core takes it as a parameter).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  GEOMETRY_BUDGET_BASE_CANDIDATES,
  GEOMETRY_BUDGET_FELT_SATURATION_LEVEL,
  GEOMETRY_BUDGET_SATURATION_LEVEL
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { createLegacyMazeHazardGraph } from '../../src/legacy-runtime/legacyHazardGraphAdapter';
import { resolveLegacyHazardOverlay } from '../../src/legacy-runtime/legacyHazardOverlay';
import {
  HAZARD_SHARD_GROWTH_LEVELS,
  SHARD_ROUTE_BAND,
  allocateHazardUnits,
  computeShardLayer,
  resolveShardRoutePlan,
  shardFloorDistances,
  validateShardRoute
} from '../../src/mazer-core/hazards';
import { LADDER_BOARDS, generateLadderMaze, seedForIndex } from './lib/progressionLadderSampling';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

/** H5 joint verdict budget (product contract roadmap H5: under 40 ms median). */
export const H5_BUDGET_MEDIAN_MS = 40;
export const SHARD_VERDICT_BUDGET_MEDIAN_MS = 2 * H5_BUDGET_MEDIAN_MS;

export interface ShardRunwayRow {
  readonly level: number;
  readonly board: string;
  readonly shards: number;
  readonly target: number;
  readonly basesTried: number;
  readonly status: 'placed' | 'failed';
  readonly routeTicks: number | null;
  /** routeTicks minus the maze's own static start -> star distance. */
  readonly detour: number | null;
  readonly tour: number | null;
  readonly inBand: boolean;
  readonly escapeSlack: number | null;
  readonly productStates: number | null;
  readonly verdictMs: number | null;
  readonly layerMs: number;
}

export const checkShardSchedule = (saturationLevel: number, to: number): string[] => {
  const failures: string[] = [];
  let previous = resolveShardRoutePlan(saturationLevel, { saturationLevel });
  for (let level = saturationLevel + 1; level <= to; level += 1) {
    const plan = resolveShardRoutePlan(level, { saturationLevel });
    const shards = allocateHazardUnits(level, { saturationLevel }).shards;
    if (plan.target === null || previous.target === null) failures.push(`L${level}: no target`);
    else if (plan.target <= previous.target + SHARD_ROUTE_BAND) failures.push(`L${level}: target ${plan.target} overlaps L${level - 1} band`);
    if (plan.count !== shards) failures.push(`L${level}: count ${plan.count} != allocator ${shards}`);
    if (plan.count < previous.count) failures.push(`L${level}: shard count dropped`);
    previous = plan;
  }
  return failures;
};

export const resolveRunwayLevels = (saturationLevel: number, to: number, stride: number, run: number): number[] => {
  const levels = new Set<number>([saturationLevel, to]);
  for (let i = 1; i < run; i += 1) levels.add(saturationLevel + i);
  for (let level = saturationLevel; level <= to; level += stride) levels.add(level);
  for (let edge = saturationLevel + HAZARD_SHARD_GROWTH_LEVELS; edge <= to; edge += HAZARD_SHARD_GROWTH_LEVELS) {
    levels.add(edge - 1);
    levels.add(edge);
  }
  return [...levels].filter((level) => level >= saturationLevel && level <= to).sort((a, b) => a - b);
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) / 2)]!;
};
const quantile = (values: readonly number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};

export const runShardRunwayLevel = (level: number, board: (typeof LADDER_BOARDS)[number], saturationLevel: number): ShardRunwayRow => {
  const plan = resolveShardRoutePlan(level, { saturationLevel });
  let layerMs = 0;
  for (let base = 0; base < GEOMETRY_BUDGET_BASE_CANDIDATES; base += 1) {
    const maze = generateLadderMaze(level, board, seedForIndex(level * 1000 + base));
    const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
    const overlay = resolveLegacyHazardOverlay(maze, { enabled: true, level });
    const specs = overlay?.specs ?? [];
    const t0 = performance.now();
    const layer = computeShardLayer(graph, { start, goal, mazeSeed: maze.seed, level, saturationLevel, specs });
    layerMs += performance.now() - t0;
    if (layer.status !== 'placed') continue;
    const v0 = performance.now();
    const verdict = validateShardRoute(graph, specs, { start, goal, shards: layer.shards });
    const verdictMs = performance.now() - v0;
    const ticks = verdict.witness?.ticks ?? null;
    return {
      level,
      board: board.name,
      shards: layer.shards.length,
      target: plan.target ?? -1,
      basesTried: base + 1,
      status: 'placed',
      routeTicks: ticks,
      detour: ticks === null ? null : ticks - shardFloorDistances(graph, start)[goal]!,
      tour: layer.tour,
      inBand: ticks !== null && layer.band !== null && ticks >= layer.band.min && ticks <= layer.band.max && ticks === layer.routeTicks,
      escapeSlack: layer.escapeSlack?.ratio ?? null,
      productStates: verdict.productStates,
      verdictMs,
      layerMs
    };
  }
  return {
    level,
    board: board.name,
    shards: plan.count,
    target: plan.target ?? -1,
    basesTried: GEOMETRY_BUDGET_BASE_CANDIDATES,
    status: 'failed',
    routeTicks: null,
    detour: null,
    tour: null,
    inBand: false,
    escapeSlack: null,
    productStates: null,
    verdictMs: null,
    layerMs
  };
};

const main = (): void => {
  const saturationLevel = Number(arg('saturation', String(GEOMETRY_BUDGET_SATURATION_LEVEL)));
  const to = Number(arg('to', '2000'));
  const stride = Number(arg('stride', '50'));
  const run = Number(arg('run', '6'));
  const boardNames = arg('boards', LADDER_BOARDS.map((board) => board.name).join(',')).split(',');
  const boards = LADDER_BOARDS.filter((board) => boardNames.includes(board.name));
  const assert = process.argv.includes('--assert');
  const failures: string[] = [];

  console.log(`saturation: ${saturationLevel} (baked GEOMETRY_BUDGET_SATURATION_LEVEL ${GEOMETRY_BUDGET_SATURATION_LEVEL}, felt ${GEOMETRY_BUDGET_FELT_SATURATION_LEVEL})`);
  const scheduleFailures = checkShardSchedule(saturationLevel, to);
  const first = resolveShardRoutePlan(saturationLevel, { saturationLevel });
  const last = resolveShardRoutePlan(to, { saturationLevel });
  console.log(`schedule L${saturationLevel}..L${to}: target ${first.target} -> ${last.target} ticks, shards ${first.count} -> ${last.count}, `
    + `strict rise every level: ${scheduleFailures.length === 0 ? 'yes' : `NO (${scheduleFailures.length})`}`);
  failures.push(...scheduleFailures.slice(0, 5));

  // Warm-up so JIT compilation is not billed to the first level.
  runShardRunwayLevel(saturationLevel, boards[0]!, saturationLevel);

  const rows: ShardRunwayRow[] = [];
  const levels = resolveRunwayLevels(saturationLevel, to, stride, run);
  for (const board of boards) {
    let previous: ShardRunwayRow | null = null;
    for (const level of levels) {
      const row = runShardRunwayLevel(level, board, saturationLevel);
      rows.push(row);
      console.log(`L${level} ${board.name}: k ${row.shards} target ${row.target} -> ${row.status} ticks ${String(row.routeTicks)} detour ${String(row.detour)} `
        + `bases ${row.basesTried} slack ${String(row.escapeSlack)} verdict ${row.verdictMs?.toFixed(1) ?? '-'} ms layer ${row.layerMs.toFixed(0)} ms`);
      if (row.status !== 'placed') failures.push(`L${level} ${board.name}: no base out of ${GEOMETRY_BUDGET_BASE_CANDIDATES} placed shards`);
      else if (!row.inBand) failures.push(`L${level} ${board.name}: route ${String(row.routeTicks)} outside its band`);
      if (previous?.detour != null && row.detour !== null && row.detour <= previous.detour) {
        failures.push(`L${level} ${board.name}: shard detour ${row.detour} does not exceed L${previous.level} (${previous.detour})`);
      }
      previous = row;
    }
  }

  const verdicts = rows.flatMap((row) => (row.verdictMs === null ? [] : [row.verdictMs]));
  const verdictMedian = median(verdicts);
  const bases = rows.map((row) => row.basesTried);
  console.log(`verdict ms: median ${verdictMedian.toFixed(1)} p95 ${quantile(verdicts, 0.95).toFixed(1)} worst ${Math.max(0, ...verdicts).toFixed(1)} `
    + `(budget median ${SHARD_VERDICT_BUDGET_MEDIAN_MS}); layer ms median ${median(rows.map((row) => row.layerMs)).toFixed(0)}; `
    + `bases median ${median(bases)} worst ${Math.max(0, ...bases)} of ${GEOMETRY_BUDGET_BASE_CANDIDATES}; product states worst `
    + `${Math.max(0, ...rows.map((row) => row.productStates ?? 0))}`);
  if (verdictMedian > SHARD_VERDICT_BUDGET_MEDIAN_MS) failures.push(`verdict median ${verdictMedian.toFixed(1)} ms > ${SHARD_VERDICT_BUDGET_MEDIAN_MS} ms`);

  const out = arg('out', '');
  if (out !== '') {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({ saturationLevel, to, levels, rows, failures }, null, 2)}\n`);
  }
  console.log(failures.length === 0 ? 'shard runway: PASS' : `shard runway: ${failures.length} failure(s)\n  ${failures.join('\n  ')}`);
  if (assert && failures.length > 0) process.exit(1);
};

main();
