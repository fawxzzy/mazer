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

/**
 * The menu demo must START on the player's current level when the app loads, then climb.
 * If the persisted ai-runner track sits below the player track, lift it to the player's
 * level (a climbing demo already above the player is left alone). Pure; returns the same
 * state object when nothing changes.
 */
export const seedLegacyMenuDemoTrackFromPlayer = <T extends Pick<LegacyProgressionState, 'tracks'>>(
  state: T
): T => {
  const ai = state.tracks['ai-runner'];
  const lifted = liftLegacyMenuDemoTrackToPlayer(ai, state.tracks.player);
  if (lifted === ai) {
    return state;
  }
  return {
    ...state,
    tracks: {
      ...state.tracks,
      'ai-runner': lifted
    }
  };
};

/** Track-level lift behind seedLegacyMenuDemoTrackFromPlayer; returns the same track when it is at or above the player. */
export const liftLegacyMenuDemoTrackToPlayer = (
  ai: LegacyProgressionTrack,
  player: LegacyProgressionTrack
): LegacyProgressionTrack => {
  if (ai.targetComplexity >= player.targetComplexity) {
    return ai;
  }
  return {
    ...ai,
    colorTier: player.colorTier,
    level: player.level,
    peakComplexity: Math.max(ai.peakComplexity, player.targetComplexity),
    rank: player.rank,
    targetComplexity: player.targetComplexity
  };
};
