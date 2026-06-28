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
  const baseBoardScale = isPortrait ? 0.74 : 0.43;
  const scaleBias = 1 + ((normalizedScale - 50) / 500);
  const rawBoardSize = Math.min(
    width * baseBoardScale * scaleBias,
    height * (isPortrait ? 0.58 : 0.77) * scaleBias
  );
  const boardSize = Math.round(clamp(rawBoardSize, 300, Math.min(width * 0.82, height * 0.82)));
  const tileSize = Math.max(4, Math.floor(boardSize / Math.max(1, mazeSize)));
  const snappedBoardSize = tileSize * mazeSize;
  const boardLeft = Math.round((width - snappedBoardSize) / 2);
  const boardTop = Math.round(clamp(height * (isPortrait ? 0.1 : 0.12), 44, 132));
  const buttonY = Math.round(clamp(height * (isPortrait ? 0.91 : 0.845), boardTop + snappedBoardSize + 20, height - 54));
  const buttonWidth = Math.round(clamp(width * (isPortrait ? 0.26 : 0.13), 150, 252));
  const buttonHeight = Math.round(clamp(height * (isPortrait ? 0.075 : 0.088), 54, 96));

  return {
    width,
    height,
    boardLeft,
    boardTop,
    boardSize: snappedBoardSize,
    tileSize,
    titleX: Math.round(width / 2),
    titleY: Math.round(boardTop + (snappedBoardSize * 0.18)),
    footerY: height - 18,
    buttonY,
    leftButtonX: Math.round(width * 0.17),
    centerButtonX: Math.round(width * 0.5),
    rightButtonX: Math.round(width * 0.83),
    buttonWidth,
    buttonHeight
  };
};
