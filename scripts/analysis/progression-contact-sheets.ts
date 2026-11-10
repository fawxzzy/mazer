// Rendered contact sheets of dumped mazes (progression-maze-dump.ts): one PNG per
// (build, board, level) with the shortest route in blue, the cells that lie on a
// loop (a cycle that does not need a wrap) in orange, the ground the pull-to-goal
// explorer wanders into in grey, the start in green and the goal in gold.
//
//   npx vite-node --script scripts/analysis/progression-contact-sheets.ts \
//     --dump=<dump.json> --out=<dir> --tag=before [--levels=2,10,25,50,100,150,198,268] [--seed=auto|0..]
//
// --seed=auto (default) picks, per level and board, the first seed index whose maze
// has a loop when the build carves any (so the sheet shows what loops look like),
// otherwise seed 0. A fixed index renders the same seed in both builds.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { composeSheet, encodePng, rasterizeMaze } from './lib/mazePng';
import { describeMazeStructure } from './lib/mazeGauges';
import type { DumpedMaze } from './progression-maze-dump';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const dump = JSON.parse(readFileSync(arg('dump', ''), 'utf8')) as { records: DumpedMaze[] };
const outDir = arg('out', 'tmp/out');
const tag = arg('tag', 'build');
const levels = arg('levels', '2,10,25,50,100,150,198,268').split(',').map(Number);
const seedArg = arg('seed', 'auto');
const tile = Number(arg('tile', '6'));
mkdirSync(outDir, { recursive: true });

for (const board of ['phone', 'desktop']) {
  const images = levels.map((level) => {
    const candidates = dump.records.filter((record) => record.board === board && record.level === level);
    let chosen = candidates.find((record) => record.seedIndex === 0) ?? candidates[0]!;
    if (seedArg === 'auto') {
      const withLoop = candidates.find((record) => {
        const structure = describeMazeStructure(record);
        return structure.cycleCells.size > 0;
      });
      chosen = withLoop ?? chosen;
    } else {
      chosen = candidates.find((record) => record.seedIndex === Number(seedArg)) ?? chosen;
    }
    const structure = describeMazeStructure(chosen);
    const loops = new Set<number>([...structure.cycleCells].filter((cell) => !structure.route.has(cell) || true));
    return rasterizeMaze(
      { width: chosen.width, height: chosen.height, grid: chosen.rows.map((row) => [...row].map((c) => c === '1')), start: chosen.start, goal: chosen.goal },
      { tile, route: structure.route, loops, visited: structure.explorerVisited }
    );
  });
  const sheet = composeSheet(images, levels.length, 8);
  const path = `${outDir}/${tag}-${board}.png`;
  writeFileSync(path, encodePng(sheet));
  console.log(`wrote ${path} (${levels.join(', ')})`);
}
