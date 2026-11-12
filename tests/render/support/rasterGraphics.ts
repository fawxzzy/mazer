import type { LocatorCornerRadii, LocatorGraphics } from '../../../src/render/playerLocator';
import type { RasterContext } from './rasterContext';

/**
 * The Phaser Graphics subset the player marker paints with (`LocatorGraphics`), over the software rasteriser, so a
 * test can render the REAL marker draw into pixels. Rounded rectangles go through arcTo like Phaser's own path, colour
 * and alpha go through the context's fill/stroke style and global alpha (the rasteriser blends source-over).
 */
export class RasterGraphics implements LocatorGraphics {
  constructor(private readonly ctx: RasterContext) {
    ctx.paintStrokes = true;
  }

  private static rgb(color: number): string {
    return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},1)`;
  }

  fillStyle(color: number, alpha = 1): void {
    this.ctx.fillStyle = RasterGraphics.rgb(color);
    this.ctx.globalAlpha = alpha;
  }

  lineStyle(width: number, color: number, alpha = 1): void {
    this.ctx.lineWidth = width;
    this.ctx.strokeStyle = RasterGraphics.rgb(color);
    this.ctx.globalAlpha = alpha;
  }

  private roundedPath(x: number, y: number, w: number, h: number, radius: number | LocatorCornerRadii): void {
    const limit = Math.min(w / 2, h / 2);
    const clamp = (r: number): number => Math.max(0, Math.min(r, limit));
    const tl = clamp(typeof radius === 'number' ? radius : radius.tl);
    const tr = clamp(typeof radius === 'number' ? radius : radius.tr);
    const br = clamp(typeof radius === 'number' ? radius : radius.br);
    const bl = clamp(typeof radius === 'number' ? radius : radius.bl);
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + tl, y);
    c.arcTo(x + w, y, x + w, y + h, tr);
    c.arcTo(x + w, y + h, x, y + h, br);
    c.arcTo(x, y + h, x, y, bl);
    c.arcTo(x, y, x + w, y, tl);
    c.closePath();
  }

  fillRoundedRect(x: number, y: number, width: number, height: number, radius: number | LocatorCornerRadii): void {
    this.roundedPath(x, y, width, height, radius);
    this.ctx.fill();
  }

  strokeRoundedRect(x: number, y: number, width: number, height: number, radius: number | LocatorCornerRadii): void {
    this.roundedPath(x, y, width, height, radius);
    this.ctx.stroke();
  }
}
