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
    isPortrait ? 72 : 138,
    Math.round(boardSize * (isPortrait ? 0.19 : 0.228))
  );
  const shadowOffsetX = Math.max(isPortrait ? 4 : 5, Math.round(tileSize * 0.1));
  const shadowOffsetY = Math.max(isPortrait ? 6 : 7, Math.round(tileSize * (isPortrait ? 0.18 : 0.22)));

  return {
    fontSize,
    shadowOffsetX,
    shadowOffsetY,
    shadowAlpha: isPortrait ? 0.42 : 0.38,
    titleAlpha: isPortrait ? 0.74 : 0.7
  };
};
