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
  const baseBoardScale = isPortrait ? 0.93 : 0.5;
  const scaleBias = 1 + ((normalizedScale - 50) / 500);
  const rawBoardSize = Math.min(
    width * baseBoardScale * scaleBias,
    height * (isPortrait ? 0.54 : 0.8) * scaleBias
  );
  const boardSize = Math.round(clamp(rawBoardSize, 300, Math.min(width * (isPortrait ? 0.94 : 0.82), height * (isPortrait ? 0.84 : 0.82))));
  const tileSize = Math.max(4, Math.floor(boardSize / Math.max(1, mazeSize)));
  const snappedBoardSize = tileSize * mazeSize;
  const boardLeft = Math.round((width - snappedBoardSize) / 2);
  const boardTop = Math.round(clamp(height * (isPortrait ? 0.11 : 0.088), 44, isPortrait ? 116 : 120));
  const buttonHeight = Math.round(clamp(height * (isPortrait ? 0.058 : 0.09), isPortrait ? 46 : 56, isPortrait ? 78 : 98));
  const buttonY = isPortrait
    ? Math.round(clamp(
      boardTop + snappedBoardSize + Math.round(buttonHeight * 0.95),
      boardTop + snappedBoardSize + 32,
      height - Math.round(buttonHeight * 0.8)
    ))
    : Math.round(clamp(
      boardTop + snappedBoardSize - Math.round(buttonHeight * 0.08),
      boardTop + snappedBoardSize - Math.round(buttonHeight * 0.44),
      height - Math.round(buttonHeight * 0.6)
    ));
  const centerButtonY = isPortrait
    ? Math.round(clamp(
      boardTop + snappedBoardSize + Math.round(buttonHeight * 0.04),
      boardTop + snappedBoardSize - Math.round(buttonHeight * 0.06),
      buttonY - Math.round(buttonHeight * 0.28)
    ))
    : Math.round(clamp(
      boardTop + snappedBoardSize - Math.round(buttonHeight * 0.14),
      boardTop + snappedBoardSize - Math.round(buttonHeight * 0.24),
      buttonY - Math.round(buttonHeight * 0.3)
    ));
  const buttonWidth = Math.round(clamp(width * (isPortrait ? 0.21 : 0.145), isPortrait ? 96 : 164, isPortrait ? 144 : 270));
  const centerButtonWidth = isPortrait
    ? Math.round(clamp(buttonWidth * 1.08, buttonWidth, 160))
    : Math.round(clamp(buttonWidth * 1.42, buttonWidth + 34, 304));
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
