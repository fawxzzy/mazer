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
  const baseBoardScale = isPortrait ? 0.92 : 0.52;
  const scaleBias = 1 + ((normalizedScale - 50) / 500);
  const rawBoardSize = Math.min(
    width * baseBoardScale * scaleBias,
    height * (isPortrait ? 0.54 : 0.775) * scaleBias
  );
  const boardSize = Math.round(clamp(rawBoardSize, 300, Math.min(width * (isPortrait ? 0.92 : 0.78), height * (isPortrait ? 0.82 : 0.79))));
  const tileSize = Math.max(4, Math.floor(boardSize / Math.max(1, mazeSize)));
  const snappedBoardSize = tileSize * mazeSize;
  const boardLeft = Math.round((width - snappedBoardSize) / 2);
  const boardTop = Math.round(clamp(height * (isPortrait ? 0.104 : 0.074), 40, isPortrait ? 102 : 88));
  const buttonHeight = Math.round(clamp(height * (isPortrait ? 0.05 : 0.066), isPortrait ? 42 : 58, isPortrait ? 62 : 78));
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
      boardTop + snappedBoardSize + Math.round(buttonHeight * 0.18),
      boardTop + snappedBoardSize + 8,
      buttonY - Math.round(buttonHeight * 0.38)
    ))
    : Math.round(clamp(
      boardTop + snappedBoardSize + Math.round(buttonHeight * 0.02),
      boardTop + snappedBoardSize + 2,
      buttonY - Math.round(buttonHeight * 0.38)
    ));
  const buttonWidth = Math.round(clamp(width * (isPortrait ? 0.21 : 0.118), isPortrait ? 96 : 164, isPortrait ? 144 : 238));
  const centerButtonWidth = isPortrait
    ? Math.round(clamp(buttonWidth * 1.12, buttonWidth + 8, 170))
    : Math.round(clamp(buttonWidth * 1.14, buttonWidth + 20, 262));
  const sideButtonInset = Math.round(clamp(width * (isPortrait ? 0.16 : 0.156), 66, 324));
  const centerButtonX = Math.round(width * 0.5);

  return {
    width,
    height,
    boardLeft,
    boardTop,
    boardSize: snappedBoardSize,
    tileSize,
    titleX: Math.round(width / 2),
    titleY: Math.round(boardTop + (snappedBoardSize * (isPortrait ? 0.216 : 0.221))),
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
