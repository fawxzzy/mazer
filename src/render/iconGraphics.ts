/**
 * Icon graphics: the Phaser Graphics subset the board painters draw through, and two adapters so the SAME painter
 * call can land on a plain 2D canvas (DOM text cards: the in-flow notice, the level-1 control hint) or on Phaser
 * Graphics (the Guide sheet, the coach mark pill).
 *
 *  - `IconGraphics`: the methods the board painters use (bleed gate, edge marker, Spark, star dust, chip cell, shard
 *    gem, the Chip marker adapter). Phaser Graphics satisfies it as is.
 *  - `CanvasIconGraphics`: replays those calls onto a CanvasRenderingContext2D with Phaser's path semantics
 *    (fillCircle / fillRoundedRect / fillPoints / lineBetween each start their own path, exactly as Phaser does).
 *  - `createIconLineContext`: the reverse, a tiny 2D-context subset over IconGraphics for the one board painter that
 *    is written against a canvas context (the Pulse Gate bars, hazardGateLayer.ts). It supports what that painter
 *    uses: save/restore, lineCap, setLineDash, beginPath/moveTo/lineTo, globalAlpha, strokeStyle, lineWidth, stroke.
 *    clearRect is inert (an icon has no gate layer to punch through).
 *
 * Pure apart from the context it is handed: no DOM lookups, no Phaser import (tests run it on a recorder).
 */

export interface IconPoint { x: number; y: number }

export type IconCornerRadius = number | { tl: number; tr: number; bl: number; br: number };

/** What the board painters call. Phaser.GameObjects.Graphics is structurally one of these. */
export interface IconGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  beginPath(): unknown;
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  closePath(): unknown;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): unknown;
  fillPath(): unknown;
  strokePath(): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  strokeCircle(x: number, y: number, radius: number): unknown;
  fillRect(x: number, y: number, width: number, height: number): unknown;
  fillRoundedRect(x: number, y: number, width: number, height: number, radius?: IconCornerRadius): unknown;
  strokeRoundedRect(x: number, y: number, width: number, height: number, radius?: IconCornerRadius): unknown;
  fillPoints(points: ReadonlyArray<IconPoint>, closeShape?: boolean): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
}

/** The 2D-context subset CanvasIconGraphics writes to (a real CanvasRenderingContext2D satisfies it). */
export interface IconCanvasTarget {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
}

/** Largest 24-bit RGB value: the clamp bound and the parse fallback (a bound, not a theme colour). */
const RGB24_MAX = (1 << 24) - 1;

export const toIconRgba = (color: number, alpha: number): string => {
  const c = Math.max(0, Math.min(RGB24_MAX, Math.round(color)));
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${(c >> 16) & 0xff}, ${(c >> 8) & 0xff}, ${c & 0xff}, ${Number(a.toFixed(4))})`;
};

const corners = (radius: IconCornerRadius | undefined, width: number, height: number): { tl: number; tr: number; bl: number; br: number } => {
  const cap = Math.max(0, Math.min(width, height) / 2);
  const r = typeof radius === 'number' || radius === undefined
    ? { tl: radius ?? 20, tr: radius ?? 20, bl: radius ?? 20, br: radius ?? 20 }
    : radius;
  return { tl: Math.min(cap, r.tl), tr: Math.min(cap, r.tr), bl: Math.min(cap, r.bl), br: Math.min(cap, r.br) };
};

/** Phaser Graphics semantics on a 2D canvas (colour numbers + alpha, own-path shape calls). */
export class CanvasIconGraphics implements IconGraphics {
  constructor(private readonly ctx: IconCanvasTarget) {}

  fillStyle(color: number, alpha = 1): this { this.ctx.fillStyle = toIconRgba(color, alpha); return this; }
  lineStyle(width: number, color: number, alpha = 1): this {
    this.ctx.lineWidth = width;
    this.ctx.strokeStyle = toIconRgba(color, alpha);
    return this;
  }
  beginPath(): this { this.ctx.beginPath(); return this; }
  moveTo(x: number, y: number): this { this.ctx.moveTo(x, y); return this; }
  lineTo(x: number, y: number): this { this.ctx.lineTo(x, y); return this; }
  closePath(): this { this.ctx.closePath(); return this; }
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise = false): this {
    this.ctx.arc(x, y, radius, startAngle, endAngle, anticlockwise);
    return this;
  }
  fillPath(): this { this.ctx.fill(); return this; }
  strokePath(): this { this.ctx.stroke(); return this; }
  fillCircle(x: number, y: number, radius: number): this {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2, false);
    this.ctx.fill();
    return this;
  }
  strokeCircle(x: number, y: number, radius: number): this {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2, false);
    this.ctx.closePath();
    this.ctx.stroke();
    return this;
  }
  fillRect(x: number, y: number, width: number, height: number): this { this.ctx.fillRect(x, y, width, height); return this; }
  fillRoundedRect(x: number, y: number, width: number, height: number, radius?: IconCornerRadius): this {
    this.traceRoundedRect(x, y, width, height, radius);
    this.ctx.fill();
    return this;
  }
  strokeRoundedRect(x: number, y: number, width: number, height: number, radius?: IconCornerRadius): this {
    this.traceRoundedRect(x, y, width, height, radius);
    this.ctx.stroke();
    return this;
  }
  fillPoints(points: ReadonlyArray<IconPoint>, closeShape = false): this {
    if (points.length === 0) return this;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i += 1) this.ctx.lineTo(points[i]!.x, points[i]!.y);
    if (closeShape) this.ctx.lineTo(points[0]!.x, points[0]!.y);
    this.ctx.fill();
    return this;
  }
  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    return this;
  }

  // Phaser's rounded rect path: corners clockwise from the top-left, each a quarter arc.
  private traceRoundedRect(x: number, y: number, width: number, height: number, radius?: IconCornerRadius): void {
    const r = corners(radius, width, height);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r.tl, y);
    ctx.lineTo(x + width - r.tr, y);
    ctx.arc(x + width - r.tr, y + r.tr, r.tr, -Math.PI / 2, 0, false);
    ctx.lineTo(x + width, y + height - r.br);
    ctx.arc(x + width - r.br, y + height - r.br, r.br, 0, Math.PI / 2, false);
    ctx.lineTo(x + r.bl, y + height);
    ctx.arc(x + r.bl, y + height - r.bl, r.bl, Math.PI / 2, Math.PI, false);
    ctx.lineTo(x, y + r.tl);
    ctx.arc(x + r.tl, y + r.tl, r.tl, Math.PI, Math.PI * 1.5, false);
    ctx.closePath();
  }
}

const RGBA = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/;
const HEX = /^#([0-9a-f]{6})$/i;

const parseCss = (value: unknown): { color: number; alpha: number } => {
  if (typeof value === 'string') {
    const rgba = RGBA.exec(value.trim());
    if (rgba) {
      return {
        color: (Number(rgba[1]) << 16) | (Number(rgba[2]) << 8) | Number(rgba[3]),
        alpha: rgba[4] === undefined ? 1 : Number(rgba[4])
      };
    }
    const hex = HEX.exec(value.trim());
    if (hex) return { color: Number.parseInt(hex[1]!, 16), alpha: 1 };
  }
  return { color: RGB24_MAX, alpha: 1 };
};

/** The 2D-context subset the Pulse Gate painter uses, replayed onto IconGraphics. */
export interface IconLineContext {
  lineCap: string;
  lineWidth: number;
  strokeStyle: unknown;
  globalAlpha: number;
  save(): void;
  restore(): void;
  setLineDash(segments: number[]): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
}

export const createIconLineContext = (g: IconGraphics): IconLineContext => {
  interface State { lineCap: string; lineWidth: number; strokeStyle: unknown; globalAlpha: number; dash: number[] }
  let state: State = { lineCap: 'butt', lineWidth: 1, strokeStyle: RGB24_MAX, globalAlpha: 1, dash: [] };
  const stack: State[] = [];
  let subpaths: IconPoint[][] = [];
  const dashed = (from: IconPoint, to: IconPoint, pattern: readonly number[], emit: (a: IconPoint, b: IconPoint) => void): void => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (!(length > 0)) return;
    if (pattern.length === 0 || pattern.every((v) => !(v > 0))) {
      emit(from, to);
      return;
    }
    const ux = (to.x - from.x) / length;
    const uy = (to.y - from.y) / length;
    let at = 0;
    let index = 0;
    while (at < length) {
      const step = Math.max(0.0001, pattern[index % pattern.length]!);
      const end = Math.min(length, at + step);
      if (index % 2 === 0) emit({ x: from.x + (ux * at), y: from.y + (uy * at) }, { x: from.x + (ux * end), y: from.y + (uy * end) });
      at = end;
      index += 1;
    }
  };
  return {
    get lineCap() { return state.lineCap; },
    set lineCap(value: string) { state.lineCap = value; },
    get lineWidth() { return state.lineWidth; },
    set lineWidth(value: number) { state.lineWidth = value; },
    get strokeStyle() { return state.strokeStyle; },
    set strokeStyle(value: unknown) { state.strokeStyle = value; },
    get globalAlpha() { return state.globalAlpha; },
    set globalAlpha(value: number) { state.globalAlpha = value; },
    save: () => { stack.push({ ...state, dash: [...state.dash] }); },
    restore: () => { state = stack.pop() ?? state; },
    setLineDash: (segments: number[]) => { state.dash = [...segments]; },
    clearRect: () => undefined,
    beginPath: () => { subpaths = []; },
    moveTo: (x: number, y: number) => { subpaths.push([{ x, y }]); },
    lineTo: (x: number, y: number) => {
      if (subpaths.length === 0) subpaths.push([{ x, y }]);
      else subpaths[subpaths.length - 1]!.push({ x, y });
    },
    stroke: () => {
      const { color, alpha } = parseCss(state.strokeStyle);
      g.lineStyle(state.lineWidth, color, alpha * state.globalAlpha);
      g.beginPath();
      for (const path of subpaths) {
        for (let i = 1; i < path.length; i += 1) {
          dashed(path[i - 1]!, path[i]!, state.dash, (a, b) => { g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); });
        }
      }
      g.strokePath();
    }
  };
};
