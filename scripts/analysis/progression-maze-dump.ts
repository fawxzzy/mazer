// Dumps the mazes the real progression path generates, for the gauge suite
// (progression-gauges.ts). This is the ONLY tree-specific half of the before/after
// comparison: run it once per checkout (baseline main, and the branch under test),
// then feed both dumps to the gauges, which are tree-independent.
//
//   npx vite-node --script scripts/analysis/progression-maze-dump.ts \
//     --out=<file.json> [--levels=1..300] [--seeds=6] [--mode=play|menu]
//
// One record per (board, level, seed): the floor grid as strings, start, goal,
// the generator's solution path length and the generation wall time (ms).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import { LADDER_BOARDS, seedForIndex, trackForLevel } from './lib/progressionLadderSampling';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const parseLevels = (spec: string): number[] => {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const range = /^(\d+)\.\.(\d+)$/.exec(part);
    if (range) {
      for (let level = Number(range[1]); level <= Number(range[2]); level += 1) { out.add(level); }
    } else if (/^\d+$/.test(part)) {
      out.add(Number(part));
    }
  }
  return [...out].sort((a, b) => a - b);
};

export interface DumpedMaze {
  board: string;
  level: number;
  seedIndex: number;
  width: number;
  height: number;
  rows: string[];
  start: { x: number; y: number };
  goal: { x: number; y: number };
  solutionLength: number;
  genMs: number;
  // Present only on trees that carve loops; steps the loops give back to a map-knower.
  loopStats: { shortcuts: number; alternates: number; decoys: number; cells: number; saved: number } | null;
  // Present only on trees that price wraps; the wrap rungs the maze was built with and the
  // steps they give back to a map-knower.
  wrapStats: { rungs: number; saved: number } | null;
  // Present only on trees that carry the fringe (levels past the felt saturation): the
  // zero-felt-cost side-stub cells of the maze.
  fringeCells?: number;
}

const levels = parseLevels(arg('levels', '1..300'));
const seeds = Number(arg('seeds', '6'));
const mode = arg('mode', 'play') === 'menu' ? 'menu' : 'play';
const out = arg('out', 'tmp/dump.json');
const records: DumpedMaze[] = [];
for (const level of levels) {
  for (const board of LADDER_BOARDS) {
    for (let index = 0; index < seeds; index += 1) {
      const profile = resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level));
      const started = performance.now();
      const maze = createLegacyRuntimeMazeForMode(mode, 35, seedForIndex(index), profile, {}, board.aspectRatio);
      const genMs = performance.now() - started;
      records.push({
        board: board.name,
        level,
        seedIndex: index,
        width: maze.width,
        height: maze.height,
        rows: maze.grid.map((row) => row.map((cell) => (cell ? '1' : '0')).join('')),
        start: { x: maze.start.x, y: maze.start.y },
        goal: { x: maze.goal.x, y: maze.goal.y },
        solutionLength: maze.solutionPath.length - 1,
        genMs,
        loopStats: ((maze as { loopStats?: DumpedMaze['loopStats'] }).loopStats) ?? null,
        wrapStats: ((maze as { wrapStats?: DumpedMaze['wrapStats'] }).wrapStats) ?? null,
        fringeCells: (maze as { fringeStats?: { cells: number } }).fringeStats?.cells ?? 0
      });
    }
  }
  if (level % 25 === 0) { console.log(`level ${level}/${levels[levels.length - 1]}`); }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ mode, seeds, levels, records }));
console.log(`wrote ${records.length} mazes to ${out}`);
