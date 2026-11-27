// Slice H2: the hazard generation overlay for a finished legacy maze.
//
// It runs AFTER generation and only READS the maze: it never changes a cell, the
// start, the goal, the solution path, the felt number or an opening. With
// `enabled: false` it returns null without touching the maze at all, so the
// default build is byte-identical to a build without this module.
//
// The caller passes `enabled` from the hazard layer switch. This module does not
// read the switch itself: a Web Worker cannot read the page query string or
// localStorage (the GEN-020 staircase trap, legacyMazeWorkerClient.ts), so the
// maze worker receives the resolved boolean in the job message.
//
// Slice H3 wiring: the maze worker job (legacyMazeGenerationJob.ts) runs it after
// generation when the job carries `hazard`, and the Pulse Gate controller
// (legacyHazardGateController.ts) runs it on the main thread as the fallback.
import {
  computeHazardOverlay,
  type HazardOverlayResult
} from '../mazer-core/hazards/overlay';
import { GEOMETRY_BUDGET_SATURATION_LEVEL } from './legacyGeometryBudget';
import { createLegacyMazeHazardGraph } from './legacyHazardGraphAdapter';
import type { LegacyMazeSnapshot } from './legacyMaze';

export type LegacyHazardOverlayResult = HazardOverlayResult;

// `bleedGates` (the maze's Switches) are read by the adapter: the wrap behind an unlit Switch is a wall for
// every hazard this overlay places (first-time cards spec D8, slice 5).
export type LegacyHazardOverlaySource = Pick<LegacyMazeSnapshot, 'grid' | 'start' | 'goal' | 'seed' | 'bleedGates'>;

export interface LegacyHazardOverlayOptions {
  /** The resolved hazard layer switch. False returns null (the default build). */
  readonly enabled: boolean;
  /** 1-based ladder level. */
  readonly level: number;
  /** The player's local exposure stage (0-4); omit for a new player (stage equals the schedule). */
  readonly exposureStage?: number;
}

export const resolveLegacyHazardOverlay = (
  maze: LegacyHazardOverlaySource,
  options: LegacyHazardOverlayOptions
): HazardOverlayResult | null => {
  if (options.enabled !== true) {
    return null;
  }
  const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
  return computeHazardOverlay(graph, {
    start,
    goal,
    mazeSeed: maze.seed,
    level: options.level,
    saturationLevel: GEOMETRY_BUDGET_SATURATION_LEVEL,
    exposureStage: options.exposureStage
  });
};
