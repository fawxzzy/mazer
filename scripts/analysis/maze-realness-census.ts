// Headless census of how "real" generated mazes read (MAZER-GEN-021): start-to-goal span, route length, decision
// points and decoy branches, both profiles, phone and desktop boards.
//   npx vite-node --script scripts/analysis/maze-realness-census.ts [--seeds=8] [--levels=1,10,20,40,60,100,140,200,300]
// Columns (means over the seeds; min = the worst maze, which is what the regression floors pin):
//   span   : start to goal Manhattan distance / board span (min and mean), cheb = Chebyshev flavour
//   route  : shortest start-to-goal route in cells over the board's linear size (w + h) / 2 (min and mean)
//   dec    : junctions ON the route (decision points the player meets)
//   junc   : junctions in the whole maze
//   decoy  : dead-end branches whose host junction is on the route
//   deadMean / deadMax : dead-end branch length in cells
import {
  LADDER_BOARDS,
  generateStubCensusMaze,
  seedForIndex
} from './lib/oneTileStubCensus';
import { measureMazeRealness } from './lib/mazeRealness';

const arg = (name: string, fallback: string): string => (
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
);
const seeds = Number(arg('seeds', '8'));
const levels = arg('levels', '1,10,20,40,60,100,140,200,300').split(',').map(Number);

const f = (n: number, w = 6, d = 2): string => n.toFixed(d).padStart(w);
console.log('level profile board   n  spanMin spanAvg chebAvg | routeMin routeAvg | dec  junc decoy | deadMean deadMax | ms');
const totals: Record<string, { spanMin: number; routeMin: number; spanSum: number; routeSum: number; count: number }> = {};
for (const level of levels) {
  for (const profile of ['play', 'menu'] as const) {
    for (const board of LADDER_BOARDS) {
      let spanMin = Infinity; let routeMin = Infinity; let spanSum = 0; let chebSum = 0; let routeSum = 0;
      let dec = 0; let junc = 0; let decoy = 0; let deadMean = 0; let deadMax = 0;
      const started = performance.now();
      for (let index = 0; index < seeds; index += 1) {
        const m = measureMazeRealness(generateStubCensusMaze(level, board, seedForIndex(index), profile));
        spanMin = Math.min(spanMin, m.spanManhattan); routeMin = Math.min(routeMin, m.routeOverLinear);
        spanSum += m.spanManhattan; chebSum += m.spanChebyshev; routeSum += m.routeOverLinear;
        dec += m.routeDecisions; junc += m.junctions; decoy += m.routeDecoys; deadMean += m.deadEndMean;
        deadMax = Math.max(deadMax, m.deadEndMax);
      }
      const ms = (performance.now() - started) / seeds;
      console.log(`${String(level).padStart(5)} ${profile.padEnd(7)} ${board.name.padEnd(7)} ${seeds} ${f(spanMin)} ${f(spanAvg(spanSum))} ${f(chebSum / seeds)} | ${f(routeMin, 8)} ${f(routeSum / seeds, 8)} | ${f(dec / seeds, 5, 1)} ${f(junc / seeds, 5, 1)} ${f(decoy / seeds, 5, 1)} | ${f(deadMean / seeds, 8)} ${String(deadMax).padStart(7)} | ${ms.toFixed(0)}`);
      const key = `${profile}/${board.name}`;
      const t = totals[key] ?? { spanMin: Infinity, routeMin: Infinity, spanSum: 0, routeSum: 0, count: 0 };
      t.spanMin = Math.min(t.spanMin, spanMin); t.routeMin = Math.min(t.routeMin, routeMin);
      t.spanSum += spanSum; t.routeSum += routeSum; t.count += seeds;
      totals[key] = t;
    }
  }
}
function spanAvg(sum: number): number { return sum / seeds; }
console.log('\nALL LEVELS  profile/board     spanMin spanAvg  routeMin(x linear) routeAvg');
for (const [key, t] of Object.entries(totals)) {
  console.log(`            ${key.padEnd(16)} ${f(t.spanMin, 7)} ${f(t.spanSum / t.count, 7)}  ${f(t.routeMin, 16)} ${f(t.routeSum / t.count, 8)}`);
}
