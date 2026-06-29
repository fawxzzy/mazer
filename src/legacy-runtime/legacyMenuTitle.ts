export interface LegacyMenuTitlePresentation {
  fontSize: number;
  shadowAlpha: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  titleAlpha: number;
}

export const resolveLegacyMenuTitlePresentation = (
  boardSize: number,
  tileSize: number,
  isPortrait: boolean
): LegacyMenuTitlePresentation => {
  const fontSize = Math.max(
    isPortrait ? 76 : 146,
    Math.round(boardSize * (isPortrait ? 0.198 : 0.236))
  );
  const shadowOffsetX = Math.max(isPortrait ? 4 : 5, Math.round(tileSize * 0.1));
  const shadowOffsetY = Math.max(isPortrait ? 6 : 7, Math.round(tileSize * (isPortrait ? 0.18 : 0.22)));

  return {
    fontSize,
    shadowOffsetX,
    shadowOffsetY,
    shadowAlpha: isPortrait ? 0.46 : 0.42,
    titleAlpha: isPortrait ? 0.79 : 0.76
  };
};
