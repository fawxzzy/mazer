export type LegacyRuntimeMode = 'menu' | 'play';
export type LegacyOverlayKind = 'none' | 'options' | 'pause';

export interface LegacyOverlayRoutingState {
  mode: LegacyRuntimeMode;
  overlay: LegacyOverlayKind;
  overlayReturn: LegacyOverlayKind;
}

export type LegacyOverlayBackAction =
  | { kind: 'noop' }
  | { kind: 'open-overlay'; overlay: 'pause' }
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

  return {
    kind: 'close-overlay'
  };
};
