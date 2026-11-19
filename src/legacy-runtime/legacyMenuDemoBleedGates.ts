// MAZER-L10: the menu AI routes to a bleed gate first.
//
// A gated maze hides one bleed-off path until its gate is walked over (legacyBleedGates.ts). When walking to
// the gate first is shorter overall (placement guarantees it pays), the menu demo runs the maze as two legs:
// leg 1 walks the maze with the path hidden and the GATE as its goal; on arrival it switches to leg 2, which
// starts at the gate with the path open and walks on to the real goal (taking the wrap). The trail carries
// over between the legs. A maze without a gate (or whose gate does not pay) keeps the one-leg episode.

import type { MazeEpisode } from '../domain/maze';
import type { DemoWalkerState } from '../domain/ai';
import {
  resolveLegacyBleedGateHiddenGrid,
  resolveLegacyBleedGateRoute,
  resolveLegacyBleedGateShortestPath
} from './legacyBleedGates';
import { createLegacyDemoWalkerEpisode } from './legacyDemoWalker';
import type { LegacyMazeSnapshot, LegacyPoint } from './legacyMaze';

interface LegacyMenuDemoLeg {
  next: MazeEpisode;
}

const firstLegs = new WeakMap<MazeEpisode, LegacyMenuDemoLeg>();
// The trail walked on leg 1, shown in front of leg 2's own trail (set when the switch happens).
const trailPrefixes = new WeakMap<MazeEpisode, LegacyPoint[]>();

// The menu demo episode of a maze: leg 1 of a gated run, or the plain one-leg episode.
export const createLegacyMenuDemoEpisodeForMaze = (maze: LegacyMazeSnapshot): MazeEpisode => {
  const route = maze.bleedGates && maze.bleedGates.length > 0 ? resolveLegacyBleedGateRoute(maze) : null;
  const via = route?.via ?? null;
  if (via === null || maze.bleedGates === undefined) {
    return createLegacyDemoWalkerEpisode(maze);
  }
  const hiddenGrid = resolveLegacyBleedGateHiddenGrid(maze.grid, maze.bleedGates);
  const toGate = resolveLegacyBleedGateShortestPath(hiddenGrid, maze.start, via);
  const viaKey = maze.bleedGates.filter((gate) => gate.x === via.x && gate.y === via.y);
  const afterGrid = resolveLegacyBleedGateHiddenGrid(
    maze.grid,
    maze.bleedGates,
    new Set(viaKey.map((gate) => `${gate.axis}:${gate.line}`))
  );
  const toGoal = resolveLegacyBleedGateShortestPath(afterGrid, via, maze.goal);
  if (toGate === null || toGoal === null) {
    return createLegacyDemoWalkerEpisode(maze);
  }
  const first = createLegacyDemoWalkerEpisode({ ...maze, grid: hiddenGrid, goal: { ...via }, solutionPath: toGate });
  const second = createLegacyDemoWalkerEpisode({ ...maze, grid: afterGrid, start: { ...via }, solutionPath: toGoal });
  firstLegs.set(first, { next: second });
  return first;
};

export const isLegacyMenuDemoGateLeg = (episode: MazeEpisode): boolean => firstLegs.has(episode);

// Leg 2 of a gated run, once leg 1 reached the gate: the new episode, and the leg-1 trail it carries.
export const resolveLegacyMenuDemoNextLeg = (
  episode: MazeEpisode,
  state: Pick<DemoWalkerState, 'reachedGoal'>,
  walkedTrail: readonly LegacyPoint[]
): MazeEpisode | null => {
  const leg = firstLegs.get(episode);
  if (!leg || !state.reachedGoal) {
    return null;
  }
  // The gate tile itself is leg 2's first trail step.
  trailPrefixes.set(leg.next, [...(trailPrefixes.get(episode) ?? []), ...walkedTrail.slice(0, -1)].map((point) => ({ x: point.x, y: point.y })));
  return leg.next;
};

export const readLegacyMenuDemoTrailPrefix = (episode: MazeEpisode | undefined): readonly LegacyPoint[] => (
  episode ? trailPrefixes.get(episode) ?? [] : []
);
