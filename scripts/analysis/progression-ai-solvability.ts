// Proves solvability of progression levels with the real AI demo walker.
//
// For each sampled level it generates the MENU board (the surface the AI plays)
// through the progression path on the frozen phone/desktop boards, confirms a
// playable shortest path exists, then steps the demo walker (advanceDemoWalker)
// at rank E (the weakest, most mistake-prone) and rank S until it reaches the
// goal, and records how many steps that took.
//
//   npx vite-node --script scripts/analysis/progression-ai-solvability.ts -- \
//     [--levels=1..300/10,197,300] [--seeds=3] [--out=<dir>]
// Exits 1 if any (level, board, seed, rank) fails to reach the goal.

import { mkdirSync, writeFileSync } from 'node:fs';
import { advanceDemoWalker, createDemoWalkerState, collectDemoWalkerRouteDiagnostics, type DemoWalkerAiSkillRank } from '../../src/domain/ai';
import { createLegacyDemoWalkerEpisode, createLegacyMenuDemoWalkerConfig } from '../../src/legacy-runtime/legacyDemoWalker';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { resolveLegacyPlayableShortestPath } from '../../src/legacy-runtime/legacyMaze';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import { LADDER_BOARDS, seedForIndex, trackForLevel } from './lib/progressionLadderSampling';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const parseLevels = (spec: string): number[] => {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const stepped = /^(\d+)\.\.(\d+)\/(\d+)$/.exec(part);
    const range = /^(\d+)\.\.(\d+)$/.exec(part);
    if (stepped) {
      for (let level = Number(stepped[1]); level <= Number(stepped[2]); level += Number(stepped[3])) { out.add(level); }
    } else if (range) {
      for (let level = Number(range[1]); level <= Number(range[2]); level += 1) { out.add(level); }
    } else if (/^\d+$/.test(part)) {
      out.add(Number(part));
    }
  }
  return [...out].sort((a, b) => a - b);
};

const levels = parseLevels(arg('levels', '1,10..300/10,197,300'));
const seeds = Number(arg('seeds', '3'));
const outDir = arg('out', '');
const ranks: DemoWalkerAiSkillRank[] = ['E', 'S'];
const rows: Record<string, unknown>[] = [];
let failures = 0;

for (const level of levels) {
  for (const board of LADDER_BOARDS) {
    for (let index = 0; index < seeds; index += 1) {
      const seed = seedForIndex(index);
      const profile = resolveLegacyMazeGenerationProfileForProgression(trackForLevel(level));
      const maze = createLegacyRuntimeMazeForMode('menu', 35, seed, profile, {}, board.aspectRatio);
      const shortest = resolveLegacyPlayableShortestPath(maze.grid, maze.start, maze.goal);
      for (const rank of ranks) {
        const episode = createLegacyDemoWalkerEpisode(maze);
        const config = createLegacyMenuDemoWalkerConfig(seed, { aiSkillRank: rank, aiSkillLevel: 1 });
        let state = createDemoWalkerState(episode, config);
        const cap = Math.max(2000, maze.width * maze.height * 20);
        let steps = 0;
        while (!state.reachedGoal && steps < cap) {
          state = advanceDemoWalker(episode, state, config).state;
          steps += 1;
        }
        const diagnostics = collectDemoWalkerRouteDiagnostics(episode, config);
        const solved = state.reachedGoal && shortest.found;
        if (!solved) { failures += 1; }
        rows.push({
          level, board: board.name, seed, rank, solved, shortestFound: shortest.found,
          shortestLength: shortest.path.length, walkerSteps: steps, routeLength: diagnostics.routeLength,
          wrongBranches: diagnostics.telemetry.wrongBranchCount, backtracks: diagnostics.telemetry.backtrackCount
        });
      }
    }
  }
}

const solvedCount = rows.filter((row) => row.solved === true).length;
console.log(`levels ${levels.length} (${levels[0]}..${levels[levels.length - 1]}), boards ${LADDER_BOARDS.length}, seeds ${seeds}, ranks ${ranks.join('/')}: ${solvedCount}/${rows.length} cleared, ${failures} failures`);
if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/ai-solvability.json`, JSON.stringify({ levels, seeds, rows, failures }, null, 2));
  const header = Object.keys(rows[0]!);
  writeFileSync(`${outDir}/ai-solvability.csv`, `${header.join(',')}\n${rows.map((row) => header.map((key) => String(row[key])).join(',')).join('\n')}\n`);
}
if (failures > 0) {
  process.exitCode = 1;
}
