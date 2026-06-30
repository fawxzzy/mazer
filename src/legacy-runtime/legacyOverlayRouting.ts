export type LegacyRuntimeMode = 'menu' | 'play';
export type LegacyOverlayKind = 'none' | 'options' | 'features' | 'gameModes' | 'pause' | 'message';

export interface LegacyOverlayRoutingState {
  mode: LegacyRuntimeMode;
  overlay: LegacyOverlayKind;
  overlayReturn: LegacyOverlayKind;
}

export type LegacyOverlayBackAction =
  | { kind: 'noop' }
  | { kind: 'open-overlay'; overlay: 'pause' }
  | { kind: 'return-parent'; overlay: LegacyOverlayKind; overlayReturn: 'none' }
  | { kind: 'close-overlay' };

export const resolveLegacyNestedOverlayOpen = (
  overlay: Extract<LegacyOverlayKind, 'features' | 'gameModes'>,
  overlayReturn: Extract<LegacyOverlayKind, 'options' | 'pause'>
): Pick<LegacyOverlayRoutingState, 'overlay' | 'overlayReturn'> => ({
  overlay,
  overlayReturn
});

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

  if (state.overlayReturn !== 'none') {
    return {
      kind: 'return-parent',
      overlay: state.overlayReturn,
      overlayReturn: 'none'
    };
  }

  return {
    kind: 'close-overlay'
  };
};
