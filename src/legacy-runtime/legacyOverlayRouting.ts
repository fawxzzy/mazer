export type LegacyRuntimeMode = 'menu' | 'play';
export type LegacyOverlayKind = 'none' | 'options' | 'pause' | 'auth' | 'confirm-progression-reset' | 'leaderboard';

export interface LegacyOverlayRoutingState {
  mode: LegacyRuntimeMode;
  overlay: LegacyOverlayKind;
  overlayReturn: LegacyOverlayKind;
}

export type LegacyOverlayBackAction =
  | { kind: 'noop' }
  | { kind: 'open-overlay'; overlay: 'pause' | 'auth' }
  | { kind: 'close-overlay' };

export const resolveLegacyOverlayBackAction = (
  state: LegacyOverlayRoutingState
): LegacyOverlayBackAction => {
  if (state.overlay === 'none') {
    if (state.mode === 'play') {
      return {
        kind: 'open-overlay',
        overlay: 'pause'
      };
    }

    return {
      kind: 'noop'
    };
  }

  if (state.overlay === 'confirm-progression-reset') {
    // The confirmation can be opened from either Pause or the authenticated
    // Account screen (see MenuScene's two openOverlay('confirm-progression-reset')
    // call sites). Route back to whichever one actually opened it instead of
    // always landing on Pause -- overlayReturn is the recorded origin, and
    // 'pause' is the safe fallback when no origin was recorded.
    return {
      kind: 'open-overlay',
      overlay: state.overlayReturn === 'auth' ? 'auth' : 'pause'
    };
  }

  return {
    kind: 'close-overlay'
  };
};
