import { clampInteger } from './legacyDefaults';
import { resolveLegacyHeaderControlFrame } from './legacyHeaderControl';
import { resolveLegacyMenuTitleFootprintWidth } from './legacyMenuTitle';
import { LEGACY_UI_MIN_TOUCH_TARGET } from './legacyUiStandards';

export interface LegacyMenuLayout {
  width: number;
  height: number;
  boardLeft: number;
  boardTop: number;
  boardSize: number;
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
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const LEGACY_MENU_SIDE_PANEL_WIDTH = 300;
const LEGACY_DIAGNOSTIC_PANEL_WIDTH = 172;
const LEGACY_DIAGNOSTIC_PANEL_HEIGHT = 407;
const LEGACY_PLAY_ULTRA_NARROW_WIDTH = 360;
const LEGACY_PHONE_CLEAN_ZOOM_WIDTH = 420;
const LEGACY_PHONE_CLEAN_SAFE_INSET = 7;
const LEGACY_PHONE_CLEAN_OUTER_MARGIN = 8;
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

export const resolveLegacyMenuLayout = (
  width: number,
  height: number,
  scale: number,
  mazeSize: number,
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
      hudTop: 0,
      placement: 'leading',
      width
    });
    const trailingHeaderFrame = resolveLegacyHeaderControlFrame({
      height,
      hudHeight: menuTopHudReserve,
      hudTop: 0,
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
  const dockBottomMargin = isUltraNarrow ? 10 : 20;
  const dockReserve = buttonHeight + dockBottomMargin;
  const playTopHudReserve = isPlaySurface && isPortrait
    ? Math.round(clamp(height * 0.072, LEGACY_PLAY_TOP_HUD_MIN, LEGACY_PLAY_TOP_HUD_MAX))
    : 56;
  const playControlReserve = isPlaySurface
    ? Math.round(clamp(width * 0.52, isUltraNarrow ? 160 : 188, 230))
    : 0;
  // Menu surface: explicit top-to-bottom stack (header -> title -> board ->
  // dock button), each section computed from the one above it so nothing can
  // ever overlap by construction, instead of several independently-guessed
  // ratios that happened to usually avoid colliding. The board gets ALL
  // remaining space after the other (deliberately small) reserves -- that is
  // the "fill to the edges" requirement.
  const menuStackTop = menuTopHudReserve + menuTopReserve;
  const menuTitleTop = menuStackTop + laneGap;
  // When the title fits inline in the header row, no separate title lane is
  // reserved at all -- the board reclaims that space, matching the "fill to
  // the edges" requirement.
  const menuBoardTop = menuTitleFitsInHeader
    ? menuStackTop + laneGap
    : menuTitleTop + menuTitleReserve + laneGap;
  const menuBottomReserve = laneGap + dockReserve;
  const menuAvailableBoardHeight = Math.max(60, height - menuBoardTop - menuBottomReserve);

  const playVerticalBoardLimit = height
    - playTopHudReserve
    - (playControlReserve + (laneGap * 2));
  const laneBoardLimit = Math.max(96, isPlaySurface ? playVerticalBoardLimit : menuAvailableBoardHeight);
  const baseBoardScale = isPortrait ? 0.92 : 0.62;
  const cleanPhoneWidthScale = shouldUseCleanPhoneCadence ? 0.98 : null;
  const scaleBias = 1 + ((normalizedScale - 50) / 500);
  const menuEdgeMargin = isUltraNarrow ? 6 : (shouldUseCleanPhoneCadence ? LEGACY_PHONE_CLEAN_OUTER_MARGIN : 12);
  const menuMaxBoardByWidth = Math.max(60, width - (menuEdgeMargin * 2));
  const maxBoardSize = isPlaySurface
    ? Math.min(
      width * (cleanPhoneWidthScale ?? (isUltraNarrow ? 0.98 : (isPortrait ? 0.92 : 0.78))),
      height * (isPortrait ? 0.74 : 0.86),
      laneBoardLimit
    )
    // Menu: fill to the edges (width) and to whatever vertical room the
    // stack above left behind (laneBoardLimit already IS that fill bound).
    : Math.min(menuMaxBoardByWidth, laneBoardLimit);
  // Must never exceed maxBoardSize -- the old `Math.max(120, maxBoardSize)`
  // could force a 120px floor even when maxBoardSize (the safe fill bound)
  // was itself smaller than 120 at extreme short heights, inverting the
  // clamp below and pushing the board past its safe bound into the dock
  // reserve. This is behaviorally identical to the old formula whenever
  // maxBoardSize >= 120 (the only range that mattered before), and now
  // additionally self-corrects when it's smaller.
  const minBoardSize = Math.min(maxBoardSize, 300);
  const rawBoardSize = isPlaySurface
    ? Math.min(
      // cleanPhoneWidthScale must override baseBoardScale here exactly like
      // it does in maxBoardSize above -- dropping it silently shrank the
      // play-surface board on clean-phone-cadence widths (<=420px portrait),
      // since rawBoardSize then undershot the width-based clean-phone cap
      // in the tileSize/snappedBoardSize step below instead of hitting it.
      width * (cleanPhoneWidthScale ?? baseBoardScale) * scaleBias,
      height * (isPortrait ? 0.64 : 0.84) * scaleBias,
      laneBoardLimit
    )
    // scaleBias is the user's own board-scale preference (Options); let it
    // shrink the board below the max fill, but the maxBoardSize clamp below
    // guarantees it can never grow past the safe fill bound and reintroduce
    // overlap.
    : Math.min(menuMaxBoardByWidth, laneBoardLimit) * scaleBias;
  const boardSize = Math.round(clamp(rawBoardSize, minBoardSize, maxBoardSize));
  const rawTileSize = boardSize / Math.max(1, mazeSize);
  const cleanPhoneBoardSize = Math.max(
    1,
    Math.min(boardSize, width - (LEGACY_PHONE_CLEAN_OUTER_MARGIN * 2))
  );
  const tileSize = isUltraNarrow
    ? Math.max(3, Number(rawTileSize.toFixed(3)))
    : shouldUseCleanPhoneCadence
      ? Math.max(
        4,
        Number(((cleanPhoneBoardSize - (LEGACY_PHONE_CLEAN_SAFE_INSET * 2)) / Math.max(1, mazeSize)).toFixed(3))
      )
    : Math.max(4, Math.floor(rawTileSize));
  const snappedBoardSize = shouldUseCleanPhoneCadence
    ? Math.round(cleanPhoneBoardSize)
    : Math.round(tileSize * mazeSize * 1000) / 1000;
  const boardLeft = Math.round((width - snappedBoardSize) / 2);
  const boardTop = Math.round(isPlaySurface ? (playTopHudReserve + laneGap) : menuBoardTop);
  const menuDockButtonY = height - dockBottomMargin - Math.round(buttonHeight / 2);
  const playRowButtonY = isPortrait
    ? boardTop + snappedBoardSize + Math.round(buttonHeight * 0.86)
    : boardTop + snappedBoardSize + Math.round(buttonHeight * 0.54);
  const rowButtonY = isPlaySurface
    ? (isPortrait
      ? Math.round(clamp(playRowButtonY, boardTop + snappedBoardSize + 26, height - Math.round(buttonHeight * 0.76)))
      : Math.round(clamp(playRowButtonY, boardTop + snappedBoardSize + 24, height - Math.round(buttonHeight * 0.54))))
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
  const stackTop = Math.round(clamp(
    boardTop + snappedBoardSize + 18,
    boardTop + snappedBoardSize + 12,
    height - stackHeight - 18
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
  const titleX = menuTitleFitsInHeader
    ? menuHeaderTitleCenterX
    : (!isPlaySurface && isPortrait ? boardLeft + (snappedBoardSize / 2) : Math.round(width / 2));
  const rankLane = null;
  const actionsLane = isPlaySurface
    ? null
    : createLane(menuDockButtonY - Math.round(buttonHeight / 2), buttonHeight);
  const controlsLane = isPlaySurface
    ? createLane(boardTop + snappedBoardSize + laneGap, Math.max(0, height - (boardTop + snappedBoardSize + laneGap)))
    : null;

  return {
    width,
    height,
    boardLeft,
    boardTop,
    boardSize: snappedBoardSize,
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
      maze: createLane(boardTop, snappedBoardSize),
      rank: rankLane,
      title: (isPlaySurface || menuTitleFitsInHeader) ? null : createLane(titleLaneTop, menuTitleReserve)
    }
  };
};
