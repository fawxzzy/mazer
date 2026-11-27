/**
 * The front-door play label (UI consistency batch D, 2026-11-26). Pure: no Phaser, no DOM, no storage.
 *
 * - Touch (the default, and every phone) keeps "TAP TO PLAY".
 * - A device that positively looks like a computer (fine pointer with hover, not mobile, not standalone, the same
 *   facts and rule as the control hint, `resolveLegacyControlHintInput`) reads "PRESS TO PLAY": a mouse click and the
 *   Enter key both start the game there (MAZER-MODE-002), and "TAP" is wrong for a mouse. The label is drawn in the
 *   5x7 dot-matrix glyph set, which has no C, so "CLICK" is not spelled; "PRESS" covers click and key.
 * - On that desktop the glyph cell used to come out at 3 px (the label had to fit a 262 px button box for 65 columns),
 *   so the desktop cell is sized from the viewport instead, within a cap. Phones keep their existing sizing.
 */
import { resolveLegacyControlHintInput, type LegacyControlHintDeviceFacts } from './legacyControlHint';

export const LEGACY_PLAY_LABEL_TOUCH = 'TAP TO PLAY';
export const LEGACY_PLAY_LABEL_DESKTOP = 'PRESS TO PLAY';

export const isLegacyPlayLabel = (text: string): boolean => (
  text === LEGACY_PLAY_LABEL_TOUCH || text === LEGACY_PLAY_LABEL_DESKTOP
);

/** True only on a device that positively looks like a computer; unknown facts keep the touch wording. */
export const isLegacyDesktopPointerDevice = (facts: LegacyControlHintDeviceFacts): boolean => (
  resolveLegacyControlHintInput(facts) !== 'touch'
);

export const resolveLegacyPlayLabel = (facts: LegacyControlHintDeviceFacts): string => (
  isLegacyDesktopPointerDevice(facts) ? LEGACY_PLAY_LABEL_DESKTOP : LEGACY_PLAY_LABEL_TOUCH
);

/** Desktop label width as a share of the viewport, and the smallest / largest glyph cell it may use. */
export const LEGACY_PLAY_LABEL_DESKTOP_WIDTH_SHARE = 0.4;
export const LEGACY_PLAY_LABEL_DESKTOP_MIN_CELL_PX = 4;
export const LEGACY_PLAY_LABEL_DESKTOP_MAX_CELL_PX = 8;

/** Glyph cell size for the desktop label: viewport-derived, clamped, never below the old fit. */
export const resolveLegacyDesktopPlayLabelCell = (input: {
  readonly viewportWidth: number;
  readonly glyphColumns: number;
  readonly fallbackCell: number;
}): number => {
  const columns = Math.max(1, input.glyphColumns);
  const wanted = Math.floor((Math.max(0, input.viewportWidth) * LEGACY_PLAY_LABEL_DESKTOP_WIDTH_SHARE) / columns);
  const clamped = Math.max(
    LEGACY_PLAY_LABEL_DESKTOP_MIN_CELL_PX,
    Math.min(LEGACY_PLAY_LABEL_DESKTOP_MAX_CELL_PX, wanted)
  );
  return Math.max(input.fallbackCell, clamped);
};
