// MAZER-PROG-020: the board's cell scale as a function of the LEVEL only.
//
// Every level used to be built on the "frozen board" (scale 35, about 1,225
// cells; 14-16 px tiles on a phone). The owner asked for slightly smaller tiles
// so more tiles fit across and down. This module is the one place that decides
// how many cells a level's board is built from. It is a leaf (no imports) so
// legacyProgression, scripts and tests can all read it without a cycle.
//
// Rules:
// - The scale depends on the level ONLY, never on the device. A device changes
//   only the aspect ratio of the cell grid and the pixel size of a tile.
// - A tile never drops below LEGACY_BOARD_MIN_TILE_PX CSS px on the reference
//   viewports (tests/reset/legacy-board-scale.test.ts runs the real layout).
//   10 px is the Chip tile style's socket threshold (boardTileStyle.socketMinTileCss)
//   and is 30 device px at 3x DPR.

// How finely the floor steps the scale down on a box that cannot hold the board at 10 px.
export const LEGACY_BOARD_FLOOR_SCALE_STEP = 0.05;

// CSS px. The smallest tile a reference phone (320 wide) may be asked to draw.
export const LEGACY_BOARD_MIN_TILE_PX = 10;

// The scale level 1 is built at. Before MAZER-PROG-020 this was 35 for the whole ladder.
export const LEGACY_BOARD_BASE_SCALE = 38;

// The scale the curve approaches and never reaches (owner: a SLIGHT growth, never beyond 40).
export const LEGACY_BOARD_MAX_SCALE = 40;

// Levels past level 1 at which the curve is half way (scale 39). The slope is steepest at level 1
// (2 / 200 = 0.01 scale per level) and shrinks from there, so no adjacent pair of levels differs by
// more than LEGACY_BOARD_MAX_SCALE_STEP.
export const LEGACY_BOARD_GROWTH_HALF_LEVELS = 200;
export const LEGACY_BOARD_MAX_SCALE_STEP = 0.01 + 1e-4;

// The scale the board is built at for a progression level. Level is the completion ordinal
// (1 = the first corridor), not the device. S(L) = 38 + 2 * (L-1) / ((L-1) + 200): 38 at level 1, 39
// at level 201, 39.67 at level 1000, always below 40, strictly increasing. Plain IEEE operations
// rounded to 1e-4, so every engine computes the same number (generated mazes are keyed on it).
export const resolveLegacyBoardScaleForLevel = (level: number): number => {
  const steps = Number.isFinite(level) ? Math.max(0, level - 1) : 0;
  const span = LEGACY_BOARD_MAX_SCALE - LEGACY_BOARD_BASE_SCALE;
  const raw = LEGACY_BOARD_BASE_SCALE + ((span * steps) / (steps + LEGACY_BOARD_GROWTH_HALF_LEVELS));
  return Math.round(raw * 10000) / 10000;
};

// ---------------------------------------------------------------------------------------------------
// MAZER-UI-098: versioned board SIZE RULES.
//
// Rule 1 is the curve above (scale 38 toward 40, 10 px tile floor). It still builds the menu demo board
// and any board a caller pins to rule 1.
//
// Rule 2 (owner decision 2026-11-19: "board size at level 88 is fine if we cap it out there ... it should
// take longer to get to that point ... reach that size by 200 or even further") builds the PLAY board:
// level 1 starts zoomed in (scale 22, about 15 x 31 cells and 24 px tiles on a 390 px phone), the board
// grows with the level and holds at scale 88 (the "scale 88" board of the maze-size demo) from level 250.
// Two phases, both strictly increasing, so the curve is monotone:
//   ramp:  levels 1..40, linear between control points (1, 22) (10, 23) (16, 26) (40, 28). It follows the felt
//          ladder (legacyGeometryBudget.ts), whose targets jump from 215 at level 10 to 372 at 16 and reach 435
//          at 36: a board holds about 0.7 felt steps per cell (measured: scale 22 about 340, 25 about 450, 30
//          about 640) and a small odd grid loses more to rounding, so the early board must stay about 1.8 cells
//          per target step ahead (the ladder test sweeps every level on phone, desktop and square boards).
//   ease:  levels 40..250  28 -> 88, ease-in (quadratic): +0.35 by level 56, about 32.9 at 100, 44.5 at 150,
//          62.8 at 200, then 88 at 250. Beyond 250 the size holds; difficulty keeps coming from the felt
//          ladder, its fringe and (later, held) hazards.
// A tile never drops below LEGACY_BOARD_SIZE_RULE2_MIN_TILE_PX on a device: a box that cannot hold scale
// 88 at that size holds its own lower ceiling (legacyBoardPlan.ts, the same lattice walk as rule 1).
// Plain IEEE operations rounded to 1e-4, so every engine computes the same number.
// Saved attempts record the rule they were built under (legacyAttemptSeed.ts); a saved attempt from
// another rule is not restored. The leaderboard ranks the level ordinal only, so it is size-independent.
export type LegacyBoardSizeRule = 1 | 2;
export const LEGACY_BOARD_SIZE_RULE_LATEST: LegacyBoardSizeRule = 2;
export const LEGACY_BOARD_SIZE_RULE2_RAMP: readonly (readonly [level: number, scale: number])[] = [
  [1, 22],
  [10, 23],
  [16, 26],
  [40, 28]
];
export const LEGACY_BOARD_SIZE_RULE2_START_SCALE = LEGACY_BOARD_SIZE_RULE2_RAMP[0]![1];
export const LEGACY_BOARD_SIZE_RULE2_CAP_LEVEL = 250;
export const LEGACY_BOARD_SIZE_RULE2_CAP_SCALE = 88;
export const LEGACY_BOARD_SIZE_RULE2_MIN_TILE_PX = 5.5;
// Floor lattice step for rule 2 (the span is 66 scale units, rule 1's is 2).
export const LEGACY_BOARD_SIZE_RULE2_FLOOR_STEP = 0.25;

export const resolveLegacyBoardScaleForLevelRule2 = (level: number): number => {
  const ordinal = Number.isFinite(level) ? Math.max(1, level) : 1;
  if (ordinal >= LEGACY_BOARD_SIZE_RULE2_CAP_LEVEL) {
    return LEGACY_BOARD_SIZE_RULE2_CAP_SCALE;
  }
  const ramp = LEGACY_BOARD_SIZE_RULE2_RAMP;
  const [rampEndLevel, rampEndScale] = ramp[ramp.length - 1]!;
  let raw: number;
  if (ordinal <= rampEndLevel) {
    let index = 1;
    while (ramp[index]![0] < ordinal) { index += 1; }
    const [fromLevel, fromScale] = ramp[index - 1]!;
    const [toLevel, toScale] = ramp[index]!;
    raw = fromScale + (((toScale - fromScale) * (ordinal - fromLevel)) / (toLevel - fromLevel));
  } else {
    const easeLevels = LEGACY_BOARD_SIZE_RULE2_CAP_LEVEL - rampEndLevel;
    const easeSteps = ordinal - rampEndLevel;
    raw = rampEndScale + (((LEGACY_BOARD_SIZE_RULE2_CAP_SCALE - rampEndScale) * easeSteps * easeSteps) / (easeLevels * easeLevels));
  }
  return Math.min(LEGACY_BOARD_SIZE_RULE2_CAP_SCALE, Math.round(raw * 10000) / 10000);
};

export const resolveLegacyBoardScaleForRule = (level: number, rule: LegacyBoardSizeRule): number => (
  rule === 2 ? resolveLegacyBoardScaleForLevelRule2(level) : resolveLegacyBoardScaleForLevel(level)
);

export interface LegacyBoardSizeRuleSpec {
  readonly rule: LegacyBoardSizeRule;
  // Where the device-floor lattice is anchored, and the top of the curve.
  readonly baseScale: number;
  readonly maxScale: number;
  readonly minTilePx: number;
  readonly floorStep: number;
  // The smallest scale the rule ever builds (the progression clamp).
  readonly minScale: number;
  // The smallest grid axis its boards may have (legacyMaze.ts normalizeGridDimension); carried to the
  // generator on the play profile as minGridAxis.
  readonly minGridAxis: number;
}

export const resolveLegacyBoardSizeRuleSpec = (rule: LegacyBoardSizeRule): LegacyBoardSizeRuleSpec => (
  rule === 2
    ? {
      rule: 2,
      baseScale: LEGACY_BOARD_SIZE_RULE2_START_SCALE,
      maxScale: LEGACY_BOARD_SIZE_RULE2_CAP_SCALE,
      minTilePx: LEGACY_BOARD_SIZE_RULE2_MIN_TILE_PX,
      floorStep: LEGACY_BOARD_SIZE_RULE2_FLOOR_STEP,
      minScale: LEGACY_BOARD_SIZE_RULE2_START_SCALE,
      minGridAxis: 15
    }
    : {
      rule: 1,
      baseScale: LEGACY_BOARD_BASE_SCALE,
      maxScale: LEGACY_BOARD_MAX_SCALE,
      minTilePx: LEGACY_BOARD_MIN_TILE_PX,
      floorStep: LEGACY_BOARD_FLOOR_SCALE_STEP,
      minScale: 25,
      minGridAxis: 25
    }
);

// Difficulty/complexity tuning stays anchored to the single "scale" figure; only the final grid
// shape is split into width/height, using aspectRatio (width/height) to spread the same
// approximate cell count (scale x scale) over a non-square grid. Lives here (a leaf) so the
// generator, the layout planner and the calibration scripts share ONE rounding rule.
export const resolveLegacyBoardDimensions = (scale: number, aspectRatio: number): { width: number; height: number } => {
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const ratioRoot = Math.sqrt(safeAspectRatio);
  return {
    width: Math.round(scale * ratioRoot),
    height: Math.round(scale / ratioRoot)
  };
};
