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
  buttonY: number;
  centerButtonY: number;
  centerButtonWidth: number;
  leftButtonX: number;
  centerButtonX: number;
  rightButtonX: number;
  buttonWidth: number;
  buttonHeight: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const resolveLegacyMenuLayout = (
  width: number,
  height: number,
  scale: number,
  mazeSize: number
): LegacyMenuLayout => {
  const normalizedScale = clampInteger(scale, 25, 150);
  const isPortrait = height > width;
  const baseBoardScale = isPortrait ? 0.9 : 0.45;
  const scaleBias = 1 + ((normalizedScale - 50) / 500);
  const rawBoardSize = Math.min(
    width * baseBoardScale * scaleBias,
    height * (isPortrait ? 0.54 : 0.78) * scaleBias
  );
  const boardSize = Math.round(clamp(rawBoardSize, 300, Math.min(width * (isPortrait ? 0.9 : 0.82), height * 0.82)));
  const tileSize = Math.max(4, Math.floor(boardSize / Math.max(1, mazeSize)));
  const snappedBoardSize = tileSize * mazeSize;
  const boardLeft = Math.round((width - snappedBoardSize) / 2);
  const boardTop = Math.round(clamp(height * (isPortrait ? 0.09 : 0.11), 44, isPortrait ? 92 : 132));
  const buttonHeight = Math.round(clamp(height * (isPortrait ? 0.068 : 0.088), 50, 96));
  const buttonY = isPortrait
    ? Math.round(clamp(
      boardTop + snappedBoardSize + Math.round(buttonHeight * 0.95),
      boardTop + snappedBoardSize + 32,
      height - Math.round(buttonHeight * 0.8)
    ))
    : Math.round(clamp(
      boardTop + snappedBoardSize - Math.round(buttonHeight * 0.16),
      boardTop + snappedBoardSize - Math.round(buttonHeight * 0.5),
      height - Math.round(buttonHeight * 0.6)
    ));
  const centerButtonY = isPortrait
    ? Math.round(clamp(
      boardTop + snappedBoardSize + Math.round(buttonHeight * 0.08),
      boardTop + snappedBoardSize - Math.round(buttonHeight * 0.04),
      buttonY - Math.round(buttonHeight * 0.28)
    ))
    : Math.round(clamp(
      boardTop + snappedBoardSize - Math.round(buttonHeight * 0.22),
      boardTop + snappedBoardSize - Math.round(buttonHeight * 0.36),
      buttonY - Math.round(buttonHeight * 0.3)
    ));
  const buttonWidth = Math.round(clamp(width * (isPortrait ? 0.23 : 0.13), isPortrait ? 108 : 150, isPortrait ? 156 : 252));
  const centerButtonWidth = isPortrait
    ? buttonWidth
    : Math.round(clamp(buttonWidth * 1.55, buttonWidth + 36, 312));
  const sideButtonInset = Math.round(clamp(width * (isPortrait ? 0.145 : 0.17), 58, 320));
  const centerButtonX = Math.round(width * 0.5);

  return {
    width,
    height,
    boardLeft,
    boardTop,
    boardSize: snappedBoardSize,
    tileSize,
    titleX: Math.round(width / 2),
    titleY: Math.round(boardTop + (snappedBoardSize * 0.16)),
    footerY: height - 18,
    buttonY,
    centerButtonY,
    centerButtonWidth,
    leftButtonX: sideButtonInset,
    centerButtonX,
    rightButtonX: width - sideButtonInset,
    buttonWidth,
    buttonHeight
  };
};
