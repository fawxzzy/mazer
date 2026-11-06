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
    // The confirmation can be opened from Pause, the authenticated
    // Account screen or the main-menu Settings sheet (see MenuScene's two openOverlay('confirm-progression-reset')
    // call sites). Route back to whichever one actually opened it instead of
    // always landing on Pause -- overlayReturn is the recorded origin, and
    // 'pause' is the safe fallback when no origin was recorded. The main-menu
    // Settings sheet is the third origin: it is left in place underneath, so
    // going back just closes the confirmation (closeOverlay restores it).
    if (state.overlayReturn === 'options') {
      return { kind: 'close-overlay' };
    }
    return {
      kind: 'open-overlay',
      overlay: state.overlayReturn === 'auth' ? 'auth' : 'pause'
    };
  }

  return {
    kind: 'close-overlay'
  };
};
