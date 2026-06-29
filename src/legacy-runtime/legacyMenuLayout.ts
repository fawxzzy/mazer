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
  const baseBoardScale = isPortrait ? 0.91 : 0.47;
  const scaleBias = 1 + ((normalizedScale - 50) / 500);
  const rawBoardSize = Math.min(
    width * baseBoardScale * scaleBias,
    height * (isPortrait ? 0.54 : 0.74) * scaleBias
  );
  const boardSize = Math.round(clamp(rawBoardSize, 300, Math.min(width * (isPortrait ? 0.92 : 0.78), height * (isPortrait ? 0.82 : 0.76))));
  const tileSize = Math.max(4, Math.floor(boardSize / Math.max(1, mazeSize)));
  const snappedBoardSize = tileSize * mazeSize;
  const boardLeft = Math.round((width - snappedBoardSize) / 2);
  const boardTop = Math.round(clamp(height * (isPortrait ? 0.11 : 0.082), 44, isPortrait ? 108 : 96));
  const buttonHeight = Math.round(clamp(height * (isPortrait ? 0.05 : 0.058), isPortrait ? 42 : 48, isPortrait ? 64 : 72));
  const buttonY = isPortrait
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
  const centerButtonY = isPortrait
    ? Math.round(clamp(
      boardTop + snappedBoardSize + Math.round(buttonHeight * 0.12),
      boardTop + snappedBoardSize + 8,
      buttonY - Math.round(buttonHeight * 0.34)
    ))
    : Math.round(clamp(
      boardTop + snappedBoardSize + Math.round(buttonHeight * 0.06),
      boardTop + snappedBoardSize + 4,
      buttonY - Math.round(buttonHeight * 0.42)
    ));
  const buttonWidth = Math.round(clamp(width * (isPortrait ? 0.2 : 0.11), isPortrait ? 92 : 144, isPortrait ? 136 : 224));
  const centerButtonWidth = isPortrait
    ? Math.round(clamp(buttonWidth * 1.08, buttonWidth, 160))
    : Math.round(clamp(buttonWidth * 1.18, buttonWidth + 24, 248));
  const sideButtonInset = Math.round(clamp(width * (isPortrait ? 0.16 : 0.14), 68, 288));
  const centerButtonX = Math.round(width * 0.5);

  return {
    width,
    height,
    boardLeft,
    boardTop,
    boardSize: snappedBoardSize,
    tileSize,
    titleX: Math.round(width / 2),
    titleY: Math.round(boardTop + (snappedBoardSize * (isPortrait ? 0.14 : 0.128))),
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
