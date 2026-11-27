/**
 * Guide (and intro card) icons for the four hazard kinds (slice H6), drawn with plain Graphics calls
 * like guideSoundGlyph.ts. Guide-local until the board layer draws each kind (H3/H4/H5/H8); the colour
 * is the accent passed in by the scene (`resolveGuideHazardAccent`).
 */
import { cyberArcadeMaterial } from './cyberArcadeMaterial';
import { drawShardGem, SHARD_LOOK } from './shardLook';

export type GuideHazardGlyph = 'hazard-gate' | 'hazard-sentry' | 'hazard-hunter' | 'hazard-shard';

export interface GuideHazardGlyphGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, width: number, height: number): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  fillPoints(points: Array<{ x: number; y: number }>, closeShape?: boolean): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokeCircle(x: number, y: number, radius: number): unknown;
}

export const resolveGuideHazardAccent = (glyph: GuideHazardGlyph): number => {
  switch (glyph) {
    case 'hazard-gate': return cyberArcadeMaterial.signal.memory;
    case 'hazard-sentry': return cyberArcadeMaterial.signal.violet;
    case 'hazard-hunter': return cyberArcadeMaterial.signal.goal;
    case 'hazard-shard': return cyberArcadeMaterial.signal.warning;
  }
};

export const drawGuideHazardGlyph = (
  graphics: GuideHazardGlyphGraphics,
  glyph: GuideHazardGlyph,
  centerX: number,
  centerY: number,
  radius: number,
  color: number
): void => {
  const unit = radius / 10;
  switch (glyph) {
    case 'hazard-gate': {
      // Two posts with a broken bar between them: the gap the beat opens.
      graphics.fillStyle(color, 0.95);
      graphics.fillRect(centerX - 8 * unit, centerY - 7 * unit, 3 * unit, 14 * unit);
      graphics.fillRect(centerX + 5 * unit, centerY - 7 * unit, 3 * unit, 14 * unit);
      graphics.fillStyle(color, 0.7);
      graphics.fillRect(centerX - 5 * unit, centerY - 4 * unit, 3 * unit, 2 * unit);
      graphics.fillRect(centerX + 2 * unit, centerY - 4 * unit, 3 * unit, 2 * unit);
      graphics.fillRect(centerX - 5 * unit, centerY + 2 * unit, 3 * unit, 2 * unit);
      graphics.fillRect(centerX + 2 * unit, centerY + 2 * unit, 3 * unit, 2 * unit);
      return;
    }
    case 'hazard-sentry': {
      // A diamond on its short loop.
      graphics.lineStyle(Math.max(1.2, unit), color, 0.6);
      graphics.strokeCircle(centerX, centerY, 7 * unit);
      graphics.fillStyle(color, 0.95);
      graphics.fillPoints([
        { x: centerX, y: centerY - 4.5 * unit },
        { x: centerX + 4.5 * unit, y: centerY },
        { x: centerX, y: centerY + 4.5 * unit },
        { x: centerX - 4.5 * unit, y: centerY }
      ], true);
      return;
    }
    case 'hazard-hunter': {
      // A chevron leaning forward, with one trailing dot (it follows you).
      graphics.fillStyle(color, 0.95);
      graphics.fillPoints([
        { x: centerX - 3 * unit, y: centerY - 7 * unit },
        { x: centerX + 6 * unit, y: centerY },
        { x: centerX - 3 * unit, y: centerY + 7 * unit },
        { x: centerX, y: centerY }
      ], true);
      graphics.fillStyle(color, 0.6);
      graphics.fillCircle(centerX - 7 * unit, centerY, 1.6 * unit);
      return;
    }
    case 'hazard-shard': {
      // The board's sharp gem (shardLook.ts), so the Guide row and the intro card match what play shows.
      drawShardGem(graphics, centerX, centerY, 8 * unit, 8 * unit * (SHARD_LOOK.gem.halfWidthOfTile / SHARD_LOOK.gem.halfHeightOfTile), 1, Math.max(1, unit));
      return;
    }
  }
};
