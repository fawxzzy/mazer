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
  isPortrait: boolean,
  viewportWidth = boardSize
): LegacyMenuTitlePresentation => {
  const baseFontSize = Math.max(
    isPortrait ? 78 : 142,
    Math.round(boardSize * (isPortrait ? 0.205 : 0.226))
  );
  const isUltraNarrow = isPortrait && viewportWidth < 360;
  const fontSize = isUltraNarrow
    ? Math.round(Math.min(baseFontSize, Math.max(42, viewportWidth * 0.3)))
    : baseFontSize;
  const shadowOffsetX = isUltraNarrow
    ? Math.max(2, Math.round(fontSize * 0.07))
    : Math.max(isPortrait ? 4 : 5, Math.round(tileSize * 0.12));
  const shadowOffsetY = isUltraNarrow
    ? Math.max(3, Math.round(fontSize * 0.09))
    : Math.max(isPortrait ? 6 : 7, Math.round(tileSize * 0.2));

  return {
    fontSize,
    shadowOffsetX,
    shadowOffsetY,
    shadowAlpha: isPortrait ? 0.38 : 0.34,
    titleAlpha: isPortrait ? 0.76 : 0.7
  };
};
