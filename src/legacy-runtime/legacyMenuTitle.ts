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
    isPortrait ? 78 : 152,
    Math.round(boardSize * (isPortrait ? 0.205 : 0.244))
  );
  const shadowOffsetX = Math.max(isPortrait ? 4 : 5, Math.round(tileSize * 0.12));
  const shadowOffsetY = Math.max(isPortrait ? 6 : 8, Math.round(tileSize * (isPortrait ? 0.2 : 0.24)));

  return {
    fontSize,
    shadowOffsetX,
    shadowOffsetY,
    shadowAlpha: isPortrait ? 0.5 : 0.48,
    titleAlpha: isPortrait ? 0.84 : 0.82
  };
};
