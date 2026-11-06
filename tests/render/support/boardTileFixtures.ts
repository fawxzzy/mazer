import type {
  BoardTileBakeInput,
  BoardTileDock,
  TileBakeContext2D,
  TileBakeSurfaceFactory
} from '../../../src/render/boardTileBake';

/** Recording stand-in for a 2D context: logs every call and property write, draws nothing. */
export interface RecordingContext {
  ctx: TileBakeContext2D;
  log: string[];
  /** lineWidth in effect at each stroke() call. */
  strokeWidths: number[];
  count(prefix: string): number;
}

const METHODS = [
  'save', 'restore', 'setTransform', 'clearRect', 'beginPath', 'closePath', 'moveTo', 'lineTo',
  'arcTo', 'arc', 'rect', 'fill', 'stroke', 'fillRect'
] as const;

export const createRecordingContext = (): RecordingContext => {
  const log: string[] = [];
  const strokeWidths: number[] = [];
  const props: Record<string, unknown> = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    globalAlpha: 1, shadowBlur: 0, shadowColor: ''
  };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, name: string) {
      if ((METHODS as readonly string[]).includes(name)) {
        return (...args: unknown[]) => {
          if (name === 'stroke') strokeWidths.push(props.lineWidth as number);
          log.push(`${name}(${args.join(',')})`);
        };
      }
      return props[name];
    },
    set(_t, name: string, value: unknown) {
      props[name] = value;
      log.push(`set ${name}=${String(value)}`);
      return true;
    }
  }) as unknown as TileBakeContext2D;
  return {
    ctx,
    log,
    strokeWidths,
    count: (prefix) => log.filter((entry) => entry.startsWith(prefix)).length
  };
};

export interface RecordingSurface {
  rec: RecordingContext;
  factory: TileBakeSurfaceFactory<{ w: number; h: number }>;
  calls: Array<[number, number]>;
}

export const createRecordingSurface = (): RecordingSurface => {
  const rec = createRecordingContext();
  const calls: Array<[number, number]> = [];
  return {
    rec,
    calls,
    factory: (w, h) => {
      calls.push([w, h]);
      return { canvas: { w, h }, ctx: rec.ctx };
    }
  };
};

export const PAINT_PREFIXES = ['fill(', 'stroke(', 'fillRect(', 'clearRect('] as const;

export const countPaintOps = (rec: RecordingContext): number => (
  PAINT_PREFIXES.reduce((sum, prefix) => sum + rec.count(prefix), 0)
);

/* ----- deterministic fixtures ----- */

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const emptyGrid = (w: number, h: number): boolean[][] => (
  Array.from({ length: h }, () => Array.from({ length: w }, () => false))
);

/** 25x51 single corridor down column 12 (the level-1 shape). */
export const corridorGrid = (): boolean[][] => {
  const g = emptyGrid(25, 51);
  for (let y = 0; y < 51; y += 1) g[y]![12] = true;
  return g;
};

/** Recursive-backtracker maze plus braided loops, mirroring the prototype's 25x51 starter board. */
export const braidedMazeGrid = (cw = 12, ch = 25, seed = 20261105, braid = 16): boolean[][] => {
  const W = cw * 2 + 1;
  const H = ch * 2 + 1;
  const g = emptyGrid(W, H);
  const R = rng(seed);
  const visited = new Uint8Array(cw * ch);
  const stack: Array<[number, number]> = [[0, 0]];
  visited[0] = 1;
  g[1]![1] = true;
  while (stack.length > 0) {
    const [cx, cy] = stack[stack.length - 1]!;
    const options: Array<[number, number, number, number]> = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && !visited[ny * cw + nx]) options.push([dx, dy, nx, ny]);
    }
    if (options.length === 0) { stack.pop(); continue; }
    const o = options[Math.floor(R() * options.length)]!;
    visited[o[3] * cw + o[2]] = 1;
    g[2 * o[3] + 1]![2 * o[2] + 1] = true;
    g[2 * cy + 1 + o[1]]![2 * cx + 1 + o[0]] = true;
    stack.push([o[2], o[3]]);
  }
  let k = braid;
  let tries = 0;
  const floor = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && g[y]![x] === true;
  while (k > 0 && tries < 4000) {
    tries += 1;
    const x = 1 + Math.floor(R() * (W - 2));
    const y = 1 + Math.floor(R() * (H - 2));
    if (g[y]![x]) continue;
    if ((x % 2 === 0) !== (y % 2 === 0)) {
      const pair = x % 2 === 0 ? [[x - 1, y], [x + 1, y]] : [[x, y - 1], [x, y + 1]];
      if (floor(pair[0]![0]!, pair[0]![1]!) && floor(pair[1]![0]!, pair[1]![1]!)) { g[y]![x] = true; k -= 1; }
    }
  }
  return g;
};

export const inputFor = (
  grid: boolean[][],
  extra: Partial<BoardTileBakeInput> = {}
): BoardTileBakeInput => ({
  grid,
  width: grid[0]!.length,
  height: grid.length,
  tileSize: 14,
  devicePixelRatio: 2,
  start: { x: 1, y: 1 },
  goal: { x: 1, y: 1 },
  ...extra
});

/** Opens one dock per side on a maze by carving the boundary cell next to a floor cell. */
export const wrapDockMaze = (): { grid: boolean[][]; docks: BoardTileDock[] } => {
  const grid = braidedMazeGrid(12, 25, 77, 10);
  const H = grid.length;
  const W = grid[0]!.length;
  const docks: BoardTileDock[] = [];
  const carve = (x: number, y: number, side: BoardTileDock['side']) => { grid[y]![x] = true; docks.push({ x, y, side }); };
  const pick = (cands: Array<[number, number]>) => cands[Math.floor(cands.length / 2)]!;
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let y = 1; y < H - 1; y += 2) {
    if (grid[y]![1]) left.push([0, y]);
    if (grid[y]![W - 2]) right.push([W - 1, y]);
  }
  const top: Array<[number, number]> = [];
  const bottom: Array<[number, number]> = [];
  for (let x = 1; x < W - 1; x += 2) {
    if (grid[1]![x]) top.push([x, 0]);
    if (grid[H - 2]![x]) bottom.push([x, H - 1]);
  }
  const l = pick(left); carve(l[0], l[1], 'left');
  const r = pick(right); carve(r[0], r[1], 'right');
  const t = pick(top); carve(t[0], t[1], 'top');
  const b = pick(bottom); carve(b[0], b[1], 'bottom');
  return { grid, docks };
};

/* ----- WCAG 2.x relative luminance / contrast (independent of src) ----- */

const lin = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export const luminance = (rgb: number): number => (
  0.2126 * lin((rgb >> 16) & 255) + 0.7152 * lin((rgb >> 8) & 255) + 0.0722 * lin(rgb & 255)
);

export const contrast = (a: number, b: number): number => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
