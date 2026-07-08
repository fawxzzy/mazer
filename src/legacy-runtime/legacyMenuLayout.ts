import { clampInteger } from './legacyDefaults';

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

export type LegacyMenuLayoutSurface = 'menu' | 'play';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const resolveLegacyMenuLayout = (
  width: number,
  height: number,
  scale: number,
  mazeSize: number,
  surface: LegacyMenuLayoutSurface = 'menu'
): LegacyMenuLayout => {
  const normalizedScale = clampInteger(scale, 25, 150);
  const isPortrait = height > width;
  const isUltraNarrow = isPortrait && width < 360;
  const isPlaySurface = surface === 'play';
  const baseBoardScale = isUltraNarrow ? 0.98 : (isPortrait ? (isPlaySurface ? 0.92 : 0.86) : (isPlaySurface ? 0.62 : 0.52));
  const scaleBias = 1 + ((normalizedScale - 50) / 500);
  const maxBoardSize = Math.min(
    width * (isUltraNarrow ? 0.98 : (isPortrait ? 0.92 : 0.78)),
    height * (isPlaySurface ? (isPortrait ? 0.74 : 0.86) : (isPortrait ? 0.82 : 0.79))
  );
  const minBoardSize = Math.min(300, Math.max(120, maxBoardSize));
  const rawBoardSize = Math.min(
    width * baseBoardScale * scaleBias,
    height * (isPlaySurface ? (isPortrait ? 0.64 : 0.84) : (isPortrait ? 0.54 : 0.775)) * scaleBias
  );
  const boardSize = Math.round(clamp(rawBoardSize, minBoardSize, maxBoardSize));
  const rawTileSize = boardSize / Math.max(1, mazeSize);
  const tileSize = isUltraNarrow
    ? Math.max(3, Number(rawTileSize.toFixed(3)))
    : Math.max(4, Math.floor(rawTileSize));
  const snappedBoardSize = Math.round(tileSize * mazeSize * 1000) / 1000;
  const boardLeft = Math.round((width - snappedBoardSize) / 2);
  const buttonHeight = Math.round(clamp(height * (isPortrait ? 0.05 : 0.066), isPortrait ? 42 : 58, isPortrait ? 62 : 78));
  const stackGap = Math.round(clamp(height * 0.02, 7, 12));
  const titleClearance = Math.round(clamp(snappedBoardSize * (isPortrait ? 0.13 : 0.11), isPortrait ? 42 : 36, isPortrait ? 68 : 74));
  const menuButtonGap = Math.round(clamp(buttonHeight * (isPortrait ? 0.86 : 0.54), isPortrait ? 30 : 24, isPortrait ? 52 : 44));
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
  const rowButtonY = isPortrait
    ? Math.round(clamp(
      boardTop + snappedBoardSize + Math.round(buttonHeight * 0.86),
      boardTop + snappedBoardSize + 26,
      height - Math.round(buttonHeight * 0.76)
    ))
    : Math.round(clamp(
      boardTop + snappedBoardSize + Math.round(buttonHeight * 0.54),
      boardTop + snappedBoardSize + 24,
      height - Math.round(buttonHeight * 0.54)
    ));
  const buttonWidth = Math.round(clamp(width * (isPortrait ? 0.29 : 0.118), isUltraNarrow ? 96 : (isPortrait ? 118 : 164), isPortrait ? Math.min(132, width - 36) : 238));
  const centerButtonWidth = isPortrait
    ? buttonWidth
    : Math.round(clamp(buttonWidth * 1.14, buttonWidth + 20, 262));
  const sideButtonInset = Math.round(clamp(width * (isPortrait ? 0.16 : 0.156), isUltraNarrow ? Math.round(width / 2) : 66, 324));
  const centerButtonX = Math.round(width * 0.5);
  const stackHeight = (buttonHeight * 3) + (stackGap * 2);
  const stackTop = Math.round(clamp(
    boardTop + snappedBoardSize + 18,
    boardTop + snappedBoardSize + 12,
    height - stackHeight - 18
  ));
  const leftButtonY = isUltraNarrow ? stackTop + Math.round(buttonHeight / 2) : rowButtonY;
  const centerButtonY = isUltraNarrow ? leftButtonY + buttonHeight + stackGap : rowButtonY;
  const rightButtonY = isUltraNarrow ? centerButtonY + buttonHeight + stackGap : rowButtonY;
  const titleOverlapY = Math.round(boardTop + (snappedBoardSize * (isPortrait ? 0.216 : 0.221)));
  const menuPortraitTitleClearance = titleClearance;
  const menuPortraitTitleY = Math.max(34, boardTop - menuPortraitTitleClearance);

  return {
    width,
    height,
    boardLeft,
    boardTop,
    boardSize: snappedBoardSize,
    tileSize,
    titleX: Math.round(width / 2),
    titleY: Math.round(!isPlaySurface && isPortrait ? menuPortraitTitleY : titleOverlapY),
    footerY: height - 18,
    buttonLayout: isUltraNarrow ? 'stack' : 'row',
    buttonY: rowButtonY,
    centerButtonY,
    leftButtonY,
    rightButtonY,
    centerButtonWidth,
    leftButtonX: sideButtonInset,
    centerButtonX,
    rightButtonX: width - sideButtonInset,
    buttonWidth,
    buttonHeight
  };
};
