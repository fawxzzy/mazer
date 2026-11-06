/**
 * A `TileBakeContext2D` backed by a Phaser Graphics object.
 *
 * The Chip marker draw code (`drawBoardMarkers` in boardTileBake.ts) is written against a small 2D-context
 * subset. This adapter replays that subset onto Phaser Graphics path commands, so the SAME function paints the
 * start/goal markers on the live board (scene dynamic graphics) and the icons in the in-app Guide sheet, and
 * the tile swatch for wordmark cells. Vector drawing, so it stays crisp at any board zoom with no canvas
 * resolution bookkeeping.
 *
 * Supported: fillStyle/strokeStyle as `rgb()`/`rgba()` strings (what boardTileBake emits), lineWidth,
 * globalAlpha, save/restore of style state, setTransform (translate and uniform scale only), the path calls
 * the painter uses (moveTo/lineTo/arc/arcTo/rect/closePath), fill/stroke/fillRect. Shadows, gradients and
 * clearRect are not used by marker drawing and are inert here.
 */
import type Phaser from 'phaser';
import type { TileBakeContext2D } from './boardTileBake';

interface StyleState {
  fill: { color: number; alpha: number };
  stroke: { color: number; alpha: number };
  lineWidth: number;
  globalAlpha: number;
}

const RGBA = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/;

export const parseCssRgba = (value: unknown): { color: number; alpha: number } => {
  const match = typeof value === 'string' ? RGBA.exec(value) : null;
  if (!match) {
    return { color: 0xffffff, alpha: 1 };
  }
  const r = Math.min(255, Number(match[1]));
  const g = Math.min(255, Number(match[2]));
  const b = Math.min(255, Number(match[3]));
  return { color: (r << 16) | (g << 8) | b, alpha: match[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(match[4]))) };
};

export class PhaserGraphicsTileContext implements TileBakeContext2D {
  lineCap: 'butt' | 'round' | 'square' = 'butt';
  lineJoin: 'round' | 'bevel' | 'miter' = 'miter';
  shadowBlur = 0;
  shadowColor = 'transparent';
  /** Extra multiplier on every fill/stroke alpha (the caller's fade). */
  opacity = 1;

  private state: StyleState = {
    fill: { color: 0xffffff, alpha: 1 },
    stroke: { color: 0xffffff, alpha: 1 },
    lineWidth: 1,
    globalAlpha: 1
  };
  private readonly stack: StyleState[] = [];
  private scale = 1;
  private tx = 0;
  private ty = 0;
  private cx = 0;
  private cy = 0;

  constructor(private readonly graphics: Phaser.GameObjects.Graphics, offsetX = 0, offsetY = 0, scale = 1) {
    this.tx = offsetX;
    this.ty = offsetY;
    this.scale = scale;
  }

  get fillStyle(): unknown { return this.state.fill; }
  set fillStyle(value: unknown) { this.state.fill = parseCssRgba(value); }
  get strokeStyle(): unknown { return this.state.stroke; }
  set strokeStyle(value: unknown) { this.state.stroke = parseCssRgba(value); }
  get lineWidth(): number { return this.state.lineWidth; }
  set lineWidth(value: number) { this.state.lineWidth = value; }
  get globalAlpha(): number { return this.state.globalAlpha; }
  set globalAlpha(value: number) { this.state.globalAlpha = value; }

  private x(value: number): number { return (value * this.scale) + this.tx; }
  private y(value: number): number { return (value * this.scale) + this.ty; }

  save(): void {
    this.stack.push({ ...this.state, fill: { ...this.state.fill }, stroke: { ...this.state.stroke } });
  }

  restore(): void {
    const previous = this.stack.pop();
    if (previous) {
      this.state = previous;
    }
  }

  setTransform(a: number, _b: number, _c: number, _d: number, e: number, f: number): void {
    this.scale = a;
    this.tx = e;
    this.ty = f;
  }

  clearRect(): void { /* markers never clear */ }

  beginPath(): void { this.graphics.beginPath(); }
  closePath(): void { this.graphics.closePath(); }

  moveTo(x: number, y: number): void {
    this.cx = x;
    this.cy = y;
    this.graphics.moveTo(this.x(x), this.y(y));
  }

  lineTo(x: number, y: number): void {
    this.cx = x;
    this.cy = y;
    this.graphics.lineTo(this.x(x), this.y(y));
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise = false): void {
    this.graphics.arc(this.x(x), this.y(y), radius * this.scale, startAngle, endAngle, counterclockwise);
    this.cx = x + (Math.cos(endAngle) * radius);
    this.cy = y + (Math.sin(endAngle) * radius);
  }

  /** Canvas arcTo semantics: a straight line to the tangent point, then an arc of `radius` to the second tangent. */
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    const x0 = this.cx;
    const y0 = this.cy;
    const ax = x0 - x1;
    const ay = y0 - y1;
    const bx = x2 - x1;
    const by = y2 - y1;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    const cross = (ax * by) - (ay * bx);
    if (radius <= 0 || la === 0 || lb === 0 || Math.abs(cross) < 1e-9) {
      this.lineTo(x1, y1);
      return;
    }
    const ux = ax / la;
    const uy = ay / la;
    const vx = bx / lb;
    const vy = by / lb;
    const cosAngle = Math.max(-1, Math.min(1, (ux * vx) + (uy * vy)));
    const half = Math.acos(cosAngle) / 2;
    const tangent = radius / Math.tan(half);
    const t0x = x1 + (ux * tangent);
    const t0y = y1 + (uy * tangent);
    const t1x = x1 + (vx * tangent);
    const t1y = y1 + (vy * tangent);
    const bisX = ux + vx;
    const bisY = uy + vy;
    const bisLen = Math.hypot(bisX, bisY) || 1;
    const centerDistance = radius / Math.sin(half);
    const centerX = x1 + ((bisX / bisLen) * centerDistance);
    const centerY = y1 + ((bisY / bisLen) * centerDistance);
    const start = Math.atan2(t0y - centerY, t0x - centerX);
    const end = Math.atan2(t1y - centerY, t1x - centerX);
    this.lineTo(t0x, t0y);
    // The corner arc is always the shorter sweep (< 180 degrees): counterclockwise when end is before start.
    let delta = end - start;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.arc(centerX, centerY, radius, start, end, delta < 0);
    this.cx = t1x;
    this.cy = t1y;
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }

  fill(): void {
    const { color, alpha } = this.state.fill;
    this.graphics.fillStyle(color, alpha * this.state.globalAlpha * this.opacity);
    this.graphics.fillPath();
  }

  stroke(): void {
    const { color, alpha } = this.state.stroke;
    this.graphics.lineStyle(Math.max(0.5, this.state.lineWidth * this.scale), color, alpha * this.state.globalAlpha * this.opacity);
    this.graphics.strokePath();
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const { color, alpha } = this.state.fill;
    this.graphics.fillStyle(color, alpha * this.state.globalAlpha * this.opacity);
    this.graphics.fillRect(this.x(x), this.y(y), w * this.scale, h * this.scale);
  }
}
