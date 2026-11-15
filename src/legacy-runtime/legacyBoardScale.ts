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

// CSS px. The smallest tile a reference phone (320 wide) may be asked to draw.
export const LEGACY_BOARD_MIN_TILE_PX = 10;

// The scale every level starts from (and, in the first slice, the scale of
// every level). Before MAZER-PROG-020 this was 35 for the whole ladder.
export const LEGACY_BOARD_BASE_SCALE = 38;

// The scale the board is built at for a progression level. Level is the
// completion ordinal (1 = the first corridor), not the device.
export const resolveLegacyBoardScaleForLevel = (_level: number): number => LEGACY_BOARD_BASE_SCALE;

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
