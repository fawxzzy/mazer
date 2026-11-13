// Census of "pointless snaking" per level band (MAZER-GEN-007): unbranched winding runs.
//   npx vite-node --script scripts/analysis/progression-winding-census.ts [--seeds=50] [--levels=1,20,50] [--json=out.json]
import { writeFileSync } from 'node:fs';
import { LADDER_BOARDS, generateLadderMaze, seedForIndex } from './lib/progressionLadderSampling';
import { analyzeMazeDensity } from '../../src/legacy-runtime/legacyMazeDensity';
import { analyzeMazeWinding } from '../../src/legacy-runtime/legacyMazeWinding';
import { analyzeMazeDifficulty } from '../../src/legacy-runtime/legacyMazeDifficultyMetrics';
import { measureFelt } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';

const arg = (name: string, fallback: string): string => (
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
);
const seeds = Number(arg('seeds', '50'));
const levels = arg('levels', '1,20,50,100,150,200,218,268,300,500,999').split(',').map(Number);
const jsonOut = arg('json', '');
const rows: Record<string, number | string>[] = [];

console.log('level board    floor  runs  runCells longRun  turns hairpin zigzag tight wShare% tShare%  wRuns wCells(route/branch/link)  tortu  turn/10c  junc deadE  decis route rect patch halls lHall  felt  bases off fringe ms');
for (const level of levels) {
  for (const board of LADDER_BOARDS) {
    const acc: Record<string, number> = {};
    const add = (k: string, v: number) => { acc[k] = (acc[k] ?? 0) + v; };
    const started = performance.now();
    let maxMs = 0;
    for (let index = 0; index < seeds; index += 1) {
      const t0 = performance.now();
      const maze = generateLadderMaze(level, board, seedForIndex(index));
      maxMs = Math.max(maxMs, performance.now() - t0);
      const w = analyzeMazeWinding(maze);
      const d = analyzeMazeDifficulty(maze);
      const dn = analyzeMazeDensity(maze); add('rect', dn.emptyRectArea); add('patch', dn.blankPatches); add('halls', dn.hallCount); add('longHall', dn.longestHall);
      add('floor', w.floorCells); add('runs', w.runs.length); add('runCells', w.runCells); add('longestRun', w.longestRun);
      add('turns', w.totalTurns); add('hairpins', w.hairpins); add('zigzag', w.longestZigzag); add('tight', w.longestTight);
      add('share', w.windingCellShare); add('wRuns', w.windingRuns); add('wCells', w.windingCells);
      add('wRoute', w.windingCellsByKind.route); add('wBranch', w.windingCellsByKind.branch); add('wLink', w.windingCellsByKind.link);
      add('tortu', w.longRunTortuosity); add('tshare', w.tortuousCellShare); add('dens', w.longRunTurnDensity); add('junc', w.junctions); add('dead', w.deadEnds);
      add('decis', d.decisionPoints); add('route', maze.solutionPath.length - 1);
      add('felt', measureFelt(maze).steps);
      const sel = (maze as { generation?: { selection?: { searchedCandidateCount: number; selectedDistance: number } } }).generation?.selection;
      add('bases', sel?.searchedCandidateCount ?? 0); add('off', (sel?.selectedDistance ?? 0) > 0 ? 1 : 0);
      add('fringe', (maze as { fringeStats?: { cells: number } }).fringeStats?.cells ?? 0);
    }
    const ms = (performance.now() - started) / seeds;
    const m = (k: string) => (acc[k]! / seeds);
    const f = (k: string, n = 1) => m(k).toFixed(n);
    rows.push({ level, board: board.name, seeds, floor: m('floor'), runs: m('runs'), runCells: m('runCells'), longestRun: m('longestRun'), turns: m('turns'), hairpins: m('hairpins'), zigzag: m('zigzag'), tight: m('tight'), windingShare: m('share') / 10, tortuousShare: m('tshare') / 10, windingRuns: m('wRuns'), windingCells: m('wCells'), wRoute: m('wRoute'), wBranch: m('wBranch'), wLink: m('wLink'), tortuosity: m('tortu') / 1000, turnPer10: m('dens') / 100, junctions: m('junc'), deadEnds: m('dead'), decisions: m('decis'), route: m('route'), emptyRect: m('rect'), blankPatches: m('patch'), halls: m('halls'), longestHall: m('longHall'), felt: m('felt'), bases: m('bases'), offWindow: acc.off ?? 0, fringe: m('fringe'), ms, maxMs });
    console.log(`${String(level).padStart(4)} ${board.name.padEnd(7)} ${f('floor').padStart(6)} ${f('runs').padStart(5)} ${f('runCells').padStart(7)} ${f('longestRun').padStart(6)} ${f('turns').padStart(6)} ${f('hairpins').padStart(6)} ${f('zigzag').padStart(5)} ${f('tight').padStart(5)} ${(m('share') / 10).toFixed(1).padStart(6)} ${(m('tshare') / 10).toFixed(1).padStart(6)} ${f('wRuns').padStart(5)}  ${f('wRoute', 0)}/${f('wBranch', 0)}/${f('wLink', 0)}  ${(m('tortu') / 1000).toFixed(2)}  ${(m('dens') / 100).toFixed(2)}  ${f('junc').padStart(5)} ${f('dead').padStart(5)} ${f('decis').padStart(6)} ${f('route', 0).padStart(5)} ${f('rect').padStart(5)} ${f('patch')} ${f('halls')} ${f('longHall')} ${f('felt', 0).padStart(5)} ${f('bases')} ${acc.off} ${f('fringe', 0)} ${ms.toFixed(0)}(max ${maxMs.toFixed(0)})`);
  }
}
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(rows, null, 1)); }
