// Census of dead-end branch lengths per level band (MAZER-GEN-004).
//   npx vite-node --script scripts/analysis/progression-stub-census.ts [--seeds=50] [--levels=1,20,50]
import { LADDER_BOARDS, generateLadderMaze, seedForIndex } from './lib/progressionLadderSampling';
import { collectDeadEndBranches } from '../../src/legacy-runtime/legacyMazeStubs';
import { analyzeMazeDifficulty } from '../../src/legacy-runtime/legacyMazeDifficultyMetrics';

const arg = (name: string, fallback: string): string => (
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
);
const seeds = Number(arg('seeds', '50'));
const levels = arg('levels', '1,20,50,100,150,200,268,300,500,999').split(',').map(Number);

console.log('level board  n   floor  deadEnds  stub1(mean min max)  len2  len3  len>=4  mazesWithStub  junctions  route  ms/maze');
for (const level of levels) {
  for (const board of LADDER_BOARDS) {
    let stubs = 0; let stubMin = Infinity; let stubMax = 0; let len2 = 0; let len3 = 0; let len4 = 0;
    let lengthened = 0; let removed = 0; let forced = 0; let bases = 0; let maxMs = 0;
    let dead = 0; let floor = 0; let withStub = 0; let route = 0; let junctions = 0;
    const started = performance.now();
    for (let index = 0; index < seeds; index += 1) {
      const t0 = performance.now();
      const maze = generateLadderMaze(level, board, seedForIndex(index));
      maxMs = Math.max(maxMs, performance.now() - t0);
      const stats = (maze as { stubStats?: { lengthened: number; removed: number; forced: number } }).stubStats;
      lengthened += stats?.lengthened ?? 0; removed += stats?.removed ?? 0; forced += stats?.forced ?? 0;
      bases += (maze as { generation?: { selection?: { searchedCandidateCount: number } } }).generation?.selection?.searchedCandidateCount ?? 0;
      const branches = collectDeadEndBranches(maze);
      const one = branches.filter((b) => b.length === 1).length;
      stubs += one; stubMin = Math.min(stubMin, one); stubMax = Math.max(stubMax, one);
      len2 += branches.filter((b) => b.length === 2).length;
      len3 += branches.filter((b) => b.length === 3).length;
      len4 += branches.filter((b) => b.length >= 4).length;
      if (one > 0) { withStub += 1; }
      const metrics = analyzeMazeDifficulty(maze);
      dead += branches.length; floor += metrics.floorCells; route += metrics.routeLength;
      junctions += metrics.decisionPoints;
    }
    const ms = (performance.now() - started) / seeds;
    const f = (v: number) => (v / seeds).toFixed(1);
    console.log(`${String(level).padStart(4)} ${board.name.padEnd(7)} ${seeds}  ${f(floor).padStart(6)} ${f(dead).padStart(8)}  ${f(stubs).padStart(6)} ${stubMin} ${stubMax}  ${f(len2)}  ${f(len3)}  ${f(len4)}  ${withStub}/${seeds}  dec=${f(junctions)}  route=${f(route)}  ${ms.toFixed(0)}ms(max ${maxMs.toFixed(0)})  fix: +${f(lengthened)} -${f(removed)} forced ${forced}  bases ${f(bases)}`);
  }
}
