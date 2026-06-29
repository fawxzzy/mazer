import { createLegacyMaze, createLegacyMenuMaze, type LegacyMazeSnapshot } from './legacyMaze';

export type LegacyGenerationMode = 'menu' | 'play';
export type LegacyMazeBuildKind = 'menu-snapshot' | 'play-generated';
export type LegacyGenerationProcessStageId = 0 | 3 | 4 | 5 | 6 | 7 | 8;

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
): LegacyMazeSnapshot => (
  resolveLegacyMazeBuildKind(mode) === 'menu-snapshot'
    ? createLegacyMenuMaze(seed)
    : createLegacyMaze(scale, seed)
);

export const stepLegacyGenerationSeed = (seed: number): number => (seed + 1) >>> 0;
