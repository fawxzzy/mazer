import { clampInteger } from './legacyDefaults';
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
  const isShortLandscapeMenu = !isPlaySurface && !isPortrait && height < 820;
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
  const menuActionGap = isUltraNarrow ? laneGap : 10;
  const menuTopReserve = isUltraNarrow ? 6 : Math.round(clamp(height * 0.02, 16, 20));
  const menuTopHudReserve = !isPlaySurface && !isUltraNarrow
    ? Math.round(clamp(height * 0.072, LEGACY_MENU_TOP_HUD_MIN, LEGACY_MENU_TOP_HUD_MAX))
    : 0;
  const menuFooterReserve = isUltraNarrow ? 10 : 18;
  const menuTitleReserve = isUltraNarrow
    ? 50
    : isPortrait
      // The animated title extends above and below its core grid through its
      // orbit and crown. Reserve that complete visual footprint—not only the
      // letter cells—so it cannot sit beneath the level, AI, or settings
      // controls on a real phone.
      ? Math.round(clamp(width * 0.38, 136, 156))
      // Landscape needs the same outer-title clearance. Keeping this larger
      // than the letter-grid height makes the board and Start action move as a
      // coherent group rather than solving the header collision ad hoc.
      : Math.round(clamp(height * 0.21, 140, 152));
  const menuRankReserve = 0;
  const menuActionReserve = buttonHeight;
  const playTopHudReserve = isPlaySurface && isPortrait
    ? Math.round(clamp(height * 0.072, LEGACY_PLAY_TOP_HUD_MIN, LEGACY_PLAY_TOP_HUD_MAX))
    : 56;
  const playControlReserve = isPlaySurface
    ? Math.round(clamp(width * 0.52, isUltraNarrow ? 160 : 188, 230))
    : 0;
  const menuVerticalBoardLimit = height
    - menuTopReserve
    - menuTopHudReserve
    - menuTitleReserve
    - menuRankReserve
    - menuActionReserve
    - (laneGap * 2)
    - menuActionGap
    - menuFooterReserve;
  const playVerticalBoardLimit = height
    - playTopHudReserve
    - (playControlReserve + (laneGap * 2));
  const laneBoardLimit = Math.max(96, isPlaySurface ? playVerticalBoardLimit : menuVerticalBoardLimit);
  const baseBoardScale = isUltraNarrow ? 0.98 : (isPortrait ? (isPlaySurface ? 0.92 : 0.86) : (isPlaySurface ? 0.62 : 0.52));
  const cleanPhoneWidthScale = shouldUseCleanPhoneCadence ? 0.98 : null;
  const scaleBias = 1 + ((normalizedScale - 50) / 500);
  const maxBoardSize = Math.min(
    width * (cleanPhoneWidthScale ?? (isUltraNarrow ? 0.98 : (isPortrait ? 0.92 : 0.78))),
    height * (isPlaySurface ? (isPortrait ? 0.74 : 0.86) : (isPortrait ? 0.82 : (isShortLandscapeMenu ? 0.6 : 0.72))),
    laneBoardLimit
  );
  const minBoardSize = Math.min(300, Math.max(120, maxBoardSize));
  const rawBoardSize = Math.min(
    width * (cleanPhoneWidthScale ?? baseBoardScale) * scaleBias,
    height * (isPlaySurface ? (isPortrait ? 0.64 : 0.84) : (isPortrait ? 0.54 : (isShortLandscapeMenu ? 0.6 : 0.72))) * scaleBias,
    laneBoardLimit
  );
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
  const menuGroupHeight = menuTitleReserve + snappedBoardSize + menuRankReserve + menuActionReserve + (laneGap * 2) + menuActionGap;
  const menuGroupTop = Math.max(
    menuTopHudReserve + menuTopReserve,
    Math.round((height - menuFooterReserve - menuGroupHeight) / 2)
  );
  const menuBoardTop = menuGroupTop + menuTitleReserve + laneGap;
  const playBoardTop = isPlaySurface
    ? playTopHudReserve + laneGap
    : menuBoardTop;
  const boardTop = Math.round(isPlaySurface ? playBoardTop : menuBoardTop);
  const menuRankLaneTop = boardTop + snappedBoardSize + laneGap;
  const menuActionLaneTop = menuRankLaneTop + menuActionGap;
  const menuRowButtonY = menuActionLaneTop + Math.round(buttonHeight / 2);
  const playRowButtonY = isPortrait
    ? boardTop + snappedBoardSize + Math.round(buttonHeight * 0.86)
    : boardTop + snappedBoardSize + Math.round(buttonHeight * 0.54);
  const rowButtonY = isPortrait
    ? Math.round(clamp(
      isPlaySurface ? playRowButtonY : menuRowButtonY,
      boardTop + snappedBoardSize + 26,
      height - Math.round(buttonHeight * 0.76)
    ))
    : Math.round(clamp(
      isPlaySurface ? playRowButtonY : menuRowButtonY,
      boardTop + snappedBoardSize + 24,
      height - Math.round(buttonHeight * 0.54)
    ));
  const buttonWidth = Math.round(clamp(width * (isPortrait ? 0.29 : 0.118), isUltraNarrow ? 96 : (isPortrait ? 118 : 164), isPortrait ? Math.min(132, width - 36) : 238));
  const centerButtonWidth = isPortrait
    ? buttonWidth
    : Math.round(clamp(buttonWidth * 1.14, buttonWidth + 20, 262));
  const centerButtonX = Math.round(width * 0.5);
  const rowButtonGap = Math.round(clamp(width * (isPortrait ? 0.045 : 0.016), isPortrait ? 14 : 18, isPortrait ? 22 : 34));
  const rowButtonOffset = Math.round((buttonWidth / 2) + (rowButtonGap / 2));
  const stackHeight = (buttonHeight * 2) + stackGap;
  const stackTop = Math.round(clamp(
    boardTop + snappedBoardSize + 18,
    boardTop + snappedBoardSize + 12,
    height - stackHeight - 18
  ));
  const leftButtonY = usesStackedButtons ? stackTop + Math.round(buttonHeight / 2) : rowButtonY;
  const rightButtonY = usesStackedButtons ? leftButtonY + buttonHeight + stackGap : rowButtonY;
  const centerButtonY = rowButtonY;
  const titleLaneTop = Math.max(0, boardTop - laneGap - menuTitleReserve);
  const menuPortraitTitleFallbackY = Math.max(
    titleLaneTop + 20,
    Math.round(titleLaneTop + (menuTitleReserve / 2) - (isPortrait ? 16 : 0))
  );
  const menuPortraitTitleY = menuPortraitTitleFallbackY;
  const titleX = !isPlaySurface && isPortrait ? boardLeft + (snappedBoardSize / 2) : Math.round(width / 2);
  const rankLane = null;
  const actionsLane = isPlaySurface ? null : createLane(menuActionLaneTop, menuActionReserve);
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
    footerY: height - 18,
    buttonLayout: usesStackedButtons ? 'stack' : 'row',
    buttonY: rowButtonY,
    centerButtonY,
    leftButtonY,
    rightButtonY,
    centerButtonWidth,
    leftButtonX: usesStackedButtons ? centerButtonX : centerButtonX - rowButtonOffset,
    centerButtonX,
    rightButtonX: usesStackedButtons ? centerButtonX : centerButtonX + rowButtonOffset,
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
      title: isPlaySurface ? null : createLane(titleLaneTop, menuTitleReserve)
    }
  };
};
