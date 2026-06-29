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
    isPortrait ? 46 : 60,
    Math.round(boardSize * (isPortrait ? 0.122 : 0.134))
  );
  const shadowOffsetX = Math.max(isPortrait ? 2 : 3, Math.round(tileSize * 0.06));
  const shadowOffsetY = Math.max(isPortrait ? 4 : 5, Math.round(tileSize * (isPortrait ? 0.12 : 0.14)));

  return {
    fontSize,
    shadowOffsetX,
    shadowOffsetY,
    shadowAlpha: isPortrait ? 0.26 : 0.22,
    titleAlpha: isPortrait ? 0.46 : 0.42
  };
};
