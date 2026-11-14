/**
 * Rise and stagger entrance for overlay panels and their rows (MAZER-MOTION-011).
 *
 * MOTION-002 fades the OUTGOING screen when an overlay opens. This is the other half: the incoming panel lifts into
 * place and its rows follow one after another, on the shared motion scale (motionScale.ts). No new duration is
 * registered: every row takes the base step (200 ms), the whole stagger spreads over the registered stagger budget
 * (60 ms), and the easing is the shared easeOutCubic / smoothstep.
 *
 * The one new number is a DISTANCE, not a duration: rows start UI_ENTRANCE_RISE_DISTANCE_PX below their resting place
 * (like the 3% scale in uiTransition.ts). Reduced motion (owner rule of 2026-11-12, reducedMotion.ts): no movement and
 * no stagger, a plain crossfade of the one shared length (MOTION_REDUCED_MS.crossfade, 200 ms).
 *
 * Pure: no Phaser, DOM, randomness or wall-clock dependency. Resting values are exact (alpha 1, offset 0), so the
 * settled layout is the layout that was built.
 */
import {
  MOTION_DURATION_MS,
  MOTION_EASING,
  MOTION_REDUCED_MS,
  MOTION_STAGGER_BEAM_TOTAL_MS
} from './motionScale';

/** How far below its resting place a row starts (css px). A distance, dropped under reduced motion. */
export const UI_ENTRANCE_RISE_DISTANCE_PX = 8;

export interface UiEntrancePlan {
  /** Length of one row's entrance. */
  readonly rowDurationMs: number;
  /** The stagger budget across all rows (0 under reduced motion). */
  readonly staggerTotalMs: number;
  readonly risePx: number;
  readonly reducedMotion: boolean;
}

export interface UiEntranceRowFrame {
  readonly alpha: number;
  /** Positive = below the resting place; exactly 0 at rest. */
  readonly offsetY: number;
  readonly done: boolean;
}

export const resolveUiEntrancePlan = (reducedMotion: boolean): UiEntrancePlan => (
  reducedMotion
    ? { rowDurationMs: MOTION_REDUCED_MS.crossfade, staggerTotalMs: 0, risePx: 0, reducedMotion: true }
    : {
        rowDurationMs: MOTION_DURATION_MS.base,
        staggerTotalMs: MOTION_STAGGER_BEAM_TOTAL_MS,
        risePx: UI_ENTRANCE_RISE_DISTANCE_PX,
        reducedMotion: false
      }
);

/** Gap between consecutive rows: the budget split over the gaps, so the last row starts at exactly the budget. */
export const resolveUiEntranceStaggerStepMs = (plan: UiEntrancePlan, rowCount: number): number => (
  rowCount > 1 ? plan.staggerTotalMs / (rowCount - 1) : 0
);

/** When the whole entrance is over (last row start plus one row length). */
export const resolveUiEntranceTotalMs = (plan: UiEntrancePlan, rowCount: number): number => (
  plan.rowDurationMs + (rowCount > 1 ? plan.staggerTotalMs : 0)
);

const clamp01 = (value: number): number => (value <= 0 ? 0 : value >= 1 ? 1 : value);

/** Pure function of elapsed ms, so a slow frame only changes how many frames are sampled. */
export const resolveUiEntranceRowFrame = (
  plan: UiEntrancePlan,
  rowIndex: number,
  rowCount: number,
  elapsedMs: number
): UiEntranceRowFrame => {
  const delay = resolveUiEntranceStaggerStepMs(plan, rowCount) * Math.max(0, rowIndex);
  const progress = Number.isFinite(elapsedMs) && plan.rowDurationMs > 0
    ? clamp01((elapsedMs - delay) / plan.rowDurationMs)
    : 1;
  if (progress >= 1) {
    return { alpha: 1, offsetY: 0, done: true };
  }
  return {
    alpha: MOTION_EASING.smoothstep(progress),
    // Whole css px: Phaser roundPixels floors, so a fractional offset would shimmer.
    offsetY: Math.round(plan.risePx * (1 - MOTION_EASING.easeOutCubic(progress))),
    done: false
  };
};

/**
 * Row index (0 = first) for each baseline y: rows are the distinct whole-px y values, top to bottom, so items that
 * share a line enter together. Returns indices in input order plus the row count.
 */
export const assignUiEntranceRows = (ys: readonly number[]): { rows: number[]; rowCount: number } => {
  const keys = ys.map((y) => (Number.isFinite(y) ? Math.round(y) : 0));
  const distinct = [...new Set(keys)].sort((a, b) => a - b);
  const index = new Map(distinct.map((key, i) => [key, i]));
  return { rows: keys.map((key) => index.get(key) ?? 0), rowCount: distinct.length };
};
