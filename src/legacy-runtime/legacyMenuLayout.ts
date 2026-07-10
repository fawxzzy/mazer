import { clampInteger } from './legacyDefaults';
import {
  resolveLegacyMenuPathTitleLayout,
  resolveLegacyMenuPathTitleOrbitGeometry,
  resolveLegacyMenuTitlePresentation
} from './legacyMenuTitle';

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
}

export interface LegacyAuthenticatedMenuButtonStack {
  authenticatedButtonGap: number;
  authenticatedStackHeight: number;
  optionsButtonHeight: number;
  optionsButtonY: number;
  startButtonY: number;
}

export type LegacyMenuLayoutSurface = 'menu' | 'play';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const LEGACY_AUTHENTICATED_MENU_BUTTON_GAP_RATIO = 0.22;
export const LEGACY_AUTHENTICATED_MENU_BUTTON_GAP_MIN = 10;
export const LEGACY_AUTHENTICATED_MENU_BUTTON_GAP_MAX = 14;
const LEGACY_MENU_SIDE_PANEL_WIDTH = 300;
const LEGACY_PLAY_ULTRA_NARROW_WIDTH = 360;
const LEGACY_PHONE_CLEAN_ZOOM_WIDTH = 420;
const LEGACY_PHONE_CLEAN_TILE_SIZE = 8;
const LEGACY_PHONE_CLEAN_SAFE_INSET = 7;
const LEGACY_BOARD_SIGIL_BORDER_INSET = 2;

const resolveMenuPortraitTitleY = (
  width: number,
  boardTop: number,
  boardSize: number,
  tileSize: number,
  fallbackTitleY: number,
  isProceduralMenu: boolean
): number => {
  const titlePresentation = resolveLegacyMenuTitlePresentation(
    boardSize,
    tileSize,
    true,
    width,
    isProceduralMenu ? 'procedural' : 'snapshot'
  );
  const titleLayout = resolveLegacyMenuPathTitleLayout(
    Math.round(width / 2),
    fallbackTitleY,
    titlePresentation.fontSize
  );
  const orbitGeometry = resolveLegacyMenuPathTitleOrbitGeometry(
    titleLayout.left,
    titleLayout.top,
    titleLayout.width,
    titleLayout.height,
    titleLayout.cellSize
  );
  const titleOrbitClearance = Math.max(9, Math.round(titleLayout.cellSize * 1.5));
  const targetCrownBottomY = boardTop - LEGACY_BOARD_SIGIL_BORDER_INSET - titleOrbitClearance;
  const alignedTitleY = fallbackTitleY - Math.max(0, Math.round(orbitGeometry.crownBottom - targetCrownBottomY));

  return Math.max(28, alignedTitleY);
};

export const resolveLegacyAuthenticatedMenuButtonStack = (
  layout: Pick<LegacyMenuLayout, 'boardSize' | 'boardTop' | 'buttonHeight' | 'centerButtonY' | 'footerY'>
): LegacyAuthenticatedMenuButtonStack => {
  const safeButtonHeight = Math.max(1, Math.round(layout.buttonHeight));
  const optionsButtonHeight = Math.max(38, Math.round(safeButtonHeight * 0.78));
  const authenticatedButtonGap = clampInteger(
    Math.round(safeButtonHeight * LEGACY_AUTHENTICATED_MENU_BUTTON_GAP_RATIO),
    LEGACY_AUTHENTICATED_MENU_BUTTON_GAP_MIN,
    LEGACY_AUTHENTICATED_MENU_BUTTON_GAP_MAX
  );
  const authenticatedStackHeight = safeButtonHeight + authenticatedButtonGap + optionsButtonHeight;
  const stackHalfHeight = authenticatedStackHeight / 2;
  const boardBottom = layout.boardTop + layout.boardSize;
  const availableHeight = layout.footerY - boardBottom;
  const minCenterY = boardBottom + stackHalfHeight + 8;
  const maxCenterY = layout.footerY - stackHalfHeight - 2;
  const stackCenterY = maxCenterY >= minCenterY
    ? clamp(Math.round(layout.centerButtonY), minCenterY, maxCenterY)
    : availableHeight >= authenticatedStackHeight + 2
      ? boardBottom + (availableHeight / 2)
      : Math.round(layout.centerButtonY);
  const startButtonY = Math.round(stackCenterY - ((authenticatedStackHeight - safeButtonHeight) / 2));
  const optionsButtonY = startButtonY
    + Math.round((safeButtonHeight / 2) + authenticatedButtonGap + (optionsButtonHeight / 2));

  return {
    authenticatedButtonGap,
    authenticatedStackHeight,
    optionsButtonHeight,
    optionsButtonY,
    startButtonY
  };
};

export const resolveLegacyMenuLayout = (
  width: number,
  height: number,
  scale: number,
  mazeSize: number,
  surface: LegacyMenuLayoutSurface = 'menu'
): LegacyMenuLayout => {
  const normalizedScale = clampInteger(scale, 25, 150);
  const isPortrait = height > width;
  const isPlaySurface = surface === 'play';
  const isSidePanelPortrait = isPortrait && width < LEGACY_MENU_SIDE_PANEL_WIDTH;
  const isPlayUltraNarrow = isPlaySurface && isPortrait && width < LEGACY_PLAY_ULTRA_NARROW_WIDTH;
  const isUltraNarrow = isSidePanelPortrait || isPlayUltraNarrow;
  const usesStackedButtons = isSidePanelPortrait;
  const shouldUseCleanPhoneCadence = isPortrait && !isUltraNarrow && width <= LEGACY_PHONE_CLEAN_ZOOM_WIDTH;
  const isShortLandscapeMenu = !isPlaySurface && !isPortrait && height < 820;
  const baseBoardScale = isUltraNarrow ? 0.98 : (isPortrait ? (isPlaySurface ? 0.92 : 0.86) : (isPlaySurface ? 0.62 : 0.52));
  const cleanPhoneWidthScale = shouldUseCleanPhoneCadence ? 0.98 : null;
  const scaleBias = 1 + ((normalizedScale - 50) / 500);
  const maxBoardSize = Math.min(
    width * (cleanPhoneWidthScale ?? (isUltraNarrow ? 0.98 : (isPortrait ? 0.92 : 0.78))),
    height * (isPlaySurface ? (isPortrait ? 0.74 : 0.86) : (isPortrait ? 0.82 : (isShortLandscapeMenu ? 0.6 : 0.72)))
  );
  const minBoardSize = Math.min(300, Math.max(120, maxBoardSize));
  const rawBoardSize = Math.min(
    width * (cleanPhoneWidthScale ?? baseBoardScale) * scaleBias,
    height * (isPlaySurface ? (isPortrait ? 0.64 : 0.84) : (isPortrait ? 0.54 : (isShortLandscapeMenu ? 0.6 : 0.72))) * scaleBias
  );
  const boardSize = Math.round(clamp(rawBoardSize, minBoardSize, maxBoardSize));
  const rawTileSize = boardSize / Math.max(1, mazeSize);
  const cleanPhoneMaxTileSize = Math.floor(
    Math.max(1, width - 16 - (LEGACY_PHONE_CLEAN_SAFE_INSET * 2)) / Math.max(1, mazeSize)
  );
  const tileSize = isUltraNarrow
    ? Math.max(3, Number(rawTileSize.toFixed(3)))
    : shouldUseCleanPhoneCadence
      ? Math.max(4, Math.min(LEGACY_PHONE_CLEAN_TILE_SIZE, cleanPhoneMaxTileSize, Math.floor(rawTileSize)))
    : Math.max(4, Math.floor(rawTileSize));
  const snappedBoardSize = shouldUseCleanPhoneCadence
    ? Math.round((tileSize * mazeSize) + (LEGACY_PHONE_CLEAN_SAFE_INSET * 2))
    : Math.round(tileSize * mazeSize * 1000) / 1000;
  const boardLeft = Math.round((width - snappedBoardSize) / 2);
  const buttonHeight = Math.round(clamp(height * (isPortrait ? 0.05 : 0.066), isPortrait ? 42 : 58, isPortrait ? 62 : 78));
  const stackGap = Math.round(clamp(height * 0.02, 7, 12));
  const titleClearance = Math.round(clamp(snappedBoardSize * (isPortrait ? 0.13 : 0.11), isPortrait ? 42 : 36, isPortrait ? 68 : 74));
  const menuButtonGap = Math.round(clamp(buttonHeight * (isPortrait ? 1.82 : 1.2), isPortrait ? 76 : 70, isPortrait ? 96 : 90));
  const menuStackHeight = titleClearance + snappedBoardSize + menuButtonGap + buttonHeight;
  const centeredMenuBoardTop = Math.round((height - menuStackHeight) / 2 + titleClearance);
  const menuBoardTop = isUltraNarrow
    ? clamp(height * 0.104, 32, 72)
    : clamp(
      centeredMenuBoardTop,
      isPortrait ? 128 : 48,
      Math.max(isPortrait ? 128 : 48, height - snappedBoardSize - menuButtonGap - buttonHeight - 24)
    );
  const playBoardTop = isUltraNarrow
    ? clamp(
      height * 0.14,
      48,
      Math.max(48, height - snappedBoardSize - Math.round(height * 0.38))
    )
    : clamp((height - snappedBoardSize) / 2, 56, height - snappedBoardSize - 12);
  const boardTop = Math.round(isPlaySurface ? playBoardTop : menuBoardTop);
  const menuRowButtonY = boardTop + snappedBoardSize + menuButtonGap + Math.round(buttonHeight / 2);
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
  const titleOverlapY = Math.round(boardTop + (snappedBoardSize * (isPortrait ? 0.216 : 0.221)));
  const menuPortraitTitleClearance = titleClearance;
  const menuPortraitTitleFallbackY = Math.max(34, boardTop - menuPortraitTitleClearance);
  const menuPortraitTitleY = resolveMenuPortraitTitleY(
    width,
    boardTop,
    snappedBoardSize,
    tileSize,
    menuPortraitTitleFallbackY,
    true
  );
  const titleX = !isPlaySurface && isPortrait
    ? boardLeft + (snappedBoardSize / 2)
    : Math.round(width / 2);

  return {
    width,
    height,
    boardLeft,
    boardTop,
    boardSize: snappedBoardSize,
    tileSize,
    titleX,
    titleY: Math.round(!isPlaySurface && isPortrait ? menuPortraitTitleY : titleOverlapY),
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
    buttonHeight
  };
};
