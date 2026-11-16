// Shared fixture for the slice H3 Pulse Gate tests: real ladder mazes (the production generation
// job) with their real hazard overlay. Not a test file (no .test suffix).
import { createLegacyGenerationRequest } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  createLegacyMazeGenerationJobInputFromRequest,
  runLegacyMazeGenerationJob,
  type LegacyMazeGenerationHazardJob
} from '../../src/legacy-runtime/legacyMazeGenerationJob';
import { resolveLegacyHazardOverlay, type LegacyHazardOverlayResult } from '../../src/legacy-runtime/legacyHazardOverlay';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import { trackForLevel } from '../../scripts/analysis/lib/progressionLadderSampling';

export const PHONE_ASPECT = 23 / 51;
export const DESKTOP_ASPECT = 45 / 27;

export const createLadderRequest = (level: number, aspectRatio: number, seed: number, mode: 'play' | 'menu' = 'play') => {
  const track = trackForLevel(level);
  return createLegacyGenerationRequest({
    aspectRatio,
    currentSeed: 1,
    dueAtMs: 0,
    generationProfile: resolveLegacyMazeGenerationProfileForProgression(track),
    mode,
    reason: mode === 'play' ? 'play-start' : 'boot-menu',
    scale: 35,
    seedOverride: seed,
    targetComplexity: track.targetComplexity
  });
};

export const createLadderJobInput = (
  level: number,
  aspectRatio: number,
  seed: number,
  hazard?: LegacyMazeGenerationHazardJob,
  mode: 'play' | 'menu' = 'play'
) => createLegacyMazeGenerationJobInputFromRequest(createLadderRequest(level, aspectRatio, seed, mode), 35, hazard);

export interface GateFixture {
  readonly level: number;
  readonly seed: number;
  readonly maze: LegacyMazeSnapshot;
  readonly overlay: LegacyHazardOverlayResult;
}

const cache = new Map<string, GateFixture>();

/**
 * The first ladder maze at `level` (seeds from `firstSeed`) whose overlay has Pulse Gates and a
 * witness. With `needWait`, the witness must also wait at least once (a gate actually held it).
 */
export const findGateFixture = (
  level = 10,
  aspectRatio = PHONE_ASPECT,
  options: { firstSeed?: number; needWait?: boolean } = {}
): GateFixture => {
  const key = `${level}:${aspectRatio}:${options.firstSeed ?? 1}:${options.needWait === true}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  for (let seed = options.firstSeed ?? 1; seed < (options.firstSeed ?? 1) + 400; seed += 1) {
    const maze = runLegacyMazeGenerationJob(createLadderJobInput(level, aspectRatio, seed));
    const overlay = resolveLegacyHazardOverlay(maze, { enabled: true, level });
    const witness = overlay?.verdict?.witness ?? null;
    if (!overlay || witness === null || !overlay.specs.some((spec) => spec.kind === 'timedGate')) {
      continue;
    }
    if (options.needWait === true && witness.waits === 0) {
      continue;
    }
    const fixture = { level, seed, maze, overlay };
    cache.set(key, fixture);
    return fixture;
  }
  throw new Error(`no Pulse Gate fixture at level ${level}`);
};
