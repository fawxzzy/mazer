/**
 * Tap recovery for the frame right after a UI rebuild.
 *
 * Root cause (reproduced 2026-11-06 with the ui-surfaces capture harness):
 * MenuScene.rebuildUi() destroys and recreates every button inside
 * scene.update(). Phaser only moves newly interactive objects into its hit-test
 * list in InputPlugin.preUpdate, which runs AFTER the input manager has already
 * processed the events queued for the current step. A pointerdown that is
 * processed in the step right after a rebuild is therefore hit-tested against a
 * stale list: scene-level `pointerdown` still fires, but with no objects under
 * the pointer, so the fresh Start button never sees the tap. The harness hit it
 * because the menu rebuilds its UI at the instant the static draw settles and
 * the capture taps as soon as diagnostics report `settled`.
 *
 * The recovery routes such a tap to the freshly built buttons directly, so a
 * tap is accepted deterministically instead of being dropped.
 *
 * Pure: no Phaser, no DOM.
 */

/** Steps after a rebuild in which Phaser's hit-test list may still be stale. */
export const LEGACY_UI_TAP_RECOVERY_FRAMES = 2;

export interface LegacyTapRecoveryContext {
  currentFrame: number;
  /** Frame in which rebuildUi last ran; null before the first rebuild. */
  rebuildFrame: number | null;
  /** Objects Phaser itself reported under the pointer for this tap. */
  overCount: number;
  mode: string;
  overlay: string;
}

/**
 * True only for a tap that Phaser did not route to any object, in menu mode
 * with no overlay, within the stale-list window after a rebuild.
 */
export const shouldRecoverLegacyTapAfterUiRebuild = (context: LegacyTapRecoveryContext): boolean => (
  context.rebuildFrame !== null
  && context.overCount === 0
  && context.mode === 'menu'
  && context.overlay === 'none'
  && context.currentFrame >= context.rebuildFrame
  && context.currentFrame - context.rebuildFrame <= LEGACY_UI_TAP_RECOVERY_FRAMES
);

export interface LegacyTapRecoveryCandidate {
  bottom: number;
  depth: number;
  /** Position in the button list; later wins a depth tie (drawn on top). */
  index: number;
  left: number;
  right: number;
  top: number;
}

/**
 * Picks the button Phaser would have chosen with a current list: the highest
 * depth under the point, ties going to the most recently created. Returns the
 * candidate's `index`, or null when nothing is under the point.
 */
export const resolveLegacyTapRecoveryTarget = (
  x: number,
  y: number,
  candidates: readonly LegacyTapRecoveryCandidate[]
): number | null => {
  let best: LegacyTapRecoveryCandidate | null = null;
  for (const candidate of candidates) {
    if (x < candidate.left || x > candidate.right || y < candidate.top || y > candidate.bottom) {
      continue;
    }
    if (best === null || candidate.depth > best.depth || (candidate.depth === best.depth && candidate.index > best.index)) {
      best = candidate;
    }
  }
  return best === null ? null : best.index;
};
