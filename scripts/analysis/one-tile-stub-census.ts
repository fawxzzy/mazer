// Headless census of one-tile jut-outs (nubs) in generated mazes, both profiles (MAZER-GEN-006 follow-up).
//   npx vite-node --script scripts/analysis/one-tile-stub-census.ts [--seeds=8] [--levels=1,10,20,40,60,100,140,200,300]
//
// Profiles
//   play : resolveLegacyMazeGenerationProfileForProgression (the budget ladder), mode 'play'.
//   menu : resolveLegacyMenuDemoMazeGenerationProfileForProgression (VIS-052 attract loop), mode 'menu'.
// Counts per maze (torus adjacency, exactly like the game):
//   strict : collectOneTileStubs (dead end whose branch is one cell, start and goal excluded)
//   loose  : EVERY floor cell with exactly one open neighbour, caps included, whose neighbour is a junction
//   border : loose nubs that sit on a border row / column (feeder nubs)
//   dead1  : dead ends of any branch length (info)
import {
  LADDER_BOARDS,
  countMazeStubs,
  generateStubCensusMaze,
  seedForIndex
} from './lib/oneTileStubCensus';

const arg = (name: string, fallback: string): string => (
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
);
const seeds = Number(arg('seeds', '8'));
const levels = arg('levels', '1,10,20,40,60,100,140,200,300').split(',').map(Number);

console.log('level profile board    n  strict/maze  loose/maze  border/maze  mazesWithStub  maxLoose  ms/maze');
for (const level of levels) {
  for (const profile of ['play', 'menu'] as const) {
    for (const board of LADDER_BOARDS) {
      let strict = 0; let loose = 0; let border = 0; let withStub = 0; let maxLoose = 0;
      const started = performance.now();
      for (let index = 0; index < seeds; index += 1) {
        const maze = generateStubCensusMaze(level, board, seedForIndex(index), profile);
        const counts = countMazeStubs(maze);
        strict += counts.strict; loose += counts.loose; border += counts.border;
        if (counts.strict + counts.loose > 0) { withStub += 1; }
        maxLoose = Math.max(maxLoose, counts.loose);
      }
      const ms = (performance.now() - started) / seeds;
      console.log(`${String(level).padStart(5)} ${profile.padEnd(7)} ${board.name.padEnd(8)} ${seeds}  ${(strict / seeds).toFixed(2).padStart(10)}  ${(loose / seeds).toFixed(2).padStart(10)}  ${(border / seeds).toFixed(2).padStart(11)}  ${String(withStub).padStart(8)}/${seeds}  ${String(maxLoose).padStart(8)}  ${ms.toFixed(0)}`);
    }
  }
}
