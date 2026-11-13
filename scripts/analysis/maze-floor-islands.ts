// MAZER-GEN-005 measurement: how many generated ladder mazes carry floor tiles the start cannot reach.
// Deterministic (fixed seed list, no clock in the numbers). Usage:
//   npx vite-node --script scripts/analysis/maze-floor-islands.ts [--seeds=4] [--step=1] [--max-level=300] [--mode=play|menu]
import { LADDER_BOARDS, generateLadderMaze, seedForIndex } from './lib/progressionLadderSampling';
import { findFloorIslands } from '../../src/legacy-runtime/legacyMazeIslands';

const arg = (name: string, fallback: number): number => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit === undefined ? fallback : Number(hit.split('=')[1]);
};
const seeds = arg('seeds', 4);
const step = arg('step', 1);
const maxLevel = arg('max-level', 300);
const mode = process.argv.includes('--mode=menu') ? 'menu' : 'play';
// --levels=2,3,10,... overrides the 1..max-level sweep (the MAZER-GEN-006 property-test level list is the
// "about 6 percent" sample named on the board card).
const levelsArg = process.argv.find((value) => value.startsWith('--levels='));
const levels = levelsArg === undefined
  ? Array.from({ length: Math.ceil(maxLevel / step) }, (_, i) => 1 + (i * step)).filter((level) => level <= maxLevel)
  : levelsArg.split('=')[1]!.split(',').map(Number);

let total = 0;
let withIslands = 0;
let islandCellsTotal = 0;
let planarWithIslands = 0;
const byBoard: Record<string, { total: number; bad: number }> = {};
const byBand: Record<string, { total: number; bad: number }> = {};
const examples: string[] = [];
const sizeHistogram: Record<number, number> = {};
const bandOf = (level: number): string => (level === 1 ? '1' : (level > 300 ? '301+' : `${Math.floor((level - 2) / 50) * 50 + 2}-${Math.floor((level - 2) / 50) * 50 + 51}`));
for (const board of LADDER_BOARDS) {
  byBoard[board.name] = { total: 0, bad: 0 };
  for (const level of levels) {
    for (let index = 0; index < seeds; index += 1) {
      const seed = seedForIndex(index);
      const maze = generateLadderMaze(level, board, seed, mode);
      const report = findFloorIslands(maze);
      total += 1;
      if (findFloorIslands(maze, false).islands.length > 0) { planarWithIslands += 1; }
      byBoard[board.name]!.total += 1;
      const band = (byBand[bandOf(level)] ??= { total: 0, bad: 0 });
      band.total += 1;
      if (report.islands.length > 0) {
        withIslands += 1;
        byBoard[board.name]!.bad += 1;
        band.bad += 1;
        islandCellsTotal += report.islandCells;
        for (const island of report.islands) { sizeHistogram[island.cells.length] = (sizeHistogram[island.cells.length] ?? 0) + 1; }
        if (examples.length < 12) {
          examples.push(`${board.name} level ${level} seed ${seed} ${maze.width}x${maze.height}: ${report.islands.map((i) => `${i.cells.length} cells @ (${i.cells[0]!.x},${i.cells[0]!.y})`).join('; ')}`);
        }
      }
    }
  }
}
const pct = (a: number, b: number): string => (b === 0 ? '0' : ((a / b) * 100).toFixed(2));
console.log(`planar view (wrap links ignored, analysis only): ${planarWithIslands}/${total} = ${pct(planarWithIslands, total)}%`);
console.log(`mode=${mode} mazes=${total} withIslands=${withIslands} rate=${pct(withIslands, total)}% islandCells=${islandCellsTotal}`);
for (const [name, row] of Object.entries(byBoard)) { console.log(`  board ${name}: ${row.bad}/${row.total} = ${pct(row.bad, row.total)}%`); }
for (const [name, row] of Object.entries(byBand)) { console.log(`  levels ${name}: ${row.bad}/${row.total} = ${pct(row.bad, row.total)}%`); }
console.log(`  island size histogram (cells: count): ${JSON.stringify(sizeHistogram)}`);
examples.forEach((line) => console.log(`  e.g. ${line}`));
if (withIslands > 0 && process.argv.includes('--assert')) { process.exitCode = 1; }
