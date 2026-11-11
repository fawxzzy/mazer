// Pure rules for "the device was rotated mid-run" (MAZER-FLOW-008). A run keeps
// its maze across a rotation (it only regenerates at the next level), so a
// portrait corridor maze refit to a landscape board shrinks to a thin line.
// Decisions live here; MenuScene owns the listener and feeds plain values.
//
//   1. An aspect flip during a live run auto-pauses it (the layout refit itself
//      is MenuScene.refreshLayout, which already re-derives the board from the
//      unchanged maze every time the viewport changes).
//   2. The pause sheet shows a "rotate back" notice only while the refit
//      corridor is thinner than LEGACY_ROTATE_PROMPT_MIN_CORRIDOR_PX.
import { shouldAutoPauseLegacyRun } from './legacyLifecycleHold';

/** Corridor (one board tile) narrower than this css px asks the player to rotate back. */
export const LEGACY_ROTATE_PROMPT_MIN_CORRIDOR_PX = 24;
export const LEGACY_ROTATE_PROMPT_LABEL = 'Rotate back to keep playing';

export const isLegacyLandscapeViewport = (width: number, height: number): boolean => width > height;

/** True only when the previous aspect is known and the orientation actually changed. */
export const isLegacyOrientationFlip = (
  previousLandscape: boolean | null,
  nextLandscape: boolean
): boolean => previousLandscape !== null && previousLandscape !== nextLandscape;

/** The prompt is shown only when the refit corridor is below the threshold. */
export const shouldShowLegacyRotatePrompt = (corridorPx: number): boolean => (
  Number.isFinite(corridorPx) && corridorPx < LEGACY_ROTATE_PROMPT_MIN_CORRIDOR_PX
);

export interface LegacyRotateNoticeInput {
  corridorPx: number;
  currentLandscape: boolean;
  /** Aspect the run was in before the flip that paused it; null when Pause did not come from a flip. */
  originLandscape: boolean | null;
}

/**
 * The notice leads the pause sheet only while the viewport is still in the
 * flipped aspect (rotating back clears it) and the refit corridor is thin.
 */
export const shouldShowLegacyRotateNotice = (input: LegacyRotateNoticeInput): boolean => (
  input.originLandscape !== null
  && input.originLandscape !== input.currentLandscape
  && shouldShowLegacyRotatePrompt(input.corridorPx)
);

export interface LegacyOrientationFlipInput {
  mode: 'menu' | 'play';
  nextLandscape: boolean;
  overlay: string;
  previousLandscape: boolean | null;
}

export interface LegacyOrientationFlipDecision {
  /** Open Pause now (a live run with no overlay open). */
  autoPause: boolean;
  flipped: boolean;
}

export const resolveLegacyOrientationFlip = (input: LegacyOrientationFlipInput): LegacyOrientationFlipDecision => {
  const flipped = isLegacyOrientationFlip(input.previousLandscape, input.nextLandscape);
  return {
    autoPause: flipped && shouldAutoPauseLegacyRun({ mode: input.mode, overlay: input.overlay }),
    flipped
  };
};
