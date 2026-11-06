import { LEGACY_UI_MIN_TOUCH_TARGET } from './legacyUiStandards';

/**
 * Minimum effective hit area (css px, per axis) for any tappable control.
 * Shares the design-token floor with the rest of the legacy UI.
 */
export const LEGACY_MIN_HIT_TARGET_PX = LEGACY_UI_MIN_TOUCH_TARGET;

export interface LegacyHitRectInput {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface LegacyHitRect extends LegacyHitRectInput {
  bottom: number;
  centerX: number;
  centerY: number;
  right: number;
}

const createHitRect = (left: number, top: number, width: number, height: number): LegacyHitRect => ({
  bottom: top + height,
  centerX: left + (width / 2),
  centerY: top + (height / 2),
  height,
  left,
  right: left + width,
  top,
  width
});

/**
 * Grows a control's interactive zone to at least `minimum` px on each axis,
 * centered on the visual rect so the glyph stays where it is. Only the
 * invisible zone changes: callers keep drawing the original visual size.
 *
 * When `viewport` is given the grown rect is shifted (never shrunk) to stay
 * inside it, so a control hugging a screen edge still has a full-size zone
 * on screen. A control already at or above the minimum is returned as-is.
 */
export const resolveLegacyMinHitRect = (
  visual: LegacyHitRectInput,
  viewport?: { height: number; width: number },
  minimum: number = LEGACY_MIN_HIT_TARGET_PX
): LegacyHitRect => {
  const width = Math.max(visual.width, minimum);
  const height = Math.max(visual.height, minimum);
  let left = visual.left - ((width - visual.width) / 2);
  let top = visual.top - ((height - visual.height) / 2);
  if (viewport !== undefined) {
    left = Math.max(0, Math.min(left, viewport.width - width));
    top = Math.max(0, Math.min(top, viewport.height - height));
  }
  return createHitRect(left, top, width, height);
};
