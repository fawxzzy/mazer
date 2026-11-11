import {
  resolveLegacyProgressionTrackIdForSurface,
  type LegacyProgressionState,
  type LegacyProgressionTrack,
  type LegacyProgressionTrackId
} from './legacyProgression';

/**
 * MAZER-FLOW-007: which progression track drives a generation mode.
 *
 * The main-menu AI demo is an independent attract loop. It reads and advances
 * the `ai-runner` track (one level per completed demo maze), the same track
 * `recordLegacyProgressionCycle` already advances for the `menu-demo` surface.
 * Play mode keeps using the `player` track and never reads `ai-runner`.
 *
 * This is the single place the mode -> track decision lives, so the board
 * level, generation profile, scale, target complexity, seed salt and the AI
 * walker's skill/rank cannot drift apart again.
 */
export type LegacyGenerationTrackMode = 'menu' | 'play';

export const resolveLegacyGenerationTrackId = (
  mode: LegacyGenerationTrackMode
): LegacyProgressionTrackId => (
  resolveLegacyProgressionTrackIdForSurface(mode === 'play' ? 'play' : 'menu-demo')
);

export const resolveLegacyGenerationTrack = (
  state: Pick<LegacyProgressionState, 'tracks'>,
  mode: LegacyGenerationTrackMode
): LegacyProgressionTrack => state.tracks[resolveLegacyGenerationTrackId(mode)];
