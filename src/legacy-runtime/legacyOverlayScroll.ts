export interface LegacyOverlayScrollRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface LegacyOverlayScrollMetrics {
  bottomFadeAlpha: number;
  contentHeight: number;
  enabled: boolean;
  maxOffset: number;
  offset: number;
  thumb: LegacyOverlayScrollRect;
  topFadeAlpha: number;
  track: LegacyOverlayScrollRect;
  viewport: LegacyOverlayScrollRect;
}

export const clampLegacyOverlayScrollOffset = (offset: number, maxOffset: number): number => (
  Math.max(0, Math.min(Math.max(0, maxOffset), offset))
);

export function resolveLegacyOverlayScrollMetrics(input: {
  contentHeight: number;
  minThumbHeight?: number;
  offset: number;
  trackInset?: number;
  trackWidth?: number;
  viewport: LegacyOverlayScrollRect;
}): LegacyOverlayScrollMetrics {
  const viewportHeight = Math.max(1, input.viewport.height);
  const contentHeight = Math.max(viewportHeight, input.contentHeight);
  const maxOffset = Math.max(0, contentHeight - viewportHeight);
  const offset = clampLegacyOverlayScrollOffset(input.offset, maxOffset);
  const trackInset = input.trackInset ?? 8;
  const trackWidth = input.trackWidth ?? 3;
  const track = {
    left: input.viewport.left + input.viewport.width - trackInset,
    top: input.viewport.top + trackInset,
    width: trackWidth,
    height: Math.max(1, input.viewport.height - (trackInset * 2))
  };
  const enabled = maxOffset > 1;
  const minThumbHeight = input.minThumbHeight ?? 34;
  const thumbHeight = enabled
    ? Math.max(minThumbHeight, Math.min(track.height, (viewportHeight / contentHeight) * track.height))
    : track.height;
  const thumbTravel = Math.max(0, track.height - thumbHeight);
  const thumbTop = track.top + (enabled && maxOffset > 0 ? (offset / maxOffset) * thumbTravel : 0);

  return {
    bottomFadeAlpha: enabled && offset < maxOffset - 1 ? 0.24 : 0,
    contentHeight,
    enabled,
    maxOffset,
    offset,
    thumb: {
      left: track.left,
      top: thumbTop,
      width: track.width,
      height: thumbHeight
    },
    topFadeAlpha: enabled && offset > 1 ? 0.2 : 0,
    track,
    viewport: { ...input.viewport }
  };
}
