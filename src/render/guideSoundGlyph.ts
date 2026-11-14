/**
 * Guide icon for the Sound row (MAZER-AUDIO-003): a small speaker with two sound arcs, drawn with plain Graphics
 * calls. Guide-local (the board has no speaker); the colour is the Guide accent passed in by the scene.
 */
export interface GuideSoundGlyphGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  fillPoints(points: Array<{ x: number; y: number }>, closeShape?: boolean): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  beginPath(): unknown;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): unknown;
  strokePath(): unknown;
}

export const drawGuideSoundGlyph = (
  graphics: GuideSoundGlyphGraphics,
  centerX: number,
  centerY: number,
  radius: number,
  color: number
): void => {
  const unit = radius / 10;
  const left = centerX - 8 * unit;
  const bodyRight = centerX - 4 * unit;
  const coneRight = centerX - 0 * unit;
  graphics.fillStyle(color, 0.95);
  graphics.fillPoints([
    { x: left, y: centerY - 3 * unit },
    { x: bodyRight, y: centerY - 3 * unit },
    { x: coneRight, y: centerY - 7 * unit },
    { x: coneRight, y: centerY + 7 * unit },
    { x: bodyRight, y: centerY + 3 * unit },
    { x: left, y: centerY + 3 * unit }
  ], true);
  graphics.lineStyle(Math.max(1.4, unit * 1.2), color, 0.9);
  for (const arcRadius of [4.5 * unit, 8 * unit]) {
    graphics.beginPath();
    graphics.arc(coneRight + 0.5 * unit, centerY, arcRadius, -Math.PI / 3.2, Math.PI / 3.2, false);
    graphics.strokePath();
  }
};
