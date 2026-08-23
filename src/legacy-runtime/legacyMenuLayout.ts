import { clampInteger } from './legacyDefaults';
import { resolveLegacyHeaderControlFrame } from './legacyHeaderControl';
import { resolveLegacyMenuTitleFootprintWidth } from './legacyMenuTitle';
import { LEGACY_UI_MIN_TOUCH_TARGET } from './legacyUiStandards';

export interface LegacyMenuLayout {
  width: number;
  height: number;
  boardLeft: number;
  boardTop: number;
  boardWidth: number;
  boardHeight: number;
  tileSize: number;
  titleX: number;
  titleY: number;
  titleReserveHeight: number;
  footerY: number;
  buttonLayout: 'row' | 'stack';
  buttonY: number;
  centerButtonY: number;
  leftButtonY: number;
  rightButtonY: number;
  centerButtonWidth: number;
  leftButtonX: number;
  centerButtonX: number;
  rightButtonX: number;
  buttonWidth: number;
  buttonHeight: number;
  lanes: {
    actions: LegacyMenuLayoutLane | null;
    controls: LegacyMenuLayoutLane | null;
    hud: LegacyMenuLayoutLane | null;
    maze: LegacyMenuLayoutLane;
    rank: LegacyMenuLayoutLane | null;
    title: LegacyMenuLayoutLane | null;
  };
}

export interface LegacyMenuLayoutLane {
  bottom: number;
  height: number;
  top: number;
}

export type LegacyMenuLayoutSurface = 'menu' | 'play';

export interface LegacyMenuLayoutOptions {
  browserMobileParity?: boolean;
  menuActionMode?: 'authenticated' | 'guest';
  /**
   * Device safe-area insets (notch, dynamic island, home indicator). The
   * canvas itself is always full-bleed to the true screen edges (background
   * and board art are never inset) -- these push just the individual UI
   * lanes (header icons, title, bottom dock button) clear of the obstacle
   * instead of shrinking the whole canvas.
   */
  safeArea?: { top?: number; right?: number; bottom?: number; left?: number };
  /**
   * The play surface's touch movement control is a floating stick that
   * spawns wherever the player first touches down and draws on top of the
   * board, instead of a fixed D-pad/stick sitting in a permanently reserved
   * bottom lane. When true, the play board drops that big reserved lane
   * (playControlReserve) for the same hair-of-margin full-bleed treatment
   * the menu surface already uses.
   */
  useFloatingTouchControls?: boolean;
  /**
   * resolveLegacyMenuBoardAspectRatio only, and only as a pre-generation
   * approximation aid: the real mazeWidth/mazeHeight this call is choosing
   * the aspect ratio FOR aren't known yet (real generation hasn't run), so
   * it has to guess how many tiles will fit per axis to estimate the same
   * one-tile bleedMargin shrink resolveLegacyMenuLayout applies afterward
   * with the real cell counts. Passing the actual complexity-driven
   * generation scale here (once known) replaces a much rougher stand-in
   * (the user's boardScale/zoom preference, a different quantity in the
   * same numeric range) and keeps the pre-estimate and the real post-
   * generation margin from drifting apart on narrow viewports, where the
   * same absolute margin error shifts the width axis's proportion far more
   * than the height axis's. Omit when the real scale genuinely isn't known
   * yet (falls back to the boardScale approximation, as before).
   */
  knownCellScale?: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const LEGACY_MENU_SIDE_PANEL_WIDTH = 300;
const LEGACY_DIAGNOSTIC_PANEL_WIDTH = 172;
const LEGACY_DIAGNOSTIC_PANEL_HEIGHT = 407;
const LEGACY_PLAY_ULTRA_NARROW_WIDTH = 360;
const LEGACY_PHONE_CLEAN_ZOOM_WIDTH = 420;
const LEGACY_PHONE_CLEAN_SAFE_INSET = 7;
const LEGACY_PHONE_CLEAN_OUTER_MARGIN = 4;
// Play now uses a compact level glyph, centered timer, and icon-only Pause
// control. Keep the HUD lane slim so the maze earns the reclaimed space.
const LEGACY_PLAY_TOP_HUD_MIN = 56;
const LEGACY_PLAY_TOP_HUD_MAX = 72;
// The menu also owns a pair of header controls (level and settings). Reserve
// their lane before positioning the title or maze so narrow desktop and
// landscape layouts cannot place content underneath those controls.
const LEGACY_MENU_TOP_HUD_MIN = 56;
const LEGACY_MENU_TOP_HUD_MAX = 72;

const createLane = (top: number, height: number): LegacyMenuLayoutLane => ({
  top: Math.round(top),
  height: Math.max(0, Math.round(height)),
  bottom: Math.round(top) + Math.max(0, Math.round(height))
});

// Probes the board's available pixel box (width-bound vs height-bound target)
// purely from viewport dimensions, with no maze size input -- this lets a
// caller pick a maze aspect ratio (width:height cell count) BEFORE
// generating, so the eventual maze naturally fills both axes of the box
// instead of being fit into it after the fact. This intentionally
// duplicates the viewport-only subset of resolveLegacyMenuLayout's math
// (through boardWidthTarget/boardHeightTarget) rather than trying to share
// state with it, since that subset has no maze-size dependency and is safe
// to evaluate standalone. If the reserve/board-bound formulas in
// resolveLegacyMenuLayout change, mirror the change here too.
export const resolveLegacyMenuBoardAspectRatio = (
  width: number,
  height: number,
  scale: number,
  surface: LegacyMenuLayoutSurface = 'menu',
  options: LegacyMenuLayoutOptions = {}
): number => {
  const normalizedScale = clampInteger(scale, 25, 150);
  const isPortrait = height > width;
  const isPlaySurface = surface === 'play';
  const isSidePanelPortrait = isPortrait && width < LEGACY_MENU_SIDE_PANEL_WIDTH;
  const isPlayUltraNarrow = isPlaySurface && isPortrait && width < LEGACY_PLAY_ULTRA_NARROW_WIDTH;
  const isUltraNarrow = isSidePanelPortrait || isPlayUltraNarrow;
  const shouldUseCleanPhoneCadence = isPortrait
    && !isUltraNarrow
    && (width <= LEGACY_PHONE_CLEAN_ZOOM_WIDTH || options.browserMobileParity === true);
  const safeAreaTop = Math.max(0, Math.round(options.safeArea?.top ?? 0));
  const safeAreaRight = Math.max(0, Math.round(options.safeArea?.right ?? 0));
  const safeAreaBottom = Math.max(0, Math.round(options.safeArea?.bottom ?? 0));
  const safeAreaLeft = Math.max(0, Math.round(options.safeArea?.left ?? 0));
  const laneGap = isUltraNarrow ? 4 : 8;
  const playTopHudReserve = (isPlaySurface && isPortrait
    ? Math.round(clamp(height * 0.072, LEGACY_PLAY_TOP_HUD_MIN, LEGACY_PLAY_TOP_HUD_MAX))
    : 56) + safeAreaTop;
  const playControlReserve = isPlaySurface
    ? (options.useFloatingTouchControls === true
      ? safeAreaBottom + (isUltraNarrow ? 2 : 4)
      : Math.round(clamp(width * 0.52, isUltraNarrow ? 160 : 188, 230)))
    : 0;
  // The menu board is full-bleed top-to-bottom -- the header icons
  // (level/settings), title wordmark, and Login/Start dock button float
  // above it as an overlay instead of the board leaving a dedicated lane
  // clear for them. Only a hair of margin (plus any device safe-area inset)
  // keeps tiles off the literal screen edge. Mirrors
  // resolveLegacyMenuLayout's own menuBoardTop/menuBottomReserve -- keep
  // both in sync if either changes.
  const menuFullBleedTopMargin = safeAreaTop + (isUltraNarrow ? 2 : 4);
  const menuFullBleedBottomMargin = safeAreaBottom + (isUltraNarrow ? 2 : 4);
  const menuAvailableBoardHeight = Math.max(60, height - menuFullBleedTopMargin - menuFullBleedBottomMargin);
  // Play's HUD (level/compass/settings) already floats over the board the
  // same way menu's header does -- useFloatingTouchControls means there's
  // no fixed control widget below it either, so once that flag is set play
  // gets the exact same tiny full-bleed top margin as menu instead of a
  // real reserved lane pushing the board down by playTopHudReserve. Mirrors
  // resolveLegacyMenuLayout's own playTopBoardMargin -- keep both in sync.
  const playTopBoardMargin = options.useFloatingTouchControls === true
    ? menuFullBleedTopMargin
    : playTopHudReserve + laneGap;
  // Mirrors resolveLegacyMenuLayout's own playBottomGapCount -- floating-
  // controls playControlReserve already equals the full-bleed bottom
  // margin exactly (see its own definition above), not a lane that still
  // needs a laneGap in front of it; keep both in sync.
  const playBottomGapCount = options.useFloatingTouchControls === true ? 0 : 2;
  // playControlReserve already folds safeAreaBottom in for the floating-
  // controls case (see its own definition above) -- subtracting it again
  // here double-counted the inset, starving the board of up to a full
  // safeAreaBottom worth of height and leaving a real gap between the
  // board's bottom edge and the true safe screen edge on any device with a
  // nonzero bottom inset (home-indicator phones especially). Only the
  // non-floating branch (whose playControlReserve has no safeAreaBottom
  // component) still needs it subtracted separately.
  const playVerticalBoardLimit = height
    - playTopBoardMargin
    - (playControlReserve + (laneGap * playBottomGapCount))
    - (options.useFloatingTouchControls === true ? 0 : safeAreaBottom);
  const laneBoardLimit = Math.max(96, isPlaySurface ? playVerticalBoardLimit : menuAvailableBoardHeight);
  const baseBoardScale = isPortrait ? 0.92 : 0.62;
  const cleanPhoneWidthScale = shouldUseCleanPhoneCadence ? 0.98 : null;
  const scaleBias = 1 + ((normalizedScale - 50) / 500);
  const menuEdgeMargin = isUltraNarrow ? 4 : (shouldUseCleanPhoneCadence ? 4 : 8);
  const menuMaxBoardByWidth = Math.max(60, width - (menuEdgeMargin * 2) - safeAreaLeft - safeAreaRight);
  // Same floating-controls-implies-full-bleed reasoning as the top margin
  // above, applied to the left/right edges -- when true, play gets the
  // identical tight pixel margin menu already uses instead of a generous
  // percentage-of-width scale. Mirrors resolveLegacyMenuLayout's own
  // playMaxBoardByWidth -- keep both in sync.
  const maxBoardWidthBound = isPlaySurface
    ? (options.useFloatingTouchControls === true
      ? menuMaxBoardByWidth
      : width * (cleanPhoneWidthScale ?? (isUltraNarrow ? 0.98 : (isPortrait ? 0.92 : 0.78))))
    : menuMaxBoardByWidth;
  // These height ratios (0.74/0.86 max, 0.64/0.84 raw) predate the floating
  // stick and independently capped the board well short of laneBoardLimit,
  // on the assumption there always had to be visible breathing room below
  // the board for a fixed control widget. With useFloatingTouchControls
  // there's no such widget to leave room for -- laneBoardLimit (which
  // already accounts for the top HUD and a hair of bottom margin) is the
  // real constraint. The width axis already dropped its equivalent scale
  // entirely for this case (maxBoardWidthBound above uses menuMaxBoardByWidth
  // directly, no multiplier) -- height kept a leftover 0.97 "near-1 ceiling"
  // that measured live as the actual binding constraint (height*0.97 landing
  // below the now-correct laneBoardLimit), silently re-introducing the same
  // few-px bottom shortfall laneBoardLimit's own playBottomGapCount fix just
  // removed. Dropped to match width's treatment exactly: no separate scale
  // for the floating-controls case, laneBoardLimit alone governs.
  const playFullBleedHeightScale = isPortrait ? 0.74 : 0.86;
  const maxBoardHeightBound = isPlaySurface
    ? (options.useFloatingTouchControls === true
      ? laneBoardLimit
      : Math.min(height * playFullBleedHeightScale, laneBoardLimit))
    : laneBoardLimit;
  const minBoardWidthBound = Math.min(maxBoardWidthBound, 300);
  const minBoardHeightBound = Math.min(maxBoardHeightBound, 300);
  const rawBoardWidthBound = isPlaySurface
    ? (options.useFloatingTouchControls === true
      ? menuMaxBoardByWidth * scaleBias
      : width * (cleanPhoneWidthScale ?? baseBoardScale) * scaleBias)
    : menuMaxBoardByWidth * scaleBias;
  const rawBoardHeightBound = isPlaySurface
    ? (options.useFloatingTouchControls === true
      ? laneBoardLimit * scaleBias
      : Math.min(height * (isPortrait ? 0.64 : 0.84) * scaleBias, laneBoardLimit))
    : laneBoardLimit * scaleBias;
  const boardWidthTarget = Math.round(clamp(rawBoardWidthBound, minBoardWidthBound, maxBoardWidthBound));
  const boardHeightTarget = Math.round(clamp(rawBoardHeightBound, minBoardHeightBound, maxBoardHeightBound));

  if (boardWidthTarget <= 0 || boardHeightTarget <= 0) {
    return 1;
  }

  // resolveLegacyMenuLayout shrinks boardWidthTarget/boardHeightTarget by a
  // one-tile bleedMargin on every side (see marginedBoardWidthTarget there)
  // before it actually lays the maze out -- but that shrink depends on
  // mazeWidth/mazeHeight, which this function is the one choosing, before
  // generation. Picking the aspect ratio from the un-margined box while the
  // real layout fits it into the margined one lets the two boxes' aspect
  // ratios drift apart on non-square viewports (portrait phones especially,
  // since the same absolute margin shaves proportionally more off the
  // narrower width axis than the taller height axis), which is exactly what
  // left the vertical axis with more than one tile of leftover centering
  // slack -- more than the bleed-off dock corridor (capped at one tile, see
  // resolveLegacyPathBorderDockContinuation in MenuScene.ts) can bridge, so
  // it stopped short of the true top/bottom screen edge. mazeWidth/
  // mazeHeight aren't known yet here, so approximate the same tile-size
  // estimate using `scale` (the target linear cell count) as a stand-in for
  // both axes' eventual cell counts -- close enough to keep the two
  // functions' box aspect ratios in sync within about a tile, which is the
  // dock corridor's own tolerance. Prefer the real generation scale
  // (options.knownCellScale) once the caller has it -- normalizedScale is
  // the user's boardScale/zoom preference (25-150), a different quantity
  // that happens to share the same rough numeric range as real cell counts,
  // not an actual stand-in for them.
  const cellCountEstimate = options.knownCellScale ?? normalizedScale;
  const estimatedAspectTileSize = Math.min(boardWidthTarget, boardHeightTarget) / Math.max(1, cellCountEstimate);
  const aspectBleedMargin = isPlaySurface ? 0 : Math.max(2, Math.round(estimatedAspectTileSize));
  const marginedAspectBoardWidthTarget = Math.max(minBoardWidthBound, boardWidthTarget - (aspectBleedMargin * 2));
  const marginedAspectBoardHeightTarget = Math.max(minBoardHeightBound, boardHeightTarget - (aspectBleedMargin * 2));

  // Clamp to a sane range so an extreme viewport (very tall phone in
  // split-screen, ultra-wide monitor) can't request a degenerate 1-wide or
  // 1-tall maze -- the generation pipeline's checkpoint/shortcut budgets are
  // tuned for roughly square-ish grids and get unreliable well outside this.
  return clamp(marginedAspectBoardWidthTarget / marginedAspectBoardHeightTarget, 0.45, 2.2);
};

export const resolveLegacyMenuLayout = (
  width: number,
  height: number,
  scale: number,
  mazeWidth: number,
  mazeHeight: number,
  surface: LegacyMenuLayoutSurface = 'menu',
  options: LegacyMenuLayoutOptions = {}
): LegacyMenuLayout => {
  const normalizedScale = clampInteger(scale, 25, 150);
  const isPortrait = height > width;
  const isPlaySurface = surface === 'play';
  const isSidePanelPortrait = isPortrait && width < LEGACY_MENU_SIDE_PANEL_WIDTH;
  const isPlayUltraNarrow = isPlaySurface && isPortrait && width < LEGACY_PLAY_ULTRA_NARROW_WIDTH;
  const isUltraNarrow = isSidePanelPortrait || isPlayUltraNarrow;
  // This exact viewport is the internal diagnostic side panel. It is the one
  // constrained surface that cannot fit its stacked actions at 44px without
  // overlapping the board; every normal narrow browser or phone keeps the
  // canonical touch floor.
  const isConstrainedDiagnosticPanel = isPortrait
    && Math.round(width) === LEGACY_DIAGNOSTIC_PANEL_WIDTH
    && Math.round(height) === LEGACY_DIAGNOSTIC_PANEL_HEIGHT;
  const usesStackedButtons = isSidePanelPortrait;
  const shouldUseCleanPhoneCadence = isPortrait
    && !isUltraNarrow
    && (width <= LEGACY_PHONE_CLEAN_ZOOM_WIDTH || options.browserMobileParity === true);
  const safeAreaTop = Math.max(0, Math.round(options.safeArea?.top ?? 0));
  const safeAreaRight = Math.max(0, Math.round(options.safeArea?.right ?? 0));
  const safeAreaBottom = Math.max(0, Math.round(options.safeArea?.bottom ?? 0));
  const safeAreaLeft = Math.max(0, Math.round(options.safeArea?.left ?? 0));
  // The exact 172px diagnostic side panel cannot fit two 44px actions plus the
  // maze without overlap. Preserve that constrained fallback; normal narrow
  // phone and split-screen layouts use the canonical touch target below.
  const minimumMenuActionHeight = isConstrainedDiagnosticPanel
    ? 42
    : (isPortrait ? LEGACY_UI_MIN_TOUCH_TARGET : 58);
  const buttonHeight = Math.round(clamp(
    height * (isPortrait ? 0.05 : 0.066),
    minimumMenuActionHeight,
    isPortrait ? 62 : 78
  ));
  const stackGap = Math.round(clamp(height * 0.02, 7, 12));
  const laneGap = isUltraNarrow ? 4 : 8;
  const menuTopReserve = isUltraNarrow ? 6 : Math.round(clamp(height * 0.02, 16, 20));
  // Always reserve real space for the header icons (AI badge, settings cog)
  // on the menu surface, even in ultra-narrow width. The previous code
  // zeroed this reserve below 300px on the theory the header would occupy
  // no space there, but createLegacyMenuSettingsCogButton draws the header
  // icon unconditionally regardless of width -- the reserve-vs-actual
  // mismatch let the title lane start underneath it, causing a real,
  // reproducible overlap at every ultra-narrow size.
  const menuTopHudReserve = !isPlaySurface
    ? Math.round(clamp(height * 0.072, isUltraNarrow ? 44 : LEGACY_MENU_TOP_HUD_MIN, LEGACY_MENU_TOP_HUD_MAX))
    : 0;
  // The title prefers to sit inline in the header row, centered in the gap
  // between the leading (AI/level) badge and the trailing settings cog --
  // not as a separate banner lane above the board. Only fall back to the
  // banner lane below when that gap is too narrow to hold the wordmark
  // legibly (e.g. the diagnostic side panel and other very narrow widths).
  let menuTitleFitsInHeader = false;
  let menuHeaderTitleCenterX = Math.round(width / 2);
  let menuHeaderTitleCenterY = 0;
  if (!isPlaySurface && menuTopHudReserve > 0) {
    const leadingHeaderFrame = resolveLegacyHeaderControlFrame({
      height,
      hudHeight: menuTopHudReserve,
      hudTop: safeAreaTop,
      placement: 'leading',
      width
    });
    const trailingHeaderFrame = resolveLegacyHeaderControlFrame({
      height,
      hudHeight: menuTopHudReserve,
      hudTop: safeAreaTop,
      placement: 'trailing',
      width
    });
    const headerGap = trailingHeaderFrame.left - leadingHeaderFrame.right;
    // Keep this formula identical to resolveLegacyMenuTitlePresentation's
    // fontSize in legacyMenuTitle.ts, or the fit-check here and the actual
    // rendered size will drift apart.
    const inlineTitleFontSize = Math.max(22, Math.round(menuTopHudReserve * 0.68));
    const inlineTitleWidth = resolveLegacyMenuTitleFootprintWidth(inlineTitleFontSize);
    const inlineTitlePadding = 24;
    if (headerGap >= inlineTitleWidth + inlineTitlePadding) {
      menuTitleFitsInHeader = true;
      menuHeaderTitleCenterX = Math.round((leadingHeaderFrame.right + trailingHeaderFrame.left) / 2);
      menuHeaderTitleCenterY = Math.round(leadingHeaderFrame.centerY);
    }
  }
  // Title is deliberately compact and sized purely from viewport dimensions
  // (not from board size -- see the circular-dependency note on
  // resolveLegacyMenuTitlePresentation in legacyMenuTitle.ts). The board
  // claims essentially everything else, so this must stay small on purpose:
  // it is a slim wordmark banner, not a hero element.
  const menuTitleReserve = isUltraNarrow
    ? 32
    : Math.round(clamp(Math.min(height * 0.055, width * 0.11), 34, 56));
  // Bottom-docked primary button (Fitness-app BottomDockButton style): a
  // wide pill sitting near the bottom edge with its own margin, not tightly
  // hugging the board like the old row/stack action lane did.
  const dockBottomMargin = (isUltraNarrow ? 10 : 20) + safeAreaBottom;
  const playTopHudReserve = (isPlaySurface && isPortrait
    ? Math.round(clamp(height * 0.072, LEGACY_PLAY_TOP_HUD_MIN, LEGACY_PLAY_TOP_HUD_MAX))
    : 56) + safeAreaTop;
  const playControlReserve = isPlaySurface
    ? (options.useFloatingTouchControls === true
      ? safeAreaBottom + (isUltraNarrow ? 2 : 4)
      : Math.round(clamp(width * 0.52, isUltraNarrow ? 160 : 188, 230)))
    : 0;
  // Menu surface: the header icons (level/settings), title wordmark, and
  // Login/Start dock button all float above the board as an overlay instead
  // of the board leaving a dedicated lane clear for them -- the board is
  // full-bleed top-to-bottom, only clipped by a hair of margin (plus any
  // device safe-area inset) so tiles stay off the literal screen edge.
  // menuStackTop/menuTitleTop still anchor the title's own position when it
  // doesn't fit inline in the header (see titleLaneTop below) -- they no
  // longer feed the board's bound.
  const menuStackTop = safeAreaTop + menuTopHudReserve + menuTopReserve;
  const menuTitleTop = menuStackTop + laneGap;
  const menuFullBleedTopMargin = safeAreaTop + (isUltraNarrow ? 2 : 4);
  const menuFullBleedBottomMargin = safeAreaBottom + (isUltraNarrow ? 2 : 4);
  const menuBoardTop = menuFullBleedTopMargin;
  const menuBottomReserve = menuFullBleedBottomMargin;
  const menuAvailableBoardHeight = Math.max(60, height - menuBoardTop - menuBottomReserve);

  // Play's HUD (level/compass/settings) already floats over the board the
  // same way menu's header does -- useFloatingTouchControls means there's
  // no fixed control widget below it either, so once that flag is set play
  // gets the exact same tiny full-bleed top margin as menu instead of a
  // real reserved lane pushing the board down by playTopHudReserve. Mirrors
  // resolveLegacyMenuBoardAspectRatio's own playTopBoardMargin -- keep both
  // in sync.
  const playTopBoardMargin = options.useFloatingTouchControls === true
    ? menuFullBleedTopMargin
    : playTopHudReserve + laneGap;
  // Floating-controls playControlReserve already equals exactly
  // menuFullBleedBottomMargin (safeAreaBottom + a hair of margin) -- it IS
  // the full-bleed bottom margin, not a lane that still needs its own gap
  // in front of it the way the old fixed-widget lane did. Adding a whole
  // extra laneGap on top of it (the old "1" here) reserved real additional
  // space at the bottom with no equivalent reservation at the top, which
  // is exactly why the board's measured top margin and bottom margin
  // weren't actually equal despite every comment near here claiming
  // "the exact same tiny full-bleed top margin" -- confirmed live: 4px top
  // vs 14px bottom on an otherwise safe-area-free viewport (4px hair
  // margin + 8px stray laneGap + ~2px tile-snap rounding).
  const playBottomGapCount = options.useFloatingTouchControls === true ? 0 : 2;
  // Mirrors resolveLegacyMenuBoardAspectRatio's own playVerticalBoardLimit --
  // playControlReserve already folds safeAreaBottom in for the floating-
  // controls case, so subtracting it again here double-counted the inset.
  // Keep both in sync.
  const playVerticalBoardLimit = height
    - playTopBoardMargin
    - (playControlReserve + (laneGap * playBottomGapCount))
    - (options.useFloatingTouchControls === true ? 0 : safeAreaBottom);
  const laneBoardLimit = Math.max(96, isPlaySurface ? playVerticalBoardLimit : menuAvailableBoardHeight);
  const baseBoardScale = isPortrait ? 0.92 : 0.62;
  const cleanPhoneWidthScale = shouldUseCleanPhoneCadence ? 0.98 : null;
  const scaleBias = 1 + ((normalizedScale - 50) / 500);
  // Tightened from 6/8/12 per feedback wanting the board to sit closer to
  // the screen's left/right edges -- the maze render frame's own safe
  // inset (LEGACY_BOARD_MAZE_SAFE_INSET_*, 4-7px) still keeps the actual
  // tiles a little clear of the literal edge, so this isn't pixel-zero.
  const menuEdgeMargin = isUltraNarrow ? 4 : (shouldUseCleanPhoneCadence ? 4 : 8);
  const menuMaxBoardByWidth = Math.max(60, width - (menuEdgeMargin * 2) - safeAreaLeft - safeAreaRight);
  // Width-bound and height-bound board limits are resolved independently --
  // each axis gets its own max/min/raw target -- so a non-square maze
  // (mazeWidth !== mazeHeight) can genuinely fill both the full available
  // width AND the full available vertical lane at once, instead of being
  // capped to whichever axis is smaller the way a single combined maxBoardSize
  // forced a square box even on a non-square viewport. When mazeWidth ===
  // mazeHeight (the pre-rectangular default), taking Math.min() of the two
  // axis tile sizes below reduces to exactly the old combined-min formula --
  // this is a pure axis split, not a behavior change, for the square case.
  // Same floating-controls-implies-full-bleed reasoning as the top margin
  // above, applied to the left/right edges -- mirrors
  // resolveLegacyMenuBoardAspectRatio's own maxBoardWidthBound -- keep both
  // in sync.
  const maxBoardWidthBound = isPlaySurface
    ? (options.useFloatingTouchControls === true
      ? menuMaxBoardByWidth
      : width * (cleanPhoneWidthScale ?? (isUltraNarrow ? 0.98 : (isPortrait ? 0.92 : 0.78))))
    : menuMaxBoardByWidth;
  // These height ratios (0.74/0.86 max, 0.64/0.84 raw) predate the floating
  // stick and independently capped the board well short of laneBoardLimit,
  // on the assumption there always had to be visible breathing room below
  // the board for a fixed control widget. With useFloatingTouchControls
  // there's no such widget to leave room for -- laneBoardLimit (which
  // already accounts for the top HUD and a hair of bottom margin) is the
  // real constraint. The width axis already dropped its equivalent scale
  // entirely for this case (maxBoardWidthBound above uses menuMaxBoardByWidth
  // directly, no multiplier) -- height kept a leftover 0.97 "near-1 ceiling"
  // that measured live as the actual binding constraint (height*0.97 landing
  // below the now-correct laneBoardLimit), silently re-introducing the same
  // few-px bottom shortfall laneBoardLimit's own playBottomGapCount fix just
  // removed. Dropped to match width's treatment exactly: no separate scale
  // for the floating-controls case, laneBoardLimit alone governs.
  const playFullBleedHeightScale = isPortrait ? 0.74 : 0.86;
  const maxBoardHeightBound = isPlaySurface
    ? (options.useFloatingTouchControls === true
      ? laneBoardLimit
      : Math.min(height * playFullBleedHeightScale, laneBoardLimit))
    : laneBoardLimit;
  // Must never exceed the max bound -- the old `Math.max(120, maxBoardSize)`
  // could force a 120px floor even when maxBoardSize (the safe fill bound)
  // was itself smaller than 120 at extreme short heights, inverting the
  // clamp below and pushing the board past its safe bound into the dock
  // reserve. Same self-correcting min() applies per axis here.
  const minBoardWidthBound = Math.min(maxBoardWidthBound, 300);
  const minBoardHeightBound = Math.min(maxBoardHeightBound, 300);
  const rawBoardWidthBound = isPlaySurface
    ? (options.useFloatingTouchControls === true
      ? menuMaxBoardByWidth * scaleBias
      // cleanPhoneWidthScale must override baseBoardScale here exactly like it
      // does in maxBoardWidthBound above -- dropping it silently shrank the
      // play-surface board on clean-phone-cadence widths (<=420px portrait).
      : width * (cleanPhoneWidthScale ?? baseBoardScale) * scaleBias)
    : menuMaxBoardByWidth * scaleBias;
  const rawBoardHeightBound = isPlaySurface
    ? (options.useFloatingTouchControls === true
      ? laneBoardLimit * scaleBias
      : Math.min(height * (isPortrait ? 0.64 : 0.84) * scaleBias, laneBoardLimit))
    // scaleBias is the user's own board-scale preference (Options); let it
    // shrink the board below the max fill, but the maxBoardHeightBound clamp
    // below guarantees it can never grow past the safe fill bound and
    // reintroduce overlap.
    : laneBoardLimit * scaleBias;
  const boardWidthTarget = Math.round(clamp(rawBoardWidthBound, minBoardWidthBound, maxBoardWidthBound));
  const boardHeightTarget = Math.round(clamp(rawBoardHeightBound, minBoardHeightBound, maxBoardHeightBound));
  // Reserve a full tile of margin on every side of the menu surface's board,
  // the same way the left/right edges already effectively got one from
  // menuEdgeMargin/cleanPhoneInsetPad -- so a bleed-off dock corridor always
  // has exactly one tile of room to reach the true screen edge, and a
  // non-bleed corridor never ends up sitting flush against it. The previous
  // per-axis margins were small fixed pixel values unrelated to tile size (a
  // few px), and the vertical axis in particular could land far more than a
  // tile away purely from centering slack when the maze's cell aspect ratio
  // didn't perfectly match the viewport -- neither was a deliberate,
  // consistent "one tile" reservation. Estimate the tile size from the
  // un-margined box first (a single-pass approximation, the same pattern
  // resolveLegacyMazeRenderFrame's own render-time inset already uses) --
  // landing within a pixel or two of one tile is the goal, not perfect
  // precision. Play surface is untouched: its board size is already tuned
  // against the touch-control layout below it, and play's board doesn't use
  // this same bleed-off dock decoration language.
  const estimatedTileSize = Math.min(
    boardWidthTarget / Math.max(1, mazeWidth),
    boardHeightTarget / Math.max(1, mazeHeight)
  );
  const bleedMargin = isPlaySurface ? 0 : Math.max(2, Math.round(estimatedTileSize));
  const marginedBoardWidthTarget = Math.max(minBoardWidthBound, boardWidthTarget - (bleedMargin * 2));
  const marginedBoardHeightTarget = Math.max(minBoardHeightBound, boardHeightTarget - (bleedMargin * 2));
  // A uniform tileSize (square cells) is the smaller of the two axis-derived
  // tile sizes, so the board never overflows either bound -- whichever axis
  // is the tighter constraint fills its bound exactly, and the other axis
  // gets centered slack (see menuBoardCenterOffset/boardLeft below).
  const rawTileSizeFromWidth = marginedBoardWidthTarget / Math.max(1, mazeWidth);
  const rawTileSizeFromHeight = marginedBoardHeightTarget / Math.max(1, mazeHeight);
  const rawTileSize = Math.min(rawTileSizeFromWidth, rawTileSizeFromHeight);
  const cleanPhoneBoardWidth = Math.max(
    1,
    Math.min(marginedBoardWidthTarget, width - (LEGACY_PHONE_CLEAN_OUTER_MARGIN * 2))
  );
  const cleanPhoneInsetPad = LEGACY_PHONE_CLEAN_SAFE_INSET * 2;
  const cleanPhoneTileSize = Math.min(
    (cleanPhoneBoardWidth - cleanPhoneInsetPad) / Math.max(1, mazeWidth),
    marginedBoardHeightTarget / Math.max(1, mazeHeight)
  );
  const tileSize = isUltraNarrow
    ? Math.max(3, Number(rawTileSize.toFixed(3)))
    : shouldUseCleanPhoneCadence
      ? Math.max(4, Number(cleanPhoneTileSize.toFixed(3)))
    : Math.max(4, Math.floor(rawTileSize));
  const snappedBoardWidth = shouldUseCleanPhoneCadence
    ? Math.round(cleanPhoneBoardWidth)
    : Math.round(tileSize * mazeWidth * 1000) / 1000;
  // Mirror the width axis's inset padding onto height so a clean-phone-
  // cadence board reads with symmetric slack on all four sides instead of
  // only left/right.
  const snappedBoardHeight = shouldUseCleanPhoneCadence
    ? Math.round((tileSize * mazeHeight) + cleanPhoneInsetPad)
    : Math.round(tileSize * mazeHeight * 1000) / 1000;
  const boardLeft = Math.round(safeAreaLeft + ((width - safeAreaLeft - safeAreaRight - snappedBoardWidth) / 2));
  // The board claims its full width-constrained size regardless of how much
  // vertical room is actually available (laneBoardLimit already bounds it
  // safely) -- on most portrait phones that leaves real slack between the
  // title/header above and the dock button below. Center the board within
  // that slack instead of leaving it pinned to the top with a large empty
  // gap beneath it and above the dock button.
  const menuBoardZoneTop = menuBoardTop;
  const menuBoardZoneBottom = height - menuBottomReserve;
  const menuBoardZoneHeight = Math.max(0, menuBoardZoneBottom - menuBoardZoneTop);
  const menuBoardCenterOffset = !isPlaySurface
    ? Math.max(0, (menuBoardZoneHeight - snappedBoardHeight) / 2)
    : 0;
  const boardTop = Math.round(
    isPlaySurface ? playTopBoardMargin : (menuBoardZoneTop + menuBoardCenterOffset)
  );
  const menuDockButtonY = height - dockBottomMargin - Math.round(buttonHeight / 2);
  const playRowButtonY = isPortrait
    ? boardTop + snappedBoardHeight + Math.round(buttonHeight * 0.86)
    : boardTop + snappedBoardHeight + Math.round(buttonHeight * 0.54);
  const rowButtonY = isPlaySurface
    ? (isPortrait
      ? Math.round(clamp(playRowButtonY, boardTop + snappedBoardHeight + 26, height - Math.round(buttonHeight * 0.76)))
      : Math.round(clamp(playRowButtonY, boardTop + snappedBoardHeight + 24, height - Math.round(buttonHeight * 0.54))))
    // Menu: the dock button's position is already guaranteed clear of the
    // board by the menuBottomReserve subtraction above -- no clamp needed.
    : menuDockButtonY;
  const buttonWidth = Math.round(clamp(width * (isPortrait ? 0.29 : 0.118), isUltraNarrow ? 96 : (isPortrait ? 118 : 164), isPortrait ? Math.min(132, width - 36) : 238));
  const centerButtonWidth = isPortrait
    ? buttonWidth
    : Math.round(clamp(buttonWidth * 1.14, buttonWidth + 20, 262));
  const centerButtonX = Math.round(width * 0.5);
  const rowButtonGap = Math.round(clamp(width * (isPortrait ? 0.045 : 0.016), isPortrait ? 14 : 18, isPortrait ? 22 : 34));
  // Offset must clear both the flanking button's own half-width AND the
  // center button's half-width (plus the gap) or the two boxes overlap.
  // The previous formula only reserved half the flanking button's width and
  // half the gap, ignoring the center button entirely -- it collided at
  // virtually every row-layout size, not just narrow ones.
  const rowButtonOffset = Math.round((buttonWidth / 2) + rowButtonGap + (centerButtonWidth / 2));
  // If a 3-button row genuinely doesn't fit at this width, fall back to the
  // stacked layout instead of trusting a fixed pixel threshold that can't
  // track button-size formula changes. This is what surfaced the
  // rowButtonOffset fix above as a real bug in the first place: once that
  // offset was corrected to stop overlapping, the flanking buttons ran off
  // the left/right screen edges at ordinary narrow phone widths (320-390px)
  // that the old fixed <300px threshold assumed were wide enough.
  // Both flanking buttons need their own full width, not just one -- this
  // must mirror centerX +/- rowButtonOffset +/- buttonWidth/2 exactly
  // (rowButtonOffset already bakes in one buttonWidth/2 + one gap + one
  // centerButtonWidth/2 per side, so the total required span is
  // 2*rowButtonOffset + buttonWidth, i.e. 2*buttonWidth + 2*gap + centerWidth).
  const rowFitsWidth = ((buttonWidth * 2) + (rowButtonGap * 2) + centerButtonWidth) <= (width - 16);
  const resolvedUsesStackedButtons = usesStackedButtons || !rowFitsWidth;
  const stackHeight = (buttonHeight * 2) + stackGap;
  // clamp(value, min, max) inverts (returns min instead of the safe max) if
  // min ends up greater than max -- now that the board can sit lower in its
  // zone (see menuBoardCenterOffset above), boardTop + snappedBoardHeight + 12
  // can exceed height - stackHeight - 18 in tight ultra-narrow cases. Cap
  // the lower bound at the upper bound so it never inverts.
  const stackTopMax = height - stackHeight - 18;
  const stackTopMin = Math.min(boardTop + snappedBoardHeight + 12, stackTopMax);
  const stackTop = Math.round(clamp(
    boardTop + snappedBoardHeight + 18,
    stackTopMin,
    stackTopMax
  ));
  const leftButtonY = resolvedUsesStackedButtons ? stackTop + Math.round(buttonHeight / 2) : rowButtonY;
  const rightButtonY = resolvedUsesStackedButtons ? leftButtonY + buttonHeight + stackGap : rowButtonY;
  const centerButtonY = rowButtonY;
  // Anchored from the header reserve (menuTitleTop), not from boardTop --
  // the board no longer reserves room above itself for the title, so
  // deriving this from boardTop would place the fallback title lane at (or
  // above) the literal top edge instead of just under the header icons.
  const titleLaneTop = menuTitleFitsInHeader ? 0 : menuTitleTop;
  // Simple mid-lane centering. The old formula's extra -16px portrait nudge
  // was tuned against the previous ~140-156px title reserve; against the new
  // much smaller compact reserve that same fixed offset would push the
  // title dangerously off-center within its own tiny lane.
  const menuPortraitTitleY = menuTitleFitsInHeader
    ? menuHeaderTitleCenterY
    : Math.round(titleLaneTop + (menuTitleReserve / 2));
  // Always the true screen midpoint outside the header-fit case -- centering
  // on the board instead (the previous portrait behavior) drifted off the
  // actual screen center whenever the board itself sat off-center.
  const titleX = menuTitleFitsInHeader ? menuHeaderTitleCenterX : Math.round(width / 2);
  const rankLane = null;
  const actionsLane = isPlaySurface
    ? null
    : createLane(menuDockButtonY - Math.round(buttonHeight / 2), buttonHeight);
  const controlsLane = isPlaySurface
    ? createLane(boardTop + snappedBoardHeight + laneGap, Math.max(0, height - (boardTop + snappedBoardHeight + laneGap)))
    : null;

  return {
    width,
    height,
    boardLeft,
    boardTop,
    boardWidth: snappedBoardWidth,
    boardHeight: snappedBoardHeight,
    tileSize,
    titleX,
    titleY: Math.round(!isPlaySurface ? menuPortraitTitleY : boardTop),
    titleReserveHeight: isPlaySurface
      ? Math.round(height * 0.055)
      : (menuTitleFitsInHeader ? menuTopHudReserve : menuTitleReserve),
    footerY: height - 18,
    buttonLayout: resolvedUsesStackedButtons ? 'stack' : 'row',
    buttonY: rowButtonY,
    centerButtonY,
    leftButtonY,
    rightButtonY,
    centerButtonWidth,
    leftButtonX: resolvedUsesStackedButtons ? centerButtonX : centerButtonX - rowButtonOffset,
    centerButtonX,
    rightButtonX: resolvedUsesStackedButtons ? centerButtonX : centerButtonX + rowButtonOffset,
    buttonWidth,
    buttonHeight,
    lanes: {
      actions: actionsLane,
      controls: controlsLane,
      // Lane starts at safeAreaTop (not 0) so resolveLegacyHeaderControlFrame
      // -- which vertically centers header icons within [hudTop,
      // hudTop+hudHeight] -- centers them in the region AFTER the device
      // safe-area inset, not across it. playTopHudReserve already has
      // safeAreaTop folded into its total size (see its own definition
      // above), so subtracting it back out of the height here keeps this
      // lane's bottom edge identical to before; only the top/height split
      // changes. Previously both branches started at 0, which meant a
      // notched/pilled device only pushed the settings cog and level badge
      // down by half of the safe-area inset instead of the full amount,
      // even though the title (a separate, already-correct calculation)
      // pushed down fully -- see the leadingHeaderFrame/trailingHeaderFrame
      // calls above, which pass hudTop: safeAreaTop for the same reason.
      hud: isPlaySurface
        ? createLane(safeAreaTop, Math.max(0, playTopHudReserve - safeAreaTop))
        : menuTopHudReserve > 0
          ? createLane(safeAreaTop, menuTopHudReserve)
          : null,
      maze: createLane(boardTop, snappedBoardHeight),
      rank: rankLane,
      title: (isPlaySurface || menuTitleFitsInHeader) ? null : createLane(titleLaneTop, menuTitleReserve)
    }
  };
};
