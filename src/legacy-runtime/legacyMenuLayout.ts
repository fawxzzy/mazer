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
  const minimumMenuActionHeight = isPortrait ? LEGACY_UI_MIN_TOUCH_TARGET : 58;
  const buttonHeight = Math.round(clamp(
    height * (isPortrait ? 0.05 : 0.066),
    minimumMenuActionHeight,
    isPortrait ? 62 : 78
  ));
  const laneGap = isUltraNarrow ? 4 : 8;
  const menuTopReserve = isUltraNarrow ? 6 : Math.round(clamp(height * 0.02, 16, 20));
  const menuTopHudReserve = !isPlaySurface
    ? Math.round(clamp(height * 0.072, isUltraNarrow ? 44 : LEGACY_MENU_TOP_HUD_MIN, LEGACY_MENU_TOP_HUD_MAX))
    : 0;
  const menuTitleReserve = isUltraNarrow
    ? 32
    : Math.round(clamp(Math.min(height * 0.055, width * 0.11), 34, 56));
  const dockBottomMargin = (isUltraNarrow ? 10 : 20) + safeAreaBottom;
  const dockReserve = buttonHeight + dockBottomMargin;
  const playTopHudReserve = (isPlaySurface && isPortrait
    ? Math.round(clamp(height * 0.072, LEGACY_PLAY_TOP_HUD_MIN, LEGACY_PLAY_TOP_HUD_MAX))
    : 56) + safeAreaTop;
  const playControlReserve = isPlaySurface
    ? Math.round(clamp(width * 0.52, isUltraNarrow ? 160 : 188, 230))
    : 0;
  // Approximates whether the title fits inline in the header (skipping its
  // own lane) as "true" whenever there's a top HUD reserve at all -- close
  // enough for an aspect-ratio probe; a one-lane miss here only nudges the
  // requested ratio slightly, it never breaks generation.
  const menuStackTop = safeAreaTop + menuTopHudReserve + menuTopReserve;
  const menuInlineTitleBoardGap = isUltraNarrow ? 2 : 4;
  // Mirrors resolveLegacyMenuLayout's real header-icon-bottom measurement
  // (not the abstract touch-target lane) so the probed box height -- and
  // therefore the requested aspect ratio -- matches what the real layout
  // will actually produce.
  const menuHeaderContentBottom = menuTopHudReserve > 0
    ? Math.max(
      resolveLegacyHeaderControlFrame({ height, hudHeight: menuTopHudReserve, hudTop: safeAreaTop, placement: 'leading', width }).bottom,
      resolveLegacyHeaderControlFrame({ height, hudHeight: menuTopHudReserve, hudTop: safeAreaTop, placement: 'trailing', width }).bottom
    )
    : menuStackTop;
  const menuBoardTop = menuTopHudReserve > 0
    ? menuHeaderContentBottom + menuInlineTitleBoardGap
    : menuStackTop + laneGap + menuTitleReserve + laneGap;
  const menuBottomReserve = laneGap + dockReserve;
  const menuAvailableBoardHeight = Math.max(60, height - menuBoardTop - menuBottomReserve);
  const playVerticalBoardLimit = height - playTopHudReserve - (playControlReserve + (laneGap * 2)) - safeAreaBottom;
  const laneBoardLimit = Math.max(96, isPlaySurface ? playVerticalBoardLimit : menuAvailableBoardHeight);
  const baseBoardScale = isPortrait ? 0.92 : 0.62;
  const cleanPhoneWidthScale = shouldUseCleanPhoneCadence ? 0.98 : null;
  const scaleBias = 1 + ((normalizedScale - 50) / 500);
  const menuEdgeMargin = isUltraNarrow ? 4 : (shouldUseCleanPhoneCadence ? 4 : 8);
  const menuMaxBoardByWidth = Math.max(60, width - (menuEdgeMargin * 2) - safeAreaLeft - safeAreaRight);
  const maxBoardWidthBound = isPlaySurface
    ? width * (cleanPhoneWidthScale ?? (isUltraNarrow ? 0.98 : (isPortrait ? 0.92 : 0.78)))
    : menuMaxBoardByWidth;
  const maxBoardHeightBound = isPlaySurface
    ? Math.min(height * (isPortrait ? 0.74 : 0.86), laneBoardLimit)
    : laneBoardLimit;
  const minBoardWidthBound = Math.min(maxBoardWidthBound, 300);
  const minBoardHeightBound = Math.min(maxBoardHeightBound, 300);
  const rawBoardWidthBound = isPlaySurface
    ? width * (cleanPhoneWidthScale ?? baseBoardScale) * scaleBias
    : menuMaxBoardByWidth * scaleBias;
  const rawBoardHeightBound = isPlaySurface
    ? Math.min(height * (isPortrait ? 0.64 : 0.84) * scaleBias, laneBoardLimit)
    : laneBoardLimit * scaleBias;
  const boardWidthTarget = Math.round(clamp(rawBoardWidthBound, minBoardWidthBound, maxBoardWidthBound));
  const boardHeightTarget = Math.round(clamp(rawBoardHeightBound, minBoardHeightBound, maxBoardHeightBound));

  if (boardWidthTarget <= 0 || boardHeightTarget <= 0) {
    return 1;
  }

  // Clamp to a sane range so an extreme viewport (very tall phone in
  // split-screen, ultra-wide monitor) can't request a degenerate 1-wide or
  // 1-tall maze -- the generation pipeline's checkpoint/shortcut budgets are
  // tuned for roughly square-ish grids and get unreliable well outside this.
  return clamp(boardWidthTarget / boardHeightTarget, 0.45, 2.2);
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
  // menuTopHudReserve is a touch-target-sized lane (clamped to a 56-72px
  // floor for tap-target compliance), but the actual header icons rendered
  // inside it are only ~36-40px tall and vertically centered -- leaving a
  // lot of dead reserved space below them that the old menuStackTop-based
  // board position paid for unnecessarily. Track the icons' real bottom
  // edge so the board can sit right under the visible content instead of
  // under the abstract lane.
  let menuHeaderContentBottom = safeAreaTop + menuTopHudReserve + menuTopReserve;
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
    menuHeaderContentBottom = Math.max(leadingHeaderFrame.bottom, trailingHeaderFrame.bottom);
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
  const dockReserve = buttonHeight + dockBottomMargin;
  const playTopHudReserve = (isPlaySurface && isPortrait
    ? Math.round(clamp(height * 0.072, LEGACY_PLAY_TOP_HUD_MIN, LEGACY_PLAY_TOP_HUD_MAX))
    : 56) + safeAreaTop;
  const playControlReserve = isPlaySurface
    ? Math.round(clamp(width * 0.52, isUltraNarrow ? 160 : 188, 230))
    : 0;
  // Menu surface: explicit top-to-bottom stack (header -> title -> board ->
  // dock button), each section computed from the one above it so nothing can
  // ever overlap by construction, instead of several independently-guessed
  // ratios that happened to usually avoid colliding. The board gets ALL
  // remaining space after the other (deliberately small) reserves -- that is
  // the "fill to the edges" requirement.
  const menuStackTop = safeAreaTop + menuTopHudReserve + menuTopReserve;
  const menuTitleTop = menuStackTop + laneGap;
  // When the title fits inline in the header row, no separate title lane is
  // reserved at all -- the board reclaims that space, matching the "fill to
  // the edges" requirement. This junction uses a tighter gap than the
  // general laneGap: the header row already has its own internal padding
  // around the title/icons, so the board can sit closer beneath it without
  // touching.
  const menuInlineTitleBoardGap = isUltraNarrow ? 2 : 4;
  const menuBoardTop = menuTitleFitsInHeader
    ? menuHeaderContentBottom + menuInlineTitleBoardGap
    : menuTitleTop + menuTitleReserve + laneGap;
  const menuBottomReserve = laneGap + dockReserve;
  const menuAvailableBoardHeight = Math.max(60, height - menuBoardTop - menuBottomReserve);

  const playVerticalBoardLimit = height
    - playTopHudReserve
    - (playControlReserve + (laneGap * 2))
    - safeAreaBottom;
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
  const maxBoardWidthBound = isPlaySurface
    ? width * (cleanPhoneWidthScale ?? (isUltraNarrow ? 0.98 : (isPortrait ? 0.92 : 0.78)))
    : menuMaxBoardByWidth;
  const maxBoardHeightBound = isPlaySurface
    ? Math.min(height * (isPortrait ? 0.74 : 0.86), laneBoardLimit)
    : laneBoardLimit;
  // Must never exceed the max bound -- the old `Math.max(120, maxBoardSize)`
  // could force a 120px floor even when maxBoardSize (the safe fill bound)
  // was itself smaller than 120 at extreme short heights, inverting the
  // clamp below and pushing the board past its safe bound into the dock
  // reserve. Same self-correcting min() applies per axis here.
  const minBoardWidthBound = Math.min(maxBoardWidthBound, 300);
  const minBoardHeightBound = Math.min(maxBoardHeightBound, 300);
  const rawBoardWidthBound = isPlaySurface
    // cleanPhoneWidthScale must override baseBoardScale here exactly like it
    // does in maxBoardWidthBound above -- dropping it silently shrank the
    // play-surface board on clean-phone-cadence widths (<=420px portrait).
    ? width * (cleanPhoneWidthScale ?? baseBoardScale) * scaleBias
    : menuMaxBoardByWidth * scaleBias;
  const rawBoardHeightBound = isPlaySurface
    ? Math.min(height * (isPortrait ? 0.64 : 0.84) * scaleBias, laneBoardLimit)
    // scaleBias is the user's own board-scale preference (Options); let it
    // shrink the board below the max fill, but the maxBoardHeightBound clamp
    // below guarantees it can never grow past the safe fill bound and
    // reintroduce overlap.
    : laneBoardLimit * scaleBias;
  const boardWidthTarget = Math.round(clamp(rawBoardWidthBound, minBoardWidthBound, maxBoardWidthBound));
  const boardHeightTarget = Math.round(clamp(rawBoardHeightBound, minBoardHeightBound, maxBoardHeightBound));
  // A uniform tileSize (square cells) is the smaller of the two axis-derived
  // tile sizes, so the board never overflows either bound -- whichever axis
  // is the tighter constraint fills its bound exactly, and the other axis
  // gets centered slack (see menuBoardCenterOffset/boardLeft below).
  const rawTileSizeFromWidth = boardWidthTarget / Math.max(1, mazeWidth);
  const rawTileSizeFromHeight = boardHeightTarget / Math.max(1, mazeHeight);
  const rawTileSize = Math.min(rawTileSizeFromWidth, rawTileSizeFromHeight);
  const cleanPhoneBoardWidth = Math.max(
    1,
    Math.min(boardWidthTarget, width - (LEGACY_PHONE_CLEAN_OUTER_MARGIN * 2))
  );
  const cleanPhoneInsetPad = LEGACY_PHONE_CLEAN_SAFE_INSET * 2;
  const cleanPhoneTileSize = Math.min(
    (cleanPhoneBoardWidth - cleanPhoneInsetPad) / Math.max(1, mazeWidth),
    boardHeightTarget / Math.max(1, mazeHeight)
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
    isPlaySurface ? (playTopHudReserve + laneGap) : (menuBoardZoneTop + menuBoardCenterOffset)
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
  const titleLaneTop = menuTitleFitsInHeader ? 0 : Math.max(0, boardTop - laneGap - menuTitleReserve);
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
      hud: isPlaySurface
        ? createLane(0, playTopHudReserve)
        : menuTopHudReserve > 0
          ? createLane(0, menuTopHudReserve)
          : null,
      maze: createLane(boardTop, snappedBoardHeight),
      rank: rankLane,
      title: (isPlaySurface || menuTitleFitsInHeader) ? null : createLane(titleLaneTop, menuTitleReserve)
    }
  };
};
