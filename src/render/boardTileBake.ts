/**
 * Baked board tile renderer (DRAFT, pure drawing module, not wired into any scene).
 *
 * `bakeBoardTiles(input, factory)` paints the whole static board layer -- floor, rim, dead-end
 * details, wall sockets and bleed/wrap docks -- ONCE into an offscreen surface created by
 * the injected `factory`. The scene then blits that one canvas; nothing here runs per frame and no
 * gradient is created per tile. Two styles share the same layout analysis:
 *
 *   - 'chip'  (default): per-tile rounded chips merged into continuous ribbons, one thin lit edge.
 *   - 'trace' (alternate): one stroked circuit trace in a dark channel with three soft glow passes.
 *
 * Marker helpers (`drawBoardMarkers`, `drawStartMarker`, ...) draw the small dynamic overlay (start,
 * goal, player) for the same two styles. `slotBlocker` / `slotGate` / `slotPatrol` are RESERVED
 * hazard-grammar slots: they return geometry and draw nothing.
 *
 * Determinism: no Math.random, no Date.now. Identical input produces an identical draw-call list and
 * an identical hash. Colours and ratios come from ./boardTileStyle (registry-derived).
 */
import {
  BOARD_TILE_GEOMETRY,
  DEFAULT_BOARD_TILE_STYLE,
  resolveGoalEffectiveTile,
  clampBoardDevicePixelRatio,
  cssRgb,
  cssRgba,
  resolveBoardTileStyle,
  resolveBoardTileStyleId,
  type BoardTileStyleId,
  type ResolvedBoardTileStyle
} from './boardTileStyle';
import {
  resolveEndpointTile,
  resolveIsolatedEndpointRect,
  type EndpointKind,
  type EndpointTileRect,
  type EndpointTileSpec
} from './endpointTiles';

/**
 * Part of every bake hash: bump it whenever the baked pixels change. v2: the bright junction nodes are gone
 * (split tiles are plain chips with the same faint pad dot as every other tile).
 */
export const BOARD_TILE_BAKE_VERSION = 'mazer-board-tile-bake-v2' as const;

/* ------------------------------------------------------------------------------------------ */
/* injected 2D surface contract                                                               */
/* ------------------------------------------------------------------------------------------ */

/** The subset of CanvasRenderingContext2D this module uses. Gradients are deliberately absent. */
export interface TileBakeContext2D {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'round' | 'bevel' | 'miter';
  globalAlpha: number;
  shadowBlur: number;
  shadowColor: string;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  rect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export interface TileBakeSurface<TCanvas = unknown> {
  canvas: TCanvas;
  ctx: TileBakeContext2D;
}

/** Creates a device-pixel-sized offscreen surface (e.g. a document canvas, an OffscreenCanvas, or a test fake). */
export type TileBakeSurfaceFactory<TCanvas = unknown> = (
  pixelWidth: number,
  pixelHeight: number
) => TileBakeSurface<TCanvas>;

/* ------------------------------------------------------------------------------------------ */
/* input                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export type BoardDockSide = 'left' | 'right' | 'top' | 'bottom';

export interface BoardCell {
  x: number;
  y: number;
}

/**
 * A wrap/bleed dock: the floor cell (x, y) must lie on the board edge named by `side`; the dock
 * extends outward from that edge by `lengthPx` CSS px (default: dockDefaultLengthTiles tiles).
 * Descriptors that do not satisfy that are ignored (deterministically) rather than thrown on.
 */
export interface BoardTileDock {
  x: number;
  y: number;
  side: BoardDockSide;
  lengthPx?: number;
}

export interface BoardTileBakeInput {
  /** grid[y][x] === true is a floor (path) tile. */
  grid: ReadonlyArray<ReadonlyArray<boolean>>;
  width: number;
  height: number;
  /** Tile edge in CSS px. */
  tileSize: number;
  devicePixelRatio: number;
  style?: BoardTileStyleId;
  docks?: readonly BoardTileDock[];
  start?: BoardCell;
  goal?: BoardCell;
  /**
   * Accepted for API symmetry. The bake is static, so reduced motion is a no-op here: it changes
   * neither the draw list nor the hash. (Marker phase is gated by it in drawBoardMarkers.)
   */
  reducedMotion?: boolean;
}

export interface BoardTileBakeStats {
  /** fill / stroke / fillRect calls: the number of actual raster operations. */
  paintOps: number;
  /** beginPath / moveTo / lineTo / arc / arcTo / rect / closePath calls: cheap path construction. */
  pathOps: number;
  /** style/state assignments and save/restore/transform calls. */
  stateOps: number;
  floorTiles: number;
  sockets: number;
  docks: number;
}

export interface BoardTileBakeResult<TCanvas = unknown> {
  canvas: TCanvas;
  /** CSS-px size of the whole baked surface (board plus margins). */
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  /** Backing scale actually used (the clamped devicePixelRatio). */
  scale: number;
  /** CSS-px position of board cell (0,0)'s top-left corner inside the baked surface. */
  originX: number;
  originY: number;
  boardWidth: number;
  boardHeight: number;
  style: BoardTileStyleId;
  hash: string;
  stats: BoardTileBakeStats;
}

/* ------------------------------------------------------------------------------------------ */
/* normalisation, hashing                                                                     */
/* ------------------------------------------------------------------------------------------ */

interface NormalizedInput {
  grid: ReadonlyArray<ReadonlyArray<boolean>>;
  cols: number;
  rows: number;
  tileSize: number;
  scale: number;
  style: BoardTileStyleId;
  docks: readonly BoardTileDock[];
  start: BoardCell | null;
  goal: BoardCell | null;
}

const normalizeInput = (input: BoardTileBakeInput): NormalizedInput => {
  const rows = input.grid.length;
  const cols = rows > 0 ? (input.grid[0]?.length ?? 0) : 0;
  if (input.width !== cols || input.height !== rows) {
    throw new RangeError(
      `board tile bake: grid is ${cols}x${rows} but input declares ${input.width}x${input.height}`
    );
  }
  for (const row of input.grid) {
    if (row.length !== cols) {
      throw new RangeError('board tile bake: grid rows must all have the same length');
    }
  }
  if (!Number.isFinite(input.tileSize) || input.tileSize <= 0) {
    throw new RangeError('board tile bake: tileSize must be a positive finite number');
  }
  return {
    grid: input.grid,
    cols,
    rows,
    tileSize: input.tileSize,
    scale: clampBoardDevicePixelRatio(input.devicePixelRatio),
    style: resolveBoardTileStyleId(input.style ?? DEFAULT_BOARD_TILE_STYLE),
    docks: input.docks ?? [],
    start: input.start ?? null,
    goal: input.goal ?? null
  };
};

/** cyrb53: small, stable, dependency-free 53-bit string hash. */
const hashString = (text: string): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, '0');
};

const gridSignature = (grid: ReadonlyArray<ReadonlyArray<boolean>>): string => grid
  .map((row) => {
    let out = '';
    for (let i = 0; i < row.length; i += 4) {
      let nibble = 0;
      for (let b = 0; b < 4; b += 1) {
        nibble = (nibble << 1) | (row[i + b] ? 1 : 0);
      }
      out += nibble.toString(16);
    }
    return out;
  })
  .join('/');

const cellSignature = (cell: BoardCell | null): string => (cell ? `${cell.x},${cell.y}` : '-');

const dockSignature = (docks: readonly BoardTileDock[]): string => [...docks]
  .map((d) => `${d.side}:${d.x},${d.y},${d.lengthPx ?? 'd'}`)
  .sort()
  .join(';');

/**
 * Stable hash of everything that changes the baked pixels: version, style, tile size, DPR, grid,
 * docks, start/goal. reducedMotion is deliberately excluded (the bake is static).
 */
export const computeBoardTileBakeHash = (input: BoardTileBakeInput): string => {
  const n = normalizeInput(input);
  return hashString([
    BOARD_TILE_BAKE_VERSION,
    n.style,
    `t=${n.tileSize}`,
    `s=${n.scale}`,
    `${n.cols}x${n.rows}`,
    gridSignature(n.grid),
    dockSignature(n.docks),
    cellSignature(n.start),
    cellSignature(n.goal)
  ].join('|'));
};

/* ------------------------------------------------------------------------------------------ */
/* layout + tile analysis (pure geometry, exported for tests)                                 */
/* ------------------------------------------------------------------------------------------ */

export interface ResolvedBoardDock {
  x: number;
  y: number;
  side: BoardDockSide;
  /** Outward length in CSS px. */
  length: number;
}

export interface BoardTileLayout {
  cols: number;
  rows: number;
  tileSize: number;
  scale: number;
  /** Device-snapped vertical grid line positions (cols + 1 entries), board-local CSS px. */
  xs: readonly number[];
  /** Device-snapped horizontal grid line positions (rows + 1 entries), board-local CSS px. */
  ys: readonly number[];
  boardWidth: number;
  boardHeight: number;
  margin: { left: number; right: number; top: number; bottom: number };
  originX: number;
  originY: number;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  docks: readonly ResolvedBoardDock[];
}

const isFloor = (grid: ReadonlyArray<ReadonlyArray<boolean>>, x: number, y: number): boolean => (
  y >= 0 && y < grid.length && x >= 0 && x < (grid[y]?.length ?? 0) && grid[y]![x] === true
);

const ceilToDevice = (value: number, scale: number): number => Math.ceil(value * scale - 1e-9) / scale;

const resolveDocks = (n: NormalizedInput, defaultLength: number): ResolvedBoardDock[] => {
  const seen = new Set<string>();
  const out: ResolvedBoardDock[] = [];
  for (const dock of n.docks) {
    const onEdge = (dock.side === 'left' && dock.x === 0)
      || (dock.side === 'right' && dock.x === n.cols - 1)
      || (dock.side === 'top' && dock.y === 0)
      || (dock.side === 'bottom' && dock.y === n.rows - 1);
    const key = `${dock.side}:${dock.x},${dock.y}`;
    if (!onEdge || !isFloor(n.grid, dock.x, dock.y) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const length = typeof dock.lengthPx === 'number' && Number.isFinite(dock.lengthPx) && dock.lengthPx > 0
      ? dock.lengthPx
      : defaultLength;
    out.push({ x: dock.x, y: dock.y, side: dock.side, length });
  }
  return out.sort((a, b) => (a.side < b.side ? -1 : a.side > b.side ? 1 : a.y - b.y || a.x - b.x));
};

const buildLayout = (n: NormalizedInput, style: ResolvedBoardTileStyle): BoardTileLayout => {
  const { scale, tileSize } = n;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= n.cols; i += 1) {
    xs.push(Math.round(i * tileSize * scale) / scale);
  }
  for (let i = 0; i <= n.rows; i += 1) {
    ys.push(Math.round(i * tileSize * scale) / scale);
  }
  const boardWidth = xs[n.cols] ?? 0;
  const boardHeight = ys[n.rows] ?? 0;
  const docks = resolveDocks(n, style.dock.defaultLength);
  const pad = ceilToDevice(BOARD_TILE_GEOMETRY.bakeEdgePadCss, scale);
  const margin = { left: pad, right: pad, top: pad, bottom: pad };
  for (const dock of docks) {
    const need = ceilToDevice(dock.length, scale);
    margin[dock.side] = Math.max(margin[dock.side], need);
  }
  // The origin margins are whole css px so the layer can place the image on a whole css px (Phaser floors an
  // Image's position under roundPixels; src/render/pixelAlignment.ts) without moving the board inside it.
  margin.left = Math.ceil(margin.left - 1e-9);
  margin.top = Math.ceil(margin.top - 1e-9);
  const width = margin.left + boardWidth + margin.right;
  const height = margin.top + boardHeight + margin.bottom;
  return {
    cols: n.cols,
    rows: n.rows,
    tileSize,
    scale,
    xs,
    ys,
    boardWidth,
    boardHeight,
    margin,
    originX: margin.left,
    originY: margin.top,
    width,
    height,
    pixelWidth: Math.round(width * scale),
    pixelHeight: Math.round(height * scale),
    docks
  };
};

export type BoardTileKind = 'isolated' | 'cap' | 'straight' | 'corner' | 'junction' | 'cross';

export interface BoardTileOpen {
  u: boolean;
  d: boolean;
  l: boolean;
  r: boolean;
}

export interface BoardTileInfo {
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
  open: BoardTileOpen;
  degree: number;
  kind: BoardTileKind;
}

const kindOf = (open: BoardTileOpen, degree: number): BoardTileKind => {
  if (degree === 0) return 'isolated';
  if (degree === 1) return 'cap';
  if (degree === 4) return 'cross';
  if (degree === 3) return 'junction';
  return (open.u && open.d) || (open.l && open.r) ? 'straight' : 'corner';
};

const analyzeTileAt = (n: NormalizedInput, layout: BoardTileLayout, x: number, y: number): BoardTileInfo | null => {
  if (!isFloor(n.grid, x, y)) {
    return null;
  }
  const dockOpen = (side: BoardDockSide): boolean => layout.docks.some(
    (d) => d.x === x && d.y === y && d.side === side
  );
  const open: BoardTileOpen = {
    u: isFloor(n.grid, x, y - 1) || dockOpen('top'),
    d: isFloor(n.grid, x, y + 1) || dockOpen('bottom'),
    l: isFloor(n.grid, x - 1, y) || dockOpen('left'),
    r: isFloor(n.grid, x + 1, y) || dockOpen('right')
  };
  const degree = (open.u ? 1 : 0) + (open.d ? 1 : 0) + (open.l ? 1 : 0) + (open.r ? 1 : 0);
  const left = layout.xs[x]!;
  const top = layout.ys[y]!;
  return {
    x,
    y,
    left,
    top,
    width: layout.xs[x + 1]! - left,
    height: layout.ys[y + 1]! - top,
    open,
    degree,
    kind: kindOf(open, degree)
  };
};

const analyzeTiles = (n: NormalizedInput, layout: BoardTileLayout): BoardTileInfo[] => {
  const tiles: BoardTileInfo[] = [];
  for (let y = 0; y < n.rows; y += 1) {
    for (let x = 0; x < n.cols; x += 1) {
      const tile = analyzeTileAt(n, layout, x, y);
      if (tile) {
        tiles.push(tile);
      }
    }
  }
  return tiles;
};

export type CornerRadii = [number, number, number, number];

export interface ChipTileGeometry extends BoardTileInfo {
  /** Outer (rim-coloured) radii, order: top-left, top-right, bottom-right, bottom-left. */
  radii: CornerRadii;
  /** Inner chip fill rect: inset by the rim width on closed sides only, so joins stay seamless. */
  fill: { left: number; top: number; width: number; height: number };
  fillRadii: CornerRadii;
  /** Concave corners (both neighbours open, diagonal wall) that need a rim patch to stay continuous. */
  concave: { tl: boolean; tr: boolean; br: boolean; bl: boolean };
}

/** Pure chip geometry for every floor tile. This is what the seam-free test inspects. */
export const computeChipGeometry = (
  input: BoardTileBakeInput,
  style?: ResolvedBoardTileStyle
): ChipTileGeometry[] => {
  const n = normalizeInput(input);
  const resolved = style ?? resolveBoardTileStyle('chip', n.tileSize, n.scale);
  const layout = buildLayout(n, resolved);
  return analyzeTiles(n, layout).map((tile) => chipGeometryOf(n, tile, resolved));
};

const chipGeometryOf = (
  n: NormalizedInput,
  tile: BoardTileInfo,
  style: ResolvedBoardTileStyle
): ChipTileGeometry => {
  const { open } = tile;
  const rim = style.rimWidth;
  const round = tile.degree <= 1 ? style.capRadius : style.cornerRadius;
  const radii: CornerRadii = [
    !open.u && !open.l ? round : 0,
    !open.u && !open.r ? round : 0,
    !open.d && !open.r ? round : 0,
    !open.d && !open.l ? round : 0
  ];
  const insetL = open.l ? 0 : rim;
  const insetR = open.r ? 0 : rim;
  const insetU = open.u ? 0 : rim;
  const insetD = open.d ? 0 : rim;
  const fill = {
    left: tile.left + insetL,
    top: tile.top + insetU,
    width: Math.max(0, tile.width - insetL - insetR),
    height: Math.max(0, tile.height - insetU - insetD)
  };
  const fillRadii = radii.map((r) => Math.max(0, r - rim)) as CornerRadii;
  const { x, y } = tile;
  return {
    ...tile,
    radii,
    fill,
    fillRadii,
    concave: {
      tl: open.u && open.l && !isFloor(n.grid, x - 1, y - 1),
      tr: open.u && open.r && !isFloor(n.grid, x + 1, y - 1),
      br: open.d && open.r && !isFloor(n.grid, x + 1, y + 1),
      bl: open.d && open.l && !isFloor(n.grid, x - 1, y + 1)
    }
  };
};

/**
 * Chip geometry of ONE floor cell, in board-local css px (the same numbers `computeChipGeometry` returns for
 * that cell, from the same device-snapped layout), or null when the cell is not floor. The scene asks for the
 * start and goal tiles only, after a rebake, so the end tiles can be painted on the baked tile's own edges.
 */
export const computeChipTileAt = (
  input: BoardTileBakeInput,
  cell: BoardCell,
  style?: ResolvedBoardTileStyle
): ChipTileGeometry | null => {
  const n = normalizeInput(input);
  const resolved = style ?? resolveBoardTileStyle('chip', n.tileSize, n.scale);
  const layout = buildLayout(n, resolved);
  const tile = analyzeTileAt(n, layout, cell.x, cell.y);
  return tile ? chipGeometryOf(n, tile, resolved) : null;
};

/** Cheap, capped set of wall cells within one cell of the path that get a faint socket dot. */
export const computeWallSockets = (input: BoardTileBakeInput): BoardCell[] => {
  const n = normalizeInput(input);
  if (n.tileSize < BOARD_TILE_GEOMETRY.socketMinTileCss) {
    return [];
  }
  const candidates: BoardCell[] = [];
  for (let y = 0; y < n.rows; y += 1) {
    for (let x = 0; x < n.cols; x += 1) {
      if (isFloor(n.grid, x, y)) {
        continue;
      }
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if ((dx !== 0 || dy !== 0) && isFloor(n.grid, x + dx, y + dy)) {
            near = true;
            break;
          }
        }
      }
      if (near) {
        candidates.push({ x, y });
      }
    }
  }
  const cap = BOARD_TILE_GEOMETRY.socketCap;
  if (candidates.length <= cap) {
    return candidates;
  }
  const picked: BoardCell[] = [];
  for (let i = 0; i < cap; i += 1) {
    picked.push(candidates[Math.floor((i * candidates.length) / cap)]!);
  }
  return picked;
};

/* ------------------------------------------------------------------------------------------ */
/* painter: thin counted wrapper over the injected context                                    */
/* ------------------------------------------------------------------------------------------ */

export interface PainterStats {
  paintOps: number;
  pathOps: number;
  stateOps: number;
}

class Painter {
  readonly stats: PainterStats = { paintOps: 0, pathOps: 0, stateOps: 0 };

  constructor(readonly ctx: TileBakeContext2D) {}

  fillStyle(value: string): void { this.ctx.fillStyle = value; this.stats.stateOps += 1; }
  strokeStyle(value: string): void { this.ctx.strokeStyle = value; this.stats.stateOps += 1; }
  lineWidth(value: number): void { this.ctx.lineWidth = value; this.stats.stateOps += 1; }
  alpha(value: number): void { this.ctx.globalAlpha = value; this.stats.stateOps += 1; }
  caps(cap: 'butt' | 'round' | 'square', join: 'round' | 'bevel' | 'miter'): void {
    this.ctx.lineCap = cap;
    this.ctx.lineJoin = join;
    this.stats.stateOps += 2;
  }
  shadow(color: string, blur: number): void {
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = blur;
    this.stats.stateOps += 2;
  }
  save(): void { this.ctx.save(); this.stats.stateOps += 1; }
  restore(): void { this.ctx.restore(); this.stats.stateOps += 1; }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ctx.setTransform(a, b, c, d, e, f);
    this.stats.stateOps += 1;
  }
  clear(w: number, h: number): void { this.ctx.clearRect(0, 0, w, h); this.stats.paintOps += 1; }

  begin(): void { this.ctx.beginPath(); this.stats.pathOps += 1; }
  close(): void { this.ctx.closePath(); this.stats.pathOps += 1; }
  move(x: number, y: number): void { this.ctx.moveTo(x, y); this.stats.pathOps += 1; }
  line(x: number, y: number): void { this.ctx.lineTo(x, y); this.stats.pathOps += 1; }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void {
    this.ctx.arcTo(x1, y1, x2, y2, r);
    this.stats.pathOps += 1;
  }
  rect(x: number, y: number, w: number, h: number): void { this.ctx.rect(x, y, w, h); this.stats.pathOps += 1; }
  circle(cx: number, cy: number, r: number): void {
    this.ctx.moveTo(cx + r, cy);
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    this.stats.pathOps += 2;
  }
  fill(): void { this.ctx.fill(); this.stats.paintOps += 1; }
  stroke(): void { this.ctx.stroke(); this.stats.paintOps += 1; }

  /** Clockwise rounded rect (same winding as rect()), radii clamped to half the short side. */
  roundedRect(x: number, y: number, w: number, h: number, radii: CornerRadii): void {
    if (w <= 0 || h <= 0) {
      return;
    }
    if (radii[0] <= 0 && radii[1] <= 0 && radii[2] <= 0 && radii[3] <= 0) {
      this.rect(x, y, w, h);
      return;
    }
    const m = Math.min(w, h) / 2;
    const tl = Math.min(radii[0], m);
    const tr = Math.min(radii[1], m);
    const br = Math.min(radii[2], m);
    const bl = Math.min(radii[3], m);
    this.move(x + tl, y);
    this.line(x + w - tr, y);
    if (tr > 0) this.arcTo(x + w, y, x + w, y + tr, tr);
    this.line(x + w, y + h - br);
    if (br > 0) this.arcTo(x + w, y + h, x + w - br, y + h, br);
    this.line(x + bl, y + h);
    if (bl > 0) this.arcTo(x, y + h, x, y + h - bl, bl);
    this.line(x, y + tl);
    if (tl > 0) this.arcTo(x, y, x + tl, y, tl);
    this.close();
  }

  uniformRoundedRect(x: number, y: number, w: number, h: number, r: number): void {
    this.roundedRect(x, y, w, h, [r, r, r, r]);
  }
}

const sameCell = (a: BoardCell | null, x: number, y: number): boolean => a !== null && a.x === x && a.y === y;

/* ------------------------------------------------------------------------------------------ */
/* bake                                                                                       */
/* ------------------------------------------------------------------------------------------ */

const OUT: Record<BoardDockSide, readonly [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  top: [0, -1],
  bottom: [0, 1]
};

const dockSliceRect = (
  layout: BoardTileLayout,
  dock: ResolvedBoardDock,
  offset: number,
  length: number
): { x: number; y: number; w: number; h: number } => {
  const cellLeft = layout.xs[dock.x]!;
  const cellTop = layout.ys[dock.y]!;
  const cellW = layout.xs[dock.x + 1]! - cellLeft;
  const cellH = layout.ys[dock.y + 1]! - cellTop;
  switch (dock.side) {
    case 'left': return { x: -offset - length, y: cellTop, w: length, h: cellH };
    case 'right': return { x: layout.boardWidth + offset, y: cellTop, w: length, h: cellH };
    case 'top': return { x: cellLeft, y: -offset - length, w: cellW, h: length };
    default: return { x: cellLeft, y: layout.boardHeight + offset, w: cellW, h: length };
  }
};

const dockLintelRect = (
  layout: BoardTileLayout,
  dock: ResolvedBoardDock,
  thickness: number
): { x: number; y: number; w: number; h: number } => {
  const s = dockSliceRect(layout, dock, 0, thickness);
  // dockSliceRect(offset 0) is flush with the board edge on the outside: exactly the lintel footprint.
  return s;
};

const paintSockets = (p: Painter, sockets: readonly BoardCell[], layout: BoardTileLayout, style: ResolvedBoardTileStyle): void => {
  if (sockets.length === 0) {
    return;
  }
  const alpha = style.style === 'trace' ? BOARD_TILE_GEOMETRY.socketAlphaTrace : BOARD_TILE_GEOMETRY.socketAlphaChip;
  p.fillStyle(cssRgba(style.material.socket, alpha));
  p.begin();
  for (const cell of sockets) {
    p.circle(
      (layout.xs[cell.x]! + layout.xs[cell.x + 1]!) / 2,
      (layout.ys[cell.y]! + layout.ys[cell.y + 1]!) / 2,
      style.socketRadius
    );
  }
  p.fill();
};

const paintChipFloor = (
  p: Painter,
  n: NormalizedInput,
  style: ResolvedBoardTileStyle,
  tiles: readonly ChipTileGeometry[]
): void => {
  const m = style.material;
  if (tiles.length === 0) {
    return;
  }
  // pass 1: rim colour union with one small glow
  p.save();
  p.shadow(cssRgba(m.rim, 0.5), style.rimGlowBlurDevicePx);
  p.fillStyle(cssRgb(m.rim));
  p.begin();
  for (const t of tiles) {
    p.roundedRect(t.left, t.top, t.width, t.height, t.radii);
  }
  p.fill();
  p.restore();

  // pass 2: chip fill union, inset only on exposed sides (joins abut exactly: no seam)
  p.fillStyle(cssRgb(m.chip));
  p.begin();
  for (const t of tiles) {
    p.roundedRect(t.fill.left, t.fill.top, t.fill.width, t.fill.height, t.fillRadii);
  }
  p.fill();

  // pass 3: concave rim patches
  const rim = style.rimWidth;
  let patchOpen = false;
  for (const t of tiles) {
    const right = t.left + t.width - rim;
    const bottom = t.top + t.height - rim;
    const patches: Array<[boolean, number, number]> = [
      [t.concave.tl, t.left, t.top],
      [t.concave.tr, right, t.top],
      [t.concave.br, right, bottom],
      [t.concave.bl, t.left, bottom]
    ];
    for (const [on, px, py] of patches) {
      if (!on) continue;
      if (!patchOpen) {
        p.fillStyle(cssRgb(m.rim));
        p.begin();
        patchOpen = true;
      }
      p.rect(px, py, rim, rim);
    }
  }
  if (patchOpen) {
    p.fill();
  }

  // pass 4: one faint pad dot per floor tile, the same on every tile (junctions included: there is no
  // separate split-path marker), skipped only under the start/goal end tiles
  let dotOpen = false;
  for (const t of tiles) {
    if (sameCell(n.start, t.x, t.y) || sameCell(n.goal, t.x, t.y)) {
      continue;
    }
    if (!dotOpen) {
      p.fillStyle(cssRgba(m.rim, BOARD_TILE_GEOMETRY.padDotAlpha));
      p.begin();
      dotOpen = true;
    }
    p.circle(t.left + t.width / 2, t.top + t.height / 2, style.padDotRadius);
  }
  if (dotOpen) {
    p.fill();
  }
};

const paintChipDocks = (
  p: Painter,
  layout: BoardTileLayout,
  style: ResolvedBoardTileStyle
): void => {
  const m = style.material;
  const { dock: spec } = style;
  const rim = style.rimWidth;
  for (const dock of layout.docks) {
    let pos = 0;
    let i = 0;
    while (pos < dock.length - 2 && i < spec.sliceCount) {
      const len = Math.min(spec.sliceLength, dock.length - pos);
      if (len < 3) {
        break;
      }
      const r = dockSliceRect(layout, dock, pos, len);
      p.alpha(spec.alphas[i] ?? spec.alphas[spec.alphas.length - 1]!);
      p.fillStyle(cssRgb(m.rim));
      p.begin();
      p.uniformRoundedRect(r.x, r.y, r.w, r.h, spec.sliceRadius);
      p.fill();
      p.fillStyle(cssRgb(m.chip));
      p.begin();
      p.uniformRoundedRect(r.x + rim, r.y + rim, r.w - 2 * rim, r.h - 2 * rim, Math.max(0, spec.sliceRadius - rim));
      p.fill();
      pos += len + spec.gap;
      i += 1;
    }
    p.alpha(1);
    const l = dockLintelRect(layout, dock, spec.lintel);
    p.fillStyle(cssRgb(m.rim));
    p.ctx.fillRect(l.x, l.y, l.w, l.h);
    p.stats.paintOps += 1;
  }
};

const paintTraceFloor = (
  p: Painter,
  n: NormalizedInput,
  layout: BoardTileLayout,
  style: ResolvedBoardTileStyle,
  tiles: readonly BoardTileInfo[]
): void => {
  if (tiles.length === 0) {
    return;
  }
  const m = style.material;
  const t = style.trace;
  const centerX = (tile: BoardTileInfo): number => tile.left + tile.width / 2;
  const centerY = (tile: BoardTileInfo): number => tile.top + tile.height / 2;
  const byKey = new Map<string, BoardTileInfo>();
  for (const tile of tiles) {
    byKey.set(`${tile.x},${tile.y}`, tile);
  }
  const eps = 0.01;

  const graphPath = (withDocks: boolean): void => {
    p.begin();
    for (const tile of tiles) {
      const cx = centerX(tile);
      const cy = centerY(tile);
      const right = byKey.get(`${tile.x + 1},${tile.y}`);
      const down = byKey.get(`${tile.x},${tile.y + 1}`);
      if (right) { p.move(cx, cy); p.line(centerX(right), centerY(right)); }
      if (down) { p.move(cx, cy); p.line(centerX(down), centerY(down)); }
      if (tile.degree === 0) { p.move(cx, cy); p.line(cx + eps, cy); }
    }
    if (withDocks) {
      for (const dock of layout.docks) {
        const tile = byKey.get(`${dock.x},${dock.y}`);
        if (!tile) continue;
        const o = OUT[dock.side];
        p.move(centerX(tile), centerY(tile));
        p.line(centerX(tile) + o[0] * tile.width * 0.5, centerY(tile) + o[1] * tile.height * 0.5);
      }
    }
  };

  p.caps('round', 'round');
  graphPath(true);
  p.strokeStyle(cssRgb(m.channelBorder));
  p.lineWidth(t.channelWidth + 2 * t.channelBorderWidth);
  p.stroke();
  p.strokeStyle(cssRgb(m.channel));
  p.lineWidth(t.channelWidth);
  p.stroke();

  graphPath(false);
  for (const step of t.glowSteps) {
    p.strokeStyle(cssRgba(m.glow, step.alpha));
    p.lineWidth(step.width);
    p.stroke();
  }
  p.strokeStyle(cssRgb(m.traceCore));
  p.lineWidth(t.coreWidth);
  p.stroke();

  const markerCell = (tile: BoardTileInfo): boolean => sameCell(n.start, tile.x, tile.y) || sameCell(n.goal, tile.x, tile.y);
  const junctions = tiles.filter((tile) => tile.degree >= 3 && !markerCell(tile));
  if (junctions.length > 0) {
    p.fillStyle(cssRgb(m.void));
    p.begin();
    for (const tile of junctions) p.circle(centerX(tile), centerY(tile), t.junctionRingRadius);
    p.fill();
    p.strokeStyle(cssRgb(m.rim));
    p.lineWidth(t.junctionRingWidth);
    p.begin();
    for (const tile of junctions) p.circle(centerX(tile), centerY(tile), t.junctionRingRadius);
    p.stroke();
  }
  const caps = tiles.filter((tile) => tile.degree <= 1 && !markerCell(tile));
  if (caps.length > 0) {
    p.fillStyle(cssRgb(m.rim));
    p.begin();
    for (const tile of caps) p.circle(centerX(tile), centerY(tile), t.deadEndPadRadius);
    p.fill();
    p.strokeStyle(cssRgba(m.rim, t.deadEndRingAlpha));
    p.lineWidth(t.deadEndRingWidth);
    p.begin();
    for (const tile of caps) p.circle(centerX(tile), centerY(tile), t.deadEndRingRadius);
    p.stroke();
  }

  for (const dock of layout.docks) {
    const tile = byKey.get(`${dock.x},${dock.y}`);
    if (!tile) continue;
    const o = OUT[dock.side];
    const bx = centerX(tile) + o[0] * tile.width * 0.5;
    const by = centerY(tile) + o[1] * tile.height * 0.5;
    p.strokeStyle(cssRgba(m.rim, 0.85));
    p.lineWidth(t.dockStubWidth);
    p.begin();
    p.move(bx, by);
    p.line(bx + o[0] * t.dockStubLength, by + o[1] * t.dockStubLength);
    p.stroke();
    const spacing = Math.max(t.dockDotSpacing, 1 / layout.scale);
    for (let k = Math.round(t.dockStubLength / spacing) + 1; k * spacing < dock.length - 1; k += 1) {
      const frac = (k * spacing) / dock.length;
      p.fillStyle(cssRgba(m.rim, Math.max(0, 0.85 * (1 - frac))));
      p.begin();
      p.circle(bx + o[0] * k * spacing, by + o[1] * k * spacing, Math.max(1 / layout.scale, t.dockDotRadius * (1 - frac * 0.6)));
      p.fill();
    }
    p.fillStyle(cssRgb(m.void));
    p.strokeStyle(cssRgb(m.rim));
    p.lineWidth(t.junctionRingWidth);
    p.begin();
    p.circle(bx, by, t.dockNodeRadius);
    p.fill();
    p.stroke();
  }
};

export function bakeBoardTiles<TCanvas = unknown>(
  input: BoardTileBakeInput,
  factory: TileBakeSurfaceFactory<TCanvas>
): BoardTileBakeResult<TCanvas> {
  const n = normalizeInput(input);
  const style = resolveBoardTileStyle(n.style, n.tileSize, n.scale);
  const layout = buildLayout(n, style);
  const hash = computeBoardTileBakeHash(input);
  const surface = factory(layout.pixelWidth, layout.pixelHeight);
  const p = new Painter(surface.ctx);

  p.transform(1, 0, 0, 1, 0, 0);
  p.clear(layout.pixelWidth, layout.pixelHeight);
  p.transform(layout.scale, 0, 0, layout.scale, layout.originX * layout.scale, layout.originY * layout.scale);

  const sockets = computeWallSockets(input);
  paintSockets(p, sockets, layout, style);

  const base = analyzeTiles(n, layout);
  if (n.style === 'trace') {
    paintTraceFloor(p, n, layout, style, base);
  } else {
    paintChipFloor(p, n, style, base.map((tile) => chipGeometryOf(n, tile, style)));
    paintChipDocks(p, layout, style);
  }

  p.alpha(1);
  p.transform(1, 0, 0, 1, 0, 0);

  return {
    canvas: surface.canvas,
    width: layout.width,
    height: layout.height,
    pixelWidth: layout.pixelWidth,
    pixelHeight: layout.pixelHeight,
    scale: layout.scale,
    originX: layout.originX,
    originY: layout.originY,
    boardWidth: layout.boardWidth,
    boardHeight: layout.boardHeight,
    style: n.style,
    hash,
    stats: {
      ...p.stats,
      floorTiles: base.length,
      sockets: sockets.length,
      docks: layout.docks.length
    }
  };
}

/** Exposes the layout the bake would use (margins, snapped grid lines) without drawing anything. */
export const computeBoardTileLayout = (input: BoardTileBakeInput): BoardTileLayout => {
  const n = normalizeInput(input);
  return buildLayout(n, resolveBoardTileStyle(n.style, n.tileSize, n.scale));
};

/* ------------------------------------------------------------------------------------------ */
/* rebuild-skipping cache                                                                     */
/* ------------------------------------------------------------------------------------------ */

export interface BoardTileBakeCache<TCanvas = unknown> {
  /** Returns the cached bake when the input hash is unchanged; `rebuilt` says whether it drew. */
  bake(input: BoardTileBakeInput, factory: TileBakeSurfaceFactory<TCanvas>): {
    result: BoardTileBakeResult<TCanvas>;
    rebuilt: boolean;
  };
  readonly current: BoardTileBakeResult<TCanvas> | null;
  clear(): void;
}

export const createBoardTileBakeCache = <TCanvas = unknown>(): BoardTileBakeCache<TCanvas> => {
  let last: BoardTileBakeResult<TCanvas> | null = null;
  return {
    bake(input, factory) {
      const hash = computeBoardTileBakeHash(input);
      if (last && last.hash === hash) {
        return { result: last, rebuilt: false };
      }
      last = bakeBoardTiles(input, factory);
      return { result: last, rebuilt: true };
    },
    get current() {
      return last;
    },
    clear() {
      last = null;
    }
  };
};

/* ------------------------------------------------------------------------------------------ */
/* markers (dynamic overlay)                                                                  */
/* ------------------------------------------------------------------------------------------ */

export interface BoardMarkerInput {
  style?: BoardTileStyleId;
  tileSize: number;
  devicePixelRatio: number;
  /** CSS-px position of board cell (0,0)'s top-left in the target context's coordinate space. */
  originX?: number;
  originY?: number;
  start?: BoardCell;
  goal?: BoardCell;
  /** Player cell; may be fractional while a move is interpolated. */
  player?: { x: number; y: number };
  /** 0..1 phase that only modulates the goal ring alpha; forced to 0 when reducedMotion. */
  phase?: number;
  reducedMotion?: boolean;
  /**
   * Chip style: the start / goal cell's own chip geometry in BOARD-LOCAL css px (`computeChipTileAt`, from the
   * same bake layout), so the end marker is centred on the baked tile's device-snapped cell. `startTile.direction` is
   * the way the start arrow points. Omit for a standalone cell (Guide icons): an isolated chip, arrow pointing right.
   */
  startTile?: EndpointTileRect | null;
  goalTile?: EndpointTileRect | null;
  /**
   * TRACE style only (the alternate): on-screen floors (css px) so the start/goal stay findable when tiles
   * are tiny. The chip style draws the end tile at exactly the tile's size and ignores this: its goal is
   * found through the beacon (goalBeacon.ts).
   */
  minimumMarkerSizes?: { goalBadgeDiameterCss?: number; startTileCss?: number };
}

export interface BoardMarkerStats {
  paintOps: number;
  pathOps: number;
  stateOps: number;
}

const starPath = (p: Painter, cx: number, cy: number, outer: number, inner: number): void => {
  p.begin();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 1 ? inner : outer;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) p.move(x, y); else p.line(x, y);
  }
  p.close();
};

export const centerOfCell = (cell: BoardCell, size: number, scale: number, ox: number, oy: number): [number, number] => [
  ox + (Math.round(cell.x * size * scale) + Math.round((cell.x + 1) * size * scale)) / 2 / scale,
  oy + (Math.round(cell.y * size * scale) + Math.round((cell.y + 1) * size * scale)) / 2 / scale
];

const drawTraceStartMarker = (painter: Painter, style: ResolvedBoardTileStyle, cx: number, cy: number): void => {
  const m = style.material;
  const k = style.marker;
  painter.fillStyle(cssRgb(m.void));
  painter.begin();
  painter.circle(cx, cy, k.traceStartDiscRadius);
  painter.fill();
  painter.strokeStyle(cssRgb(m.start));
  painter.lineWidth(k.startWidth);
  painter.stroke();
  painter.strokeStyle(cssRgba(m.start, 0.5));
  painter.lineWidth(k.hairline);
  painter.begin();
  painter.circle(cx, cy, k.traceStartOuterRadius);
  painter.stroke();
  painter.fillStyle(cssRgb(m.start));
  painter.begin();
  painter.circle(cx, cy, k.startDotRadius);
  painter.fill();
};

const drawTraceGoalMarker = (
  painter: Painter,
  style: ResolvedBoardTileStyle,
  cx: number,
  cy: number,
  ringAlpha: number
): void => {
  const m = style.material;
  const k = style.marker;
  painter.strokeStyle(cssRgba(m.goalHalo, 0.35 * ringAlpha));
  painter.lineWidth(k.hairline * 3);
  painter.begin();
  painter.circle(cx, cy, k.traceGoalHaloRadius - k.hairline);
  painter.stroke();
  painter.strokeStyle(cssRgba(m.goalHalo, 0.7 * ringAlpha));
  painter.lineWidth(k.hairline);
  painter.begin();
  painter.circle(cx, cy, k.traceGoalHaloRadius);
  painter.stroke();
  painter.fillStyle(cssRgba(m.void, 0.9));
  painter.begin();
  painter.circle(cx, cy, k.traceGoalDiscRadius);
  painter.fill();
  starPath(painter, cx, cy, k.traceGoalStarOuter, k.traceGoalStarInner);
  painter.caps('round', 'round');
  painter.strokeStyle(cssRgb(m.void));
  painter.lineWidth(k.hairline * 2);
  painter.stroke();
  painter.fillStyle(cssRgb(m.goal));
  painter.fill();
};

/**
 * The end marker: the glyph (goal star / start play arrow) directly on the baked tile, no pad, no disc, no ring. A
 * dark keyline is traced around the glyph (board void colour, round joins) and the glyph is filled over it, so it
 * stays legible on the mid-tone chip without any backdrop shape.
 */
const drawEndpointGlyph = (
  painter: Painter,
  style: ResolvedBoardTileStyle,
  spec: EndpointTileSpec,
  ox: number,
  oy: number
): void => {
  const m = style.material;
  const { frame } = spec;
  const cx = ox + frame.cx;
  const cy = oy + frame.cy;
  if (spec.star) {
    // keyline: the star's outline, stroked wide in the void colour (half of it falls inside, under the fill)
    starPath(painter, cx, cy, spec.star.outer, spec.star.inner);
    painter.fillStyle(cssRgb(m.void));
    painter.strokeStyle(cssRgb(m.void));
    painter.lineWidth(frame.keyline * 2);
    painter.fill();
    painter.stroke();
    starPath(painter, cx, cy, spec.star.outer, spec.star.inner);
    painter.fillStyle(cssRgb(m.goal));
    painter.fill();
    return;
  }
  if (spec.play) {
    const { play } = spec;
    const trace = (): void => {
      painter.begin();
      painter.move(ox + play.ax, oy + play.ay);
      painter.line(ox + play.bx, oy + play.by);
      painter.line(ox + play.cx, oy + play.cy);
      painter.close();
    };
    trace();
    painter.fillStyle(cssRgb(m.void));
    painter.strokeStyle(cssRgb(m.void));
    painter.lineWidth(play.stroke + (frame.keyline * 2));
    painter.fill();
    painter.stroke();
    trace();
    painter.fillStyle(cssRgb(m.start));
    painter.strokeStyle(cssRgb(m.start));
    painter.lineWidth(play.stroke);
    painter.fill();
    painter.stroke();
  }
};

const drawPlayerMarker = (painter: Painter, style: ResolvedBoardTileStyle, cx: number, cy: number): void => {
  const m = style.material;
  const k = style.marker;
  if (style.style === 'trace') {
    const s = k.tracePlayerSize;
    const r = k.tracePlayerRadius;
    const kl = k.playerKeyline;
    const halo = style.tileSize * 0.12;
    painter.fillStyle(cssRgba(m.player, 0.18));
    painter.begin();
    painter.uniformRoundedRect(cx - s / 2 - halo, cy - s / 2 - halo, s + 2 * halo, s + 2 * halo, r + halo);
    painter.fill();
    painter.fillStyle(cssRgb(m.void));
    painter.begin();
    painter.uniformRoundedRect(cx - s / 2 - kl, cy - s / 2 - kl, s + 2 * kl, s + 2 * kl, r + kl);
    painter.fill();
    painter.fillStyle(cssRgb(m.player));
    painter.begin();
    painter.uniformRoundedRect(cx - s / 2, cy - s / 2, s, s, r);
    painter.fill();
    return;
  }
  const s = k.playerSize;
  const r = k.playerRadius;
  const kl = k.playerKeyline;
  const w = k.playerEdge;
  painter.fillStyle(cssRgb(m.void));
  painter.begin();
  painter.uniformRoundedRect(cx - s / 2 - kl - w, cy - s / 2 - kl - w, s + 2 * (kl + w), s + 2 * (kl + w), r + w + kl);
  painter.fill();
  painter.fillStyle(cssRgb(m.playerEdge));
  painter.begin();
  painter.uniformRoundedRect(cx - s / 2 - w, cy - s / 2 - w, s + 2 * w, s + 2 * w, r + w);
  painter.fill();
  painter.fillStyle(cssRgb(m.player));
  painter.begin();
  painter.uniformRoundedRect(cx - s / 2, cy - s / 2, s, s, r);
  painter.fill();
};

const snapEdge = (cells: number, size: number, scale: number): number => Math.round(cells * size * scale) / scale;

/** Board-local isolated-chip rect of one cell (a disc), from the same device-snapped grid lines the bake uses. */
const standaloneEndpointRect = (
  cell: BoardCell,
  size: number,
  scale: number,
  style: ResolvedBoardTileStyle
): EndpointTileRect => {
  const left = snapEdge(cell.x, size, scale);
  const top = snapEdge(cell.y, size, scale);
  return resolveIsolatedEndpointRect(
    left,
    top,
    snapEdge(cell.x + 1, size, scale) - left,
    snapEdge(cell.y + 1, size, scale) - top,
    style.rimWidth,
    style.capRadius
  );
};

/**
 * Draws start, goal and player for the chosen style onto `ctx`. Only the markers present in the
 * input are drawn. Start is skipped while the player stands on it. Order: start, goal, player.
 *
 * Chip style: start and goal are END MARKERS (see endpointTiles.ts): a star / a play arrow centred directly on
 * the baked tile (no box behind them), placed from `startTile` / `goalTile` (the baked tile's geometry). The start
 * arrow points along `startTile.direction`. Trace style: the alternate marker artwork, unchanged.
 */
export const drawBoardMarkers = (ctx: TileBakeContext2D, input: BoardMarkerInput): BoardMarkerStats => {
  const scale = clampBoardDevicePixelRatio(input.devicePixelRatio);
  const styleId = resolveBoardTileStyleId(input.style ?? DEFAULT_BOARD_TILE_STYLE);
  const style = resolveBoardTileStyle(styleId, input.tileSize, scale);
  const ox = input.originX ?? 0;
  const oy = input.originY ?? 0;
  const painter = new Painter(ctx);
  const phase = input.reducedMotion ? 0 : (input.phase ?? 0);
  const ringAlpha = BOARD_TILE_GEOMETRY.marker.goalRingAlphaBase
    + (BOARD_TILE_GEOMETRY.marker.goalRingAlphaSwing * Math.max(0, Math.min(1, phase)));

  painter.save();
  painter.alpha(1);
  painter.caps('round', 'round');
  const onStart = input.start && input.player
    && input.player.x === input.start.x && input.player.y === input.start.y;
  const paintEndpoint = (kind: EndpointKind, cell: BoardCell, tile: EndpointTileRect | null | undefined): void => {
    const rect = tile ?? standaloneEndpointRect(cell, input.tileSize, scale, style);
    drawEndpointGlyph(painter, style, resolveEndpointTile(kind, rect, scale), ox, oy);
  };
  if (input.start && !onStart) {
    if (styleId === 'trace') {
      const [cx, cy] = centerOfCell(input.start, input.tileSize, scale, ox, oy);
      const startTile = Math.max(input.tileSize, input.minimumMarkerSizes?.startTileCss ?? 0);
      const startStyle = startTile > input.tileSize ? resolveBoardTileStyle(styleId, startTile, scale) : style;
      drawTraceStartMarker(painter, startStyle, cx, cy);
    } else {
      paintEndpoint('start', input.start, input.startTile);
    }
  }
  if (input.goal) {
    if (styleId === 'trace') {
      const [cx, cy] = centerOfCell(input.goal, input.tileSize, scale, ox, oy);
      const goalTile = resolveGoalEffectiveTile(input.tileSize, input.minimumMarkerSizes?.goalBadgeDiameterCss ?? 0);
      const goalStyle = goalTile > input.tileSize ? resolveBoardTileStyle(styleId, goalTile, scale) : style;
      drawTraceGoalMarker(painter, goalStyle, cx, cy, ringAlpha);
    } else {
      paintEndpoint('goal', input.goal, input.goalTile);
    }
  }
  if (input.player) {
    const cx = ox + (input.player.x + 0.5) * input.tileSize;
    const cy = oy + (input.player.y + 0.5) * input.tileSize;
    drawPlayerMarker(painter, style, cx, cy);
  }
  painter.restore();
  return { ...painter.stats };
};

/* ------------------------------------------------------------------------------------------ */
/* reserved hazard-grammar slots: geometry only, they DRAW NOTHING                            */
/* ------------------------------------------------------------------------------------------ */

export interface BoardSlotInput {
  cell: BoardCell;
  tileSize: number;
  devicePixelRatio: number;
  originX?: number;
  originY?: number;
}

export interface SlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardSlotGeometry {
  kind: 'blocker' | 'gate' | 'patrol';
  /** Always false: the slot is reserved and nothing is painted for it today. */
  drawn: false;
  cell: BoardCell;
  rect: SlotRect;
  center: { x: number; y: number };
  parts: Record<string, SlotRect | { x: number; y: number; radius: number } | Array<SlotRect> | Array<{ x: number; y: number }>>;
  /** Visual grammar the future hazard packet must satisfy (from the audit; not implemented here). */
  requires: readonly string[];
}

const slotBase = (input: BoardSlotInput): { rect: SlotRect; cx: number; cy: number; t: number; scale: number } => {
  const scale = clampBoardDevicePixelRatio(input.devicePixelRatio);
  const t = input.tileSize;
  const ox = input.originX ?? 0;
  const oy = input.originY ?? 0;
  const left = ox + Math.round(input.cell.x * t * scale) / scale;
  const top = oy + Math.round(input.cell.y * t * scale) / scale;
  const right = ox + Math.round((input.cell.x + 1) * t * scale) / scale;
  const bottom = oy + Math.round((input.cell.y + 1) * t * scale) / scale;
  return {
    rect: { x: left, y: top, width: right - left, height: bottom - top },
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
    t,
    scale
  };
};

/**
 * RESERVED. Static blocker: solid, non-lit, hatched fill, no rim. `_ctx` is accepted so the future
 * drawing lands at the same call site; this function must never touch it.
 */
export const slotBlocker = (_ctx: TileBakeContext2D | null, input: BoardSlotInput): BoardSlotGeometry => {
  const b = slotBase(input);
  const inset = b.t * 0.12;
  return {
    kind: 'blocker',
    drawn: false,
    cell: { ...input.cell },
    rect: b.rect,
    center: { x: b.cx, y: b.cy },
    parts: {
      hatch: { x: b.rect.x + inset, y: b.rect.y + inset, width: b.rect.width - 2 * inset, height: b.rect.height - 2 * inset }
    },
    requires: ['solid fill', 'non-lit (no rim)', 'hatched pattern', 'distinct from wall sockets']
  };
};

/** RESERVED. Timed gate: a bar across the ribbon plus three state ticks. Draws nothing. */
export const slotGate = (_ctx: TileBakeContext2D | null, input: BoardSlotInput): BoardSlotGeometry => {
  const b = slotBase(input);
  const barH = b.t * 0.22;
  const tick = b.t * 0.1;
  const ticks = [-1, 0, 1].map((i) => ({
    x: b.cx + i * b.t * 0.22 - tick / 2,
    y: b.cy + barH / 2 + tick * 0.6,
    width: tick,
    height: tick
  }));
  return {
    kind: 'gate',
    drawn: false,
    cell: { ...input.cell },
    rect: b.rect,
    center: { x: b.cx, y: b.cy },
    parts: {
      bar: { x: b.rect.x, y: b.cy - barH / 2, width: b.rect.width, height: barH },
      ticks
    },
    requires: ['bar across the ribbon', 'three-step state ticks', 'state readable without colour']
  };
};

/** RESERVED. Patrol marker: unique silhouette, facing notch per direction, lane. Draws nothing. */
export const slotPatrol = (_ctx: TileBakeContext2D | null, input: BoardSlotInput): BoardSlotGeometry => {
  const b = slotBase(input);
  const radius = b.t * 0.3;
  const inset = b.t * 0.1;
  return {
    kind: 'patrol',
    drawn: false,
    cell: { ...input.cell },
    rect: b.rect,
    center: { x: b.cx, y: b.cy },
    parts: {
      body: { x: b.cx, y: b.cy, radius },
      facing: [
        { x: b.cx, y: b.cy - radius },
        { x: b.cx + radius, y: b.cy },
        { x: b.cx, y: b.cy + radius },
        { x: b.cx - radius, y: b.cy }
      ],
      lane: { x: b.rect.x + inset, y: b.rect.y + inset, width: b.rect.width - 2 * inset, height: b.rect.height - 2 * inset }
    },
    requires: ['unique silhouette', 'facing notch', 'lane indicator', 'distinct from player and goal']
  };
};

export type { BoardTileStyleId, ResolvedBoardTileStyle } from './boardTileStyle';
