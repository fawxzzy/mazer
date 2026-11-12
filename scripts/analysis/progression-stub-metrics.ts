// Before/after metrics for the one-tile stub rule (MAZER-GEN-004). Dumps per-maze structure metrics for a
// set of levels and seeds to a JSON file; run it on two commits and compare the two files with --compare.
//   npx vite-node --script scripts/analysis/progression-stub-metrics.ts --out=<file> [--seeds=30] [--levels=2,20,...]
//   npx vite-node --script scripts/analysis/progression-stub-metrics.ts --compare=<before.json>,<after.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { LADDER_BOARDS, generateLadderMaze, hashLadderMaze, seedForIndex } from './lib/progressionLadderSampling';
import { analyzeMazeDifficulty } from '../../src/legacy-runtime/legacyMazeDifficultyMetrics';
import { measureFelt } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { collectDeadEndBranches, countOpenNeighbors } from '../../src/legacy-runtime/legacyMazeStubs';

const arg = (name: string, fallback = ''): string => (
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
);

interface Row {
  level: number; board: string; seed: number; hash: string; cells: string;
  floor: number; deadEnds: number; junctions: number; longestBranch: number; loops: number;
  route: number; felt: number; decisions: number; astar: number; greedy: number; branching: number;
}

const measure = (level: number, board: typeof LADDER_BOARDS[number], seed: number): Row => {
  const maze = generateLadderMaze(level, board, seed);
  const branches = collectDeadEndBranches(maze);
  let floor = 0; let junctions = 0; let degreeSum = 0;
  let edges = 0;
  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      if (!maze.grid[y]![x]) { continue; }
      floor += 1;
      const degree = countOpenNeighbors(maze, x, y);
      degreeSum += degree; edges += degree;
      if (degree >= 3) { junctions += 1; }
    }
  }
  const metrics = analyzeMazeDifficulty(maze);
  return {
    level, board: board.name, seed, hash: hashLadderMaze(maze),
    cells: maze.grid.map((row) => row.map((cell) => (cell ? '1' : '0')).join('')).join('|'),
    floor, deadEnds: branches.length, junctions,
    longestBranch: Math.max(0, ...branches.map((branch) => branch.length)),
    loops: (edges / 2) - floor + 1,
    route: metrics.routeLength, felt: measureFelt(maze).steps, decisions: metrics.decisionPoints,
    astar: metrics.astarExpansions, greedy: metrics.greedySearchCells, branching: degreeSum / Math.max(1, floor)
  };
};

const compare = (beforePath: string, afterPath: string): void => {
  const before = JSON.parse(readFileSync(beforePath, 'utf8')) as Row[];
  const after = JSON.parse(readFileSync(afterPath, 'utf8')) as Row[];
  const keys = ['floor', 'deadEnds', 'junctions', 'longestBranch', 'loops', 'route', 'felt', 'decisions', 'astar', 'greedy', 'branching'] as const;
  const groups = new Map<string, { b: Row[]; a: Row[] }>();
  before.forEach((row, index) => {
    const key = `${String(row.level).padStart(4)} ${row.board}`;
    const group = groups.get(key) ?? { b: [], a: [] };
    group.b.push(row); group.a.push(after[index]!);
    groups.set(key, group);
  });
  console.log('level board   same%  cellsChanged(mean)  | metric: before -> after (means)');
  for (const [key, { b, a }] of groups) {
    const mean = (rows: Row[], k: typeof keys[number]): number => rows.reduce((sum, row) => sum + row[k], 0) / rows.length;
    const same = b.filter((row, index) => row.hash === a[index]!.hash).length;
    let changedCells = 0;
    b.forEach((row, index) => { for (let i = 0; i < row.cells.length; i += 1) { if (row.cells[i] !== a[index]!.cells[i]) { changedCells += 1; } } });
    console.log(`${key}  ${(100 * same / b.length).toFixed(0).padStart(3)}%  ${(changedCells / b.length).toFixed(1).padStart(6)}   | ${keys.map((k) => `${k} ${mean(b, k).toFixed(1)}->${mean(a, k).toFixed(1)}`).join('  ')}`);
  }
};

if (arg('compare')) {
  const [beforePath, afterPath] = arg('compare').split(',');
  compare(beforePath!, afterPath!);
} else {
  const seeds = Number(arg('seeds', '30'));
  const levels = arg('levels', '2,20,50,100,150,198,200,218,268,300').split(',').map(Number);
  const rows: Row[] = [];
  for (const level of levels) {
    for (const board of LADDER_BOARDS) {
      for (let index = 0; index < seeds; index += 1) { rows.push(measure(level, board, seedForIndex(index))); }
    }
  }
  writeFileSync(arg('out', 'stub-metrics.json'), JSON.stringify(rows));
  console.log(`wrote ${rows.length} rows`);
}
