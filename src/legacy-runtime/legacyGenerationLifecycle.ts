import { createLegacyMaze, createLegacyMenuMaze, type LegacyMazeSnapshot } from './legacyMaze';

export type LegacyGenerationMode = 'menu' | 'play';
export type LegacyMazeBuildKind = 'menu-snapshot' | 'play-generated';
export type LegacyGenerationProcessStageId = 0 | 3 | 4 | 5 | 6 | 7 | 8;
export type LegacyGenerationRequestReason =
  | 'boot-menu'
  | 'play-start'
  | 'menu-return'
  | 'menu-demo-goal-reset'
  | 'menu-demo-missing-episode'
  | 'overlay-rebuild';

export interface LegacyGenerationRequest {
  buildKind: LegacyMazeBuildKind;
  dueAtMs: number;
  mode: LegacyGenerationMode;
  processStageIds: LegacyGenerationProcessStageId[];
  reason: LegacyGenerationRequestReason;
  seed: number;
}

export const LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS: readonly LegacyGenerationProcessStageId[] = [0, 3, 4, 6, 7, 8];
export const LEGACY_OPTIONAL_SHORTCUT_PROCESS_STAGE_ID: LegacyGenerationProcessStageId = 5;

export const resolveLegacyGenerationProcessStageIds = (scale: number): LegacyGenerationProcessStageId[] => (
  scale > 35
    ? [...LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS.slice(0, 3), LEGACY_OPTIONAL_SHORTCUT_PROCESS_STAGE_ID, ...LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS.slice(3)]
    : [...LEGACY_REQUIRED_GENERATION_PROCESS_STAGE_IDS]
);

export const resolveLegacyMazeBuildKind = (mode: LegacyGenerationMode): LegacyMazeBuildKind => (
  mode === 'menu' ? 'menu-snapshot' : 'play-generated'
);

export const createLegacyRuntimeMazeForMode = (
  mode: LegacyGenerationMode,
  scale: number,
  seed: number
): LegacyMazeSnapshot => {
  const buildKind = resolveLegacyMazeBuildKind(mode);
  const maze = buildKind === 'menu-snapshot'
    ? createLegacyMenuMaze(seed)
    : createLegacyMaze(scale, seed);

  return {
    ...maze,
    generation: {
      buildKind,
      processStageIds: resolveLegacyGenerationProcessStageIds(scale)
    }
  };
};

export const stepLegacyGenerationSeed = (seed: number): number => (seed + 1) >>> 0;

export const createLegacyGenerationRequest = ({
  currentSeed,
  dueAtMs,
  mode,
  reason,
  scale,
  stepSeed = false
}: {
  currentSeed: number;
  dueAtMs: number;
  mode: LegacyGenerationMode;
  reason: LegacyGenerationRequestReason;
  scale: number;
  stepSeed?: boolean;
}): LegacyGenerationRequest => {
  const seed = stepSeed ? stepLegacyGenerationSeed(currentSeed) : currentSeed;

  return {
    mode,
    reason,
    seed,
    dueAtMs: Math.max(0, Math.round(dueAtMs)),
    buildKind: resolveLegacyMazeBuildKind(mode),
    processStageIds: resolveLegacyGenerationProcessStageIds(scale)
  };
};

export const shouldConsumeLegacyGenerationRequest = (
  request: LegacyGenerationRequest | null,
  nowMs: number
): boolean => request !== null && nowMs >= request.dueAtMs;

export const consumeLegacyGenerationRequest = (
  request: LegacyGenerationRequest,
  scale: number
): LegacyMazeSnapshot => createLegacyRuntimeMazeForMode(request.mode, scale, request.seed);
