// Shard placement sweep: every level from the Shard intro to `--to`, on the board a player really gets
// (lib/shardPlacementSweep.ts mirrors MenuScene's play-start job and its hazard install), lists the levels
// whose shards do not place (`failed`: the run then ships without shards, so the level loses its objective).
//
//   npx vite-node --script scripts/analysis/shard-placement-sweep.ts -- [--from=<level>] [--to=1000] [--seeds=2]
//     [--boards=phone,desktop] [--workers=4] [--out=<file.json>] [--assert]
//
// `--workers` > 1 runs disjoint level slices in child processes (each child is this script with `--part=i/n`).
// `--assert` exits 1 when any (level, board, seed) did not place. Seeds are fixed per (level, board, index),
// so a run is reproducible.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GEOMETRY_BUDGET_SATURATION_LEVEL } from '../../src/legacy-runtime/legacyGeometryBudget';
import {
  SHARD_SWEEP_VIEWPORTS,
  shardSweepFirstLevel,
  shardSweepSeed,
  sweepShardLevel,
  type ShardSweepRow
} from './lib/shardPlacementSweep';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const saturationLevel = (): number => GEOMETRY_BUDGET_SATURATION_LEVEL;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) / 2)]!;
};
const quantile = (values: readonly number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};

const runSlice = (levels: readonly number[], boardNames: readonly string[], seeds: number): ShardSweepRow[] => {
  const rows: ShardSweepRow[] = [];
  for (const level of levels) {
    for (const [boardIndex, viewport] of SHARD_SWEEP_VIEWPORTS.entries()) {
      if (!boardNames.includes(viewport.name)) continue;
      for (let index = 0; index < seeds; index += 1) {
        rows.push(sweepShardLevel(level, viewport, shardSweepSeed(level, boardIndex, index)));
      }
    }
  }
  return rows;
};

const runChildren = async (workers: number, passArgs: readonly string[], tmpDir: string): Promise<ShardSweepRow[]> => {
  const self = fileURLToPath(import.meta.url);
  mkdirSync(tmpDir, { recursive: true });
  const parts = Array.from({ length: workers }, (_, part) => join(tmpDir, `part-${part}.json`));
  await Promise.all(parts.map((out, part) => new Promise<void>((done, fail) => {
    const child = spawn('npx', ['vite-node', '--script', self, '--', ...passArgs, `--part=${part}/${workers}`, `--out=${out}`, '--quiet'], {
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: process.platform === 'win32'
    });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`sweep part ${part} exited ${String(code)}`))));
  })));
  const rows = parts.flatMap((out) => (JSON.parse(readFileSync(out, 'utf8')) as { rows: ShardSweepRow[] }).rows);
  rmSync(tmpDir, { recursive: true, force: true });
  return rows;
};

const main = async (): Promise<void> => {
  const from = Number(arg('from', String(shardSweepFirstLevel())));
  const to = Number(arg('to', '1000'));
  const seeds = Number(arg('seeds', '2'));
  const boardNames = arg('boards', SHARD_SWEEP_VIEWPORTS.map((board) => board.name).join(',')).split(',');
  const workers = Math.max(1, Number(arg('workers', '1')));
  const part = arg('part', '');
  const out = arg('out', '');
  const quiet = process.argv.includes('--quiet');
  const levels: number[] = [];
  for (let level = from; level <= to; level += 1) levels.push(level);

  let rows: ShardSweepRow[];
  if (part !== '') {
    const [index, count] = part.split('/').map(Number) as [number, number];
    rows = runSlice(levels.filter((_, i) => i % count === index), boardNames, seeds);
  } else if (workers > 1) {
    const tmpDir = resolve('tmp', `shard-sweep-parts-${process.pid}`);
    rows = await runChildren(workers, [`--from=${from}`, `--to=${to}`, `--seeds=${seeds}`, `--boards=${boardNames.join(',')}`], tmpDir);
  } else {
    rows = runSlice(levels, boardNames, seeds);
  }
  rows.sort((a, b) => a.level - b.level || a.board.localeCompare(b.board) || a.seed - b.seed);

  const failed = rows.filter((row) => row.status !== 'placed');
  if (out !== '') {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({ from, to, seeds, boards: boardNames, rows }, null, 2)}\n`);
  }
  if (quiet) return;

  const failedLevels = [...new Set(failed.map((row) => row.level))];
  const reasons = new Map<string, number>();
  for (const row of failed) {
    const reason = row.rejections[row.rejections.length - 1] ?? 'threw';
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const ms = rows.map((row) => row.computeMs);
  console.log(`shard placement sweep L${from}..L${to}, boards ${boardNames.join('+')}, ${seeds} seed(s) each: ${rows.length} runs, `
    + `${rows.length - failed.length} placed, ${failed.length} failed on ${failedLevels.length} level(s)`);
  const strictRows = rows.filter((row) => row.level >= saturationLevel() && row.status === 'placed');
  const nearest = strictRows.filter((row) => !row.inBand);
  if (strictRows.length > 0) {
    console.log(`strict levels (L${saturationLevel()}+): ${strictRows.length - nearest.length} placed in the route band, `
      + `${nearest.length} placed on the nearest route (band missed on that base)`);
  }
  console.log(`install ms: median ${median(ms)} p95 ${quantile(ms, 0.95)} worst ${Math.max(0, ...ms)}`);
  if (failed.length > 0) {
    console.log(`last rejection of failed runs: ${[...reasons].map(([reason, count]) => `${reason} x${count}`).join(', ')}`);
    // Compress consecutive failing levels into ranges for the report.
    const ranges: string[] = [];
    for (let i = 0; i < failedLevels.length; i += 1) {
      let j = i;
      while (j + 1 < failedLevels.length && failedLevels[j + 1] === failedLevels[j]! + 1) j += 1;
      ranges.push(i === j ? `L${failedLevels[i]}` : `L${failedLevels[i]}-L${failedLevels[j]}`);
      i = j;
    }
    console.log(`failing levels: ${ranges.join(', ')}`);
  }
  console.log(failed.length === 0 ? 'shard placement sweep: PASS' : 'shard placement sweep: FAIL');
  if (process.argv.includes('--assert') && failed.length > 0) process.exit(1);
};

void main();
