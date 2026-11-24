import { designTokens } from '../theme/tokens';
import { resolveLegacyMenuBurgerMetrics } from '../legacy-runtime/legacyMenuDropdown';

/**
 * MAZER-UI-097: the button icon set, "C Star Dust" (owner pick 2026-11-19). The ONE place the game's button icon
 * art lives: every glyph, its colours and the painters that draw it. Swapping the set later is a change to this file
 * only; callers ask for an icon by id (BootScene bakes the dropdown / in-play textures, menuDropdownArt draws the
 * menu toggle's sparks, the Guide draws the sound row).
 *
 * C is a clean line body (round caps, 2 of 24 units) where each icon carries one four-point spark from the board's
 * own vocabulary (Spark player, Star dust trail). The spark carries meaning: Sound off has none.
 *
 * Geometry is authored as SVG path data on a 24-unit box and flattened ONCE to polylines at module load (fixed
 * segment counts, so the result is deterministic). The painters only need moveTo/lineTo/arc/fill/stroke, so the
 * same art bakes into a canvas texture and draws into Phaser Graphics without Path2D.
 */

export const BUTTON_ICON_SET_ID = 'star-dust-c';
export const BUTTON_ICON_SET_NAME = 'C Star Dust';
/** Authoring box: every glyph is drawn on a 24 x 24 unit grid. */
export const BUTTON_ICON_VIEWBOX = 24;
/** Line body width in authoring units (C: 2 of 24). */
export const BUTTON_ICON_STROKE_UNITS = 2;
/** Spark keyline width in authoring units (the spark is filled and stroked so its points read at 20 px). */
export const BUTTON_ICON_SPARK_STROKE_UNITS = 1.1;

/** The 19 buttons of the icon options page plus Reset level (in-game menu row). */
export const BUTTON_ICON_IDS = [
  'menu', 'menuOpen', 'settings', 'profile', 'leaderboard', 'pause', 'resume', 'home', 'back', 'close',
  'soundOn', 'soundOff', 'guide', 'signIn', 'eye', 'eyeOff', 'check', 'share', 'install', 'reset', 'feedback'
] as const;
export type ButtonIconId = (typeof BUTTON_ICON_IDS)[number];
export type ButtonIconState = 'idle' | 'pressed';

export const isButtonIconId = (value: unknown): value is ButtonIconId => (
  typeof value === 'string' && (BUTTON_ICON_IDS as readonly string[]).includes(value)
);

const color = designTokens.color;
/** Ink and spark colours per state, as CSS hex (tokens: line.active rim, semantic.info cyan, world.pathCore core). */
export const BUTTON_ICON_PALETTE = Object.freeze({
  ink: color['line.active'],
  inkPressed: color['semantic.info'],
  spark: color['semantic.info'],
  sparkPressed: color['world.pathCore'],
  /** Pressed ring (the button shrinks to a soft cyan ring), as an rgb triple + alphas. */
  ring: color['semantic.info'],
  ringFillAlpha: 0.12,
  ringStrokeAlpha: 0.55
});

export const cssHexToNumber = (hex: string): number => Number.parseInt(hex.replace('#', '').slice(0, 6), 16);

// ---------------------------------------------------------------- SVG path flattening (module-load only)

export interface IconPoint { readonly x: number; readonly y: number }
export interface IconPolyline { readonly points: readonly IconPoint[]; readonly closed: boolean }

const CURVE_SEGMENTS = 10;
const round4 = (v: number): number => Math.round(v * 10000) / 10000;

const cubic = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const u = 1 - t;
  return (u * u * u * p0) + (3 * u * u * t * p1) + (3 * u * t * t * p2) + (t * t * t * p3);
};
const quad = (p0: number, p1: number, p2: number, t: number): number => {
  const u = 1 - t;
  return (u * u * p0) + (2 * u * t * p1) + (t * t * p2);
};

/** SVG arc (endpoint form) to points, per the SVG 1.1 implementation notes F.6.5. Excludes the start point. */
const arcPoints = (
  x1: number, y1: number, rxIn: number, ryIn: number, phiDeg: number, largeArc: boolean, sweep: boolean, x2: number, y2: number
): IconPoint[] => {
  if (rxIn === 0 || ryIn === 0) {
    return [{ x: x2, y: y2 }];
  }
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = (cos * dx) + (sin * dy);
  const y1p = (-sin * dx) + (cos * dy);
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  const lambda = ((x1p * x1p) / (rx * rx)) + ((y1p * y1p) / (ry * ry));
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = (rx * rx * ry * ry) - (rx * rx * y1p * y1p) - (ry * ry * x1p * x1p);
  const den = (rx * rx * y1p * y1p) + (ry * ry * x1p * x1p);
  const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);
  const cx = (cos * cxp) - (sin * cyp) + ((x1 + x2) / 2);
  const cy = (sin * cxp) + (cos * cyp) + ((y1 + y2) / 2);
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const a = Math.atan2((ux * vy) - (uy * vx), (ux * vx) + (uy * vy));
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;
  const steps = Math.max(4, Math.ceil((Math.abs(delta) / (Math.PI * 2)) * 32));
  const out: IconPoint[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = theta1 + ((delta * i) / steps);
    out.push({
      x: (cos * rx * Math.cos(t)) - (sin * ry * Math.sin(t)) + cx,
      y: (sin * rx * Math.cos(t)) + (cos * ry * Math.sin(t)) + cy
    });
  }
  out[out.length - 1] = { x: x2, y: y2 };
  return out;
};

/** Flattens SVG path data (M L H V C S Q Z A, absolute and relative) to polylines in the path's own units. */
export const flattenSvgPath = (d: string): IconPolyline[] => {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const lines: IconPolyline[] = [];
  let current: IconPoint[] = [];
  let closed = false;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastCtrl: IconPoint | null = null;
  let cmd = '';
  let i = 0;
  const num = (): number => Number(tokens[i++]);
  const flush = (): void => {
    if (current.length > 1) {
      lines.push({ closed, points: current.map((p) => ({ x: round4(p.x), y: round4(p.y) })) });
    }
    current = [];
    closed = false;
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i]!)) {
      cmd = tokens[i++]!;
    }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        flush();
        x = ox + num();
        y = oy + num();
        startX = x;
        startY = y;
        current.push({ x, y });
        cmd = rel ? 'l' : 'L';
        lastCtrl = null;
        break;
      }
      case 'L':
        x = ox + num();
        y = oy + num();
        current.push({ x, y });
        lastCtrl = null;
        break;
      case 'H':
        x = ox + num();
        current.push({ x, y });
        lastCtrl = null;
        break;
      case 'V':
        y = oy + num();
        current.push({ x, y });
        lastCtrl = null;
        break;
      case 'C':
      case 'S': {
        let c1: IconPoint;
        if (cmd.toUpperCase() === 'C') {
          c1 = { x: ox + num(), y: oy + num() };
        } else {
          c1 = lastCtrl ? { x: (2 * x) - lastCtrl.x, y: (2 * y) - lastCtrl.y } : { x, y };
        }
        const c2 = { x: ox + num(), y: oy + num() };
        const end = { x: ox + num(), y: oy + num() };
        for (let s = 1; s <= CURVE_SEGMENTS; s += 1) {
          const t = s / CURVE_SEGMENTS;
          current.push({ x: cubic(x, c1.x, c2.x, end.x, t), y: cubic(y, c1.y, c2.y, end.y, t) });
        }
        lastCtrl = c2;
        x = end.x;
        y = end.y;
        break;
      }
      case 'Q': {
        const c = { x: ox + num(), y: oy + num() };
        const end = { x: ox + num(), y: oy + num() };
        for (let s = 1; s <= CURVE_SEGMENTS; s += 1) {
          const t = s / CURVE_SEGMENTS;
          current.push({ x: quad(x, c.x, end.x, t), y: quad(y, c.y, end.y, t) });
        }
        lastCtrl = null;
        x = end.x;
        y = end.y;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const phi = num();
        const large = num() !== 0;
        const sweep = num() !== 0;
        const end = { x: ox + num(), y: oy + num() };
        current.push(...arcPoints(x, y, rx, ry, phi, large, sweep, end.x, end.y));
        lastCtrl = null;
        x = end.x;
        y = end.y;
        break;
      }
      case 'Z':
        closed = true;
        x = startX;
        y = startY;
        flush();
        current = [];
        lastCtrl = null;
        // A Z followed by coordinates (no M) is not used by the glyphs; skip any stray numbers.
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) i += 1;
        break;
      default:
        i += 1;
    }
  }
  flush();
  return lines;
};

// ---------------------------------------------------------------- C: Star Dust glyphs (24-unit box)

const r2 = (v: number): number => Math.round(v * 100) / 100;
const gearPath = (teeth: number, tip: number, root: number, cx = 12, cy = 12): string => {
  const pts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i += 1) {
    const c = (i * step) - (Math.PI / 2);
    for (const [o, rad] of [[-0.5, root], [-0.24, tip], [0.24, tip], [0.5, root]] as const) {
      const a = c + (o * step);
      pts.push(`${r2(cx + (Math.cos(a) * rad))} ${r2(cy + (Math.sin(a) * rad))}`);
    }
  }
  return `M${pts[0]}L${pts.slice(1).join('L')}Z`;
};
const circlePath = (cx: number, cy: number, r: number): string => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const SPEAKER = 'M4 9.5h3l5-4v13l-5-4H4z';
const LENS = 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z';

/** [cx, cy, r] in authoring units. */
export type IconAccent = readonly [number, number, number];
export interface ButtonIconSource {
  /** Line body: SVG path data, optionally with its own width in units (default BUTTON_ICON_STROKE_UNITS). */
  readonly body: ReadonlyArray<string | Readonly<{ d: string; width: number }>>;
  /** Four-point sparks (the Star Dust accent). */
  readonly sparks: readonly IconAccent[];
  /** Round dust dots (trail motes). */
  readonly dots: readonly IconAccent[];
}
const g = (body: ButtonIconSource['body'], sparks: IconAccent[] = [], dots: IconAccent[] = []): ButtonIconSource => (
  Object.freeze({ body: Object.freeze([...body]), dots: Object.freeze(dots), sparks: Object.freeze(sparks) })
);

/** The C Star Dust set, transcribed from the owner-picked options page (round 1, set C) plus a Reset glyph. */
export const BUTTON_ICON_SOURCES: Readonly<Record<ButtonIconId, ButtonIconSource>> = Object.freeze({
  menu: g(['M9 7h10M9 12h10M9 17h10'], [[4.8, 7, 1.7], [4.8, 12, 1.7], [4.8, 17, 1.7]]),
  menuOpen: g(['M6 6l12 12M18 6L6 18'], [], [[12, 12, 1.4]]),
  settings: g([gearPath(7, 9.6, 7.4)], [[12, 12, 3.2]]),
  profile: g(['M5 20.5c0-3.9 3.1-6 7-6s7 2.1 7 6'], [[12, 8, 4.4]]),
  leaderboard: g([{ d: 'M6 20v-6M12 20V10M18 20v-4', width: 2.4 }], [[12, 4.8, 2.8]]),
  pause: g(['M9 6v12M15 6v12'], [[20, 4.5, 1.9]]),
  resume: g(['M9 5.5v13l10.5-6.5z'], [], [[4.6, 12, 1.25], [2.4, 12, 0.8]]),
  home: g(['M4 11l8-7 8 7M6 9.5V20h12V9.5'], [[12, 14.6, 2.9]]),
  back: g(['M13 5l-7 7 7 7'], [], [[16.2, 12, 1.3], [19.6, 12, 0.95], [22.4, 12, 0.6]]),
  close: g(['M6 6l12 12M18 6L6 18']),
  soundOn: g([SPEAKER, 'M15.5 9a4 4 0 0 1 0 6'], [[19.8, 12, 2.6]]),
  soundOff: g([SPEAKER, 'M16 9.5l5 5M21 9.5l-5 5']),
  guide: g(['M8.6 8.6a3.4 3.4 0 1 1 4.8 3.1c-.9.4-1.4 1.1-1.4 2v.8'], [[12, 18.6, 2.3]]),
  signIn: g([circlePath(16, 12, 5.5), 'M2.5 12h8M7.5 9l3 3-3 3'], [[16, 12, 2.2]]),
  eye: g([LENS], [[12, 12, 3.4]]),
  eyeOff: g([LENS, circlePath(12, 12, 2.6), 'M4 4l16 16']),
  check: g(['M4.5 13l4.5 4.5L18 8'], [[20.6, 4.6, 2]]),
  share: g(['M8.6 10.8l6.8-3.4M8.6 13.2l6.8 3.4'], [[6, 12, 3], [18, 6, 3], [18, 18, 3]]),
  install: g(['M12 4v10M8 10.5l4 4 4-4M5 17v3h14v-3'], [[19.5, 4.5, 2]]),
  reset: g(['M19 12.5a7 7 0 1 1-2.2-5.6', 'M18.5 3.8v3.7h-3.7'], [[12, 12.5, 2.4]]),
  /** MAZER-FB-001: a speech bubble with the Star Dust spark inside (the Menu's Feedback row). */
  feedback: g(['M4.5 5.5h15v10.5h-7.5l-4.2 3.6V16H4.5z'], [[12, 10.8, 2.6]])
});

export interface ButtonIconStroke extends IconPolyline { readonly width: number }
export interface ButtonIconGlyph {
  readonly id: ButtonIconId;
  readonly strokes: readonly ButtonIconStroke[];
  readonly sparks: readonly IconAccent[];
  readonly dots: readonly IconAccent[];
}

const glyphCache = new Map<ButtonIconId, ButtonIconGlyph>();

/** The flattened glyph for `id` (units: the 24-unit authoring box). Cached; identical on every call. */
export const resolveButtonIconGlyph = (id: ButtonIconId): ButtonIconGlyph => {
  const cached = glyphCache.get(id);
  if (cached) {
    return cached;
  }
  const source = BUTTON_ICON_SOURCES[id];
  const strokes: ButtonIconStroke[] = [];
  for (const part of source.body) {
    const d = typeof part === 'string' ? part : part.d;
    const width = typeof part === 'string' ? BUTTON_ICON_STROKE_UNITS : part.width;
    for (const line of flattenSvgPath(d)) {
      strokes.push(Object.freeze({ ...line, width }));
    }
  }
  const glyph: ButtonIconGlyph = Object.freeze({ dots: source.dots, id, sparks: source.sparks, strokes: Object.freeze(strokes) });
  glyphCache.set(id, glyph);
  return glyph;
};

// ---------------------------------------------------------------- the spark (four-point star)

const SPARK_SEGMENT_STEPS = 5;
/** Unit spark (centre 0,0, radius 1): four quadratic curves from tip to tip, each pulled to the centre. */
export const UNIT_SPARK_POINTS: readonly IconPoint[] = Object.freeze((() => {
  const tips: IconPoint[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  const out: IconPoint[] = [];
  for (let k = 0; k < 4; k += 1) {
    const a = tips[k]!;
    const b = tips[(k + 1) % 4]!;
    for (let s = 0; s < SPARK_SEGMENT_STEPS; s += 1) {
      const t = s / SPARK_SEGMENT_STEPS;
      out.push({ x: round4(quad(a.x, 0, b.x, t)), y: round4(quad(a.y, 0, b.y, t)) });
    }
  }
  return out;
})());

export const resolveSparkPoints = (cx: number, cy: number, r: number): IconPoint[] => (
  UNIT_SPARK_POINTS.map((p) => ({ x: cx + (p.x * r), y: cy + (p.y * r) }))
);

// ---------------------------------------------------------------- painting

/** The canvas 2D subset the painter uses (a real CanvasRenderingContext2D, or a test raster). */
export interface ButtonIconContext2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap?: CanvasLineCap;
  lineJoin?: CanvasLineJoin;
  globalAlpha: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, start: number, end: number, counterclockwise?: boolean): void;
  fill(): void;
  stroke(): void;
}

export interface ButtonIconFrame {
  /** Top-left of the glyph box and its side, in the target's units (device px for a bake). */
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface ButtonIconColours {
  readonly ink: string;
  readonly spark: string;
}

export const resolveButtonIconColours = (state: ButtonIconState): ButtonIconColours => (
  state === 'pressed'
    ? { ink: BUTTON_ICON_PALETTE.inkPressed, spark: BUTTON_ICON_PALETTE.sparkPressed }
    : { ink: BUTTON_ICON_PALETTE.ink, spark: BUTTON_ICON_PALETTE.spark }
);

const tracePolyline = (ctx: ButtonIconContext2D, points: readonly IconPoint[], closed: boolean, ox: number, oy: number, s: number): void => {
  ctx.moveTo(ox + (points[0]!.x * s), oy + (points[0]!.y * s));
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(ox + (points[i]!.x * s), oy + (points[i]!.y * s));
  }
  if (closed) {
    ctx.closePath();
  }
};

/** Paints glyph `id` into `frame` (any units). Pure: the same inputs issue the same calls. */
export const paintButtonIcon = (
  ctx: ButtonIconContext2D,
  id: ButtonIconId,
  frame: ButtonIconFrame,
  colours: ButtonIconColours = resolveButtonIconColours('idle')
): void => {
  const glyph = resolveButtonIconGlyph(id);
  const s = frame.size / BUTTON_ICON_VIEWBOX;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colours.ink;
  for (const stroke of glyph.strokes) {
    ctx.lineWidth = stroke.width * s;
    ctx.beginPath();
    tracePolyline(ctx, stroke.points, stroke.closed, frame.x, frame.y, s);
    ctx.stroke();
  }
  ctx.fillStyle = colours.spark;
  ctx.strokeStyle = colours.spark;
  ctx.lineWidth = BUTTON_ICON_SPARK_STROKE_UNITS * s;
  for (const [cx, cy, r] of glyph.sparks) {
    ctx.beginPath();
    tracePolyline(ctx, resolveSparkPoints(cx, cy, r), true, frame.x, frame.y, s);
    ctx.fill();
    ctx.stroke();
  }
  for (const [cx, cy, r] of glyph.dots) {
    ctx.beginPath();
    ctx.arc(frame.x + (cx * s), frame.y + (cy * s), r * s, 0, Math.PI * 2);
    ctx.fill();
  }
};

// ---------------------------------------------------------------- HUD textures (baked once at boot)

/** The dropdown rows and the in-play control ask for these keys (BootScene bakes them once). */
export const BUTTON_ICON_HUD_TEXTURE_IDS = Object.freeze({
  leaderboard: 'leaderboard',
  profile: 'profile',
  settings: 'settings'
} as const satisfies Record<string, ButtonIconId>);

/** Texture key of the pressed (lit) variant of a baked HUD icon. */
export const resolveButtonIconPressedTextureKey = (key: string): string => `${key}:pressed`;

/**
 * Bakes glyph `id` into a square `cellPx` texture with the glyph filling `box` (the same cell + glyph box the old HUD
 * atlas used, so the scene's crop and sizing stay unchanged). Clears the cell first.
 */
export const bakeButtonIconCell = (
  ctx: ButtonIconContext2D & { clearRect(x: number, y: number, w: number, h: number): void },
  id: ButtonIconId,
  cellPx: number,
  box: Readonly<{ x: number; y: number; width: number; height: number }>,
  state: ButtonIconState
): void => {
  ctx.clearRect(0, 0, cellPx, cellPx);
  ctx.globalAlpha = 1;
  paintButtonIcon(ctx, id, { size: Math.min(box.width, box.height), x: box.x, y: box.y }, resolveButtonIconColours(state));
};

// ---------------------------------------------------------------- Phaser Graphics (menu toggle dust, Guide rows)

/** The Graphics subset the Graphics painters use (Phaser.GameObjects.Graphics satisfies it). */
export interface ButtonIconGraphics {
  lineStyle(width: number, color: number, alpha?: number): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  strokePoints(points: Array<{ x: number; y: number }>, closeShape?: boolean, closePath?: boolean): unknown;
  fillPoints(points: Array<{ x: number; y: number }>, closeShape?: boolean, closePath?: boolean): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
}

/**
 * Draws glyph `id` with Graphics, centred on (centerX, centerY) in a `size` px box. Graphics strokes are butt-ended,
 * so every polyline end gets a round cap dot (the same trick the menu toggle uses).
 */
export const drawButtonIconGraphics = (
  graphics: ButtonIconGraphics,
  id: ButtonIconId,
  centerX: number,
  centerY: number,
  size: number,
  colours: Readonly<{ ink: number; spark: number }>,
  alpha = 1
): void => {
  const glyph = resolveButtonIconGlyph(id);
  const s = size / BUTTON_ICON_VIEWBOX;
  const ox = centerX - (size / 2);
  const oy = centerY - (size / 2);
  const map = (p: IconPoint): { x: number; y: number } => ({ x: ox + (p.x * s), y: oy + (p.y * s) });
  for (const stroke of glyph.strokes) {
    const pts = stroke.points.map(map);
    const width = stroke.width * s;
    graphics.lineStyle(width, colours.ink, alpha);
    graphics.strokePoints(pts, stroke.closed, stroke.closed);
    graphics.fillStyle(colours.ink, alpha);
    // Round joins and caps: a dot of the line's width on every vertex.
    for (const p of pts) {
      graphics.fillCircle(p.x, p.y, width / 2);
    }
  }
  graphics.fillStyle(colours.spark, alpha);
  for (const [cx, cy, r] of glyph.sparks) {
    graphics.fillPoints(resolveSparkPoints(cx, cy, r + (BUTTON_ICON_SPARK_STROKE_UNITS / 2)).map(map), true, true);
  }
  for (const [cx, cy, r] of glyph.dots) {
    const c = map({ x: cx, y: cy });
    graphics.fillCircle(c.x, c.y, r * s);
  }
};

/**
 * Star Dust dressing of the menu toggle (the three-line button that turns into an X). The morph itself (line
 * positions, timing, tap behaviour) is NOT here; it stays in legacyMenuDropdown.ts. This only says how its strokes
 * and dust look at a given progress: each line carries a spark ahead of its left end that rides with the line and
 * fades out as the lines cross, and the X gains C's centre dust dot as it forms.
 */
export interface MenuToggleDust {
  /** C line weight for a toggle frame of `size` css px (2 C units; see resolveMenuToggleDust for the unit). */
  readonly lineWidth: number;
  readonly sparkRadius: number;
  /** Distance from a line's left end to its spark centre, along the line. */
  readonly sparkLead: number;
  readonly dotRadius: number;
  /** Pressed ring radius (the soft cyan ring of C's pressed state). */
  readonly ringRadius: number;
}

/** C draws a standalone button glyph on 0.68 of the button box. */
export const BUTTON_ICON_BUTTON_BOX_RATIO = 0.68;
/** C's menu glyph puts its three lines 5 units apart (y 7, 12, 17). */
const MENU_LINE_PITCH_UNITS = 5;

/**
 * The toggle keeps the legacy line pitch (resolveLegacyMenuBurgerMetrics().gap), so one C unit is measured from that
 * pitch: the dust then sits on the lines in C's proportions whatever the frame size.
 */
export const resolveMenuToggleDust = (size: number): MenuToggleDust => {
  const unit = resolveLegacyMenuBurgerMetrics(size).gap / MENU_LINE_PITCH_UNITS;
  const menu = BUTTON_ICON_SOURCES.menu;
  const spark = menu.sparks[0]!;
  return {
    dotRadius: BUTTON_ICON_SOURCES.menuOpen.dots[0]![2] * unit,
    lineWidth: Math.max(1.5, Math.round(BUTTON_ICON_STROKE_UNITS * unit * 10) / 10),
    ringRadius: (size / 2) - 1,
    // menu's lines start at x 9; its sparks sit at x 4.8.
    sparkLead: (9 - spark[0]) * unit,
    sparkRadius: (spark[2] + (BUTTON_ICON_SPARK_STROKE_UNITS / 2)) * unit
  };
};
