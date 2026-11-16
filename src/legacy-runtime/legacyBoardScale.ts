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
