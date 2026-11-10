import type { TileBakeContext2D } from '../../../src/render/boardTileBake';

/**
 * A tiny software rasteriser that implements the `TileBakeContext2D` subset the board bake and the marker draw
 * use, so tests can render the REAL draw code into pixels and compare edges.
 *
 * Fill only: `fill()` / `fillRect()` rasterise the current path with the non-zero winding rule, sampling each
 * device pixel at its centre (no anti-aliasing: a pixel is either inside or outside, which is exactly what an
 * edge-coincidence test wants). `stroke()`, shadows and `clearRect` of partial areas are not needed by these
 * tests and are inert. Colours are `rgb()` / `rgba()` strings, as boardTileBake emits; alpha blends source-over.
 */
export type Rgba = readonly [number, number, number, number];

const RGBA = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/;

export const parseRgba = (value: unknown): Rgba => {
  const match = typeof value === 'string' ? RGBA.exec(value) : null;
  if (!match) return [255, 255, 255, 1];
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
};

interface State {
  fill: Rgba;
  alpha: number;
  a: number;
  d: number;
  e: number;
  f: number;
}

type Point = readonly [number, number];

const ARC_STEPS_PER_QUARTER = 24;

export class RasterContext implements TileBakeContext2D {
  fillStyle: unknown = 'rgb(0,0,0)';
  strokeStyle: unknown = 'rgb(0,0,0)';
  lineWidth = 1;
  lineCap: 'butt' | 'round' | 'square' = 'butt';
  lineJoin: 'round' | 'bevel' | 'miter' = 'miter';
  globalAlpha = 1;
  shadowBlur = 0;
  shadowColor = '';

  readonly data: Uint8ClampedArray;
  private readonly stack: State[] = [];
  private a = 1;
  private d = 1;
  private e = 0;
  private f = 0;
  private subpaths: Point[][] = [];
  private current: Point[] | null = null;
  private cursor: Point = [0, 0];

  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  save(): void {
    this.stack.push({
      fill: parseRgba(this.fillStyle), alpha: this.globalAlpha, a: this.a, d: this.d, e: this.e, f: this.f
    });
  }

  restore(): void {
    const s = this.stack.pop();
    if (s) {
      this.fillStyle = `rgba(${s.fill[0]},${s.fill[1]},${s.fill[2]},${s.fill[3]})`;
      this.globalAlpha = s.alpha;
      this.a = s.a; this.d = s.d; this.e = s.e; this.f = s.f;
    }
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    if (b !== 0 || c !== 0) throw new Error('RasterContext supports scale and translate only');
    this.a = a; this.d = d; this.e = e; this.f = f;
  }

  clearRect(): void {
    this.data.fill(0);
  }

  beginPath(): void {
    this.subpaths = [];
    this.current = null;
  }

  private device(x: number, y: number): Point {
    return [(x * this.a) + this.e, (y * this.d) + this.f];
  }

  private begin(x: number, y: number): void {
    const p = this.device(x, y);
    this.current = [p];
    this.subpaths.push(this.current);
    this.cursor = [x, y];
  }

  moveTo(x: number, y: number): void {
    this.begin(x, y);
  }

  lineTo(x: number, y: number): void {
    if (!this.current) {
      this.begin(x, y);
      return;
    }
    this.current.push(this.device(x, y));
    this.cursor = [x, y];
  }

  closePath(): void {
    if (this.current && this.current.length > 0) {
      const start = this.current[0]!;
      this.current.push([start[0], start[1]]);
    }
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.begin(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
    this.cursor = [x, y];
  }

  arc(x: number, y: number, radius: number, start: number, end: number, counterclockwise = false): void {
    let delta = end - start;
    if (!counterclockwise && delta < 0) delta += Math.PI * 2 * Math.ceil(-delta / (Math.PI * 2));
    if (counterclockwise && delta > 0) delta -= Math.PI * 2 * Math.ceil(delta / (Math.PI * 2));
    if (Math.abs(delta) > Math.PI * 2) delta = Math.sign(delta) * Math.PI * 2;
    const steps = Math.max(2, Math.ceil((Math.abs(delta) / (Math.PI / 2)) * ARC_STEPS_PER_QUARTER));
    for (let i = 0; i <= steps; i += 1) {
      const t = start + (delta * (i / steps));
      const px = x + (Math.cos(t) * radius);
      const py = y + (Math.sin(t) * radius);
      if (i === 0 && !this.current) this.begin(px, py);
      else this.lineTo(px, py);
    }
  }

  /** Canvas arcTo: straight line to the first tangent point, then the shorter arc to the second. */
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    const [x0, y0] = this.cursor;
    const ax = x0 - x1; const ay = y0 - y1;
    const bx = x2 - x1; const by = y2 - y1;
    const la = Math.hypot(ax, ay); const lb = Math.hypot(bx, by);
    const cross = (ax * by) - (ay * bx);
    if (radius <= 0 || la === 0 || lb === 0 || Math.abs(cross) < 1e-9) {
      this.lineTo(x1, y1);
      return;
    }
    const ux = ax / la; const uy = ay / la; const vx = bx / lb; const vy = by / lb;
    const half = Math.acos(Math.max(-1, Math.min(1, (ux * vx) + (uy * vy)))) / 2;
    const tangent = radius / Math.tan(half);
    const t0x = x1 + (ux * tangent); const t0y = y1 + (uy * tangent);
    const t1x = x1 + (vx * tangent); const t1y = y1 + (vy * tangent);
    const bisX = ux + vx; const bisY = uy + vy;
    const bisLen = Math.hypot(bisX, bisY) || 1;
    const centerDistance = radius / Math.sin(half);
    const cx = x1 + ((bisX / bisLen) * centerDistance);
    const cy = y1 + ((bisY / bisLen) * centerDistance);
    const start = Math.atan2(t0y - cy, t0x - cx);
    const end = Math.atan2(t1y - cy, t1x - cx);
    this.lineTo(t0x, t0y);
    let delta = end - start;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.arc(cx, cy, radius, start, end, delta < 0);
    this.cursor = [t1x, t1y];
  }

  fill(): void {
    this.rasterise(this.subpaths);
  }

  stroke(): void {
    /* inert: the edge tests are about fills */
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.rasterise([[this.device(x, y), this.device(x + w, y), this.device(x + w, y + h), this.device(x, y + h), this.device(x, y)]]);
  }

  private blend(px: number, py: number, color: Rgba): void {
    const i = ((py * this.width) + px) * 4;
    const sa = Math.max(0, Math.min(1, color[3] * this.globalAlpha));
    const da = this.data[i + 3]! / 255;
    const oa = sa + (da * (1 - sa));
    for (let c = 0; c < 3; c += 1) {
      const dst = this.data[i + c]!;
      this.data[i + c] = oa === 0 ? 0 : Math.round(((color[c]! * sa) + (dst * da * (1 - sa))) / oa);
    }
    this.data[i + 3] = Math.round(oa * 255);
  }

  private rasterise(paths: Point[][]): void {
    const color = parseRgba(this.fillStyle);
    const edges: Array<[number, number, number, number]> = [];
    for (const path of paths) {
      if (path.length < 2) continue;
      for (let i = 0; i < path.length; i += 1) {
        const p = path[i]!;
        const q = path[(i + 1) % path.length]!;
        if (p[1] !== q[1]) edges.push([p[0], p[1], q[0], q[1]]);
      }
    }
    if (edges.length === 0) return;
    let minY = Infinity; let maxY = -Infinity;
    for (const e of edges) { minY = Math.min(minY, e[1], e[3]); maxY = Math.max(maxY, e[1], e[3]); }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.height - 1, Math.ceil(maxY));
    for (let py = y0; py <= y1; py += 1) {
      const sy = py + 0.5;
      const crossings: Array<[number, number]> = [];
      for (const [x0, ey0, x1, ey1] of edges) {
        const lo = Math.min(ey0, ey1); const hi = Math.max(ey0, ey1);
        if (sy < lo || sy >= hi) continue;
        crossings.push([x0 + (((sy - ey0) / (ey1 - ey0)) * (x1 - x0)), ey1 > ey0 ? 1 : -1]);
      }
      crossings.sort((p, q) => p[0] - q[0]);
      let winding = 0;
      for (let i = 0; i < crossings.length - 1; i += 1) {
        winding += crossings[i]![1];
        if (winding === 0) continue;
        const xa = crossings[i]![0]; const xb = crossings[i + 1]![0];
        // pixel centres px + 0.5 in [xa, xb)
        const from = Math.max(0, Math.ceil(xa - 0.5));
        const to = Math.min(this.width - 1, Math.ceil(xb - 0.5) - 1);
        for (let px = from; px <= to; px += 1) this.blend(px, py, color);
      }
    }
  }

  pixel(px: number, py: number): Rgba {
    const i = ((py * this.width) + px) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]!];
  }

  clone(): RasterContext {
    const copy = new RasterContext(this.width, this.height);
    copy.data.set(this.data);
    return copy;
  }
}
