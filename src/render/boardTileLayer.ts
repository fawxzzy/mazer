/**
 * Board tile layer: the scene-side wiring of the baked Chip/Trace board tiles
 * (src/render/boardTileBake.ts, boardTileStyle.ts).
 *
 * Two jobs, none of which run per frame unless something visible changed:
 *
 *   1. `BoardTileLayer` bakes the whole static board (floor, rim, junction details, wall sockets,
 *      wrap docks) ONCE per bake hash (style, tile size, DPR, grid, docks, start/goal) via
 *      `createBoardTileBakeCache`, and shows it through one Phaser canvas-texture Image.
 *   2. The progressive build/deconstruct reveal is a rank-based mask over that one bake:
 *      `composeBoardTileReveal` clips the baked canvas to the currently visible cells (the scene's
 *      reveal order gives each cell a rank; a cell is visible while rank < limit) and erases hidden
 *      floor cells, so the tile-by-tile pacing of the lifecycle timeline is unchanged. The composite is
 *      redrawn only when the reveal key changes; a fully built board is one drawImage.
 *
 * Start/goal markers are NOT drawn here: they are the Chip marker draw code (`drawBoardMarkers`),
 * painted through `PhaserGraphicsTileContext` into the scene's dynamic graphics and the Guide sheet,
 * so the board and the Guide icons run the same draw function. What this layer does provide is the start and
 * goal tiles' own chip geometry (`endpointTiles`, recomputed on each rebake from the bake's layout), so the end
 * markers are centred on the baked tile, and the start arrow's direction (the first step of the solution path).
 *
 * Everything pure (rank grid, run merging, composite) takes an injected 2D context so it is unit
 * tested without a browser. Colours/geometry come from boardTileStyle (registry-derived).
 */
import type Phaser from 'phaser';
import {
  computeBoardTileLayout,
  computeChipTileAt,
  createBoardTileBakeCache,
  type BoardCell,
  type ChipTileGeometry,
  type BoardTileBakeInput,
  type BoardTileBakeResult,
  type BoardTileDock,
  type BoardTileLayout,
  type TileBakeContext2D,
  type TileBakeSurface
} from './boardTileBake';
import { resolveRevealMaskLength } from './boardRevealMask';
import { toWholeImagePosition } from './pixelAlignment';
import { resolveStartDirection, type StartDirection } from './startDirection';
import {
  clampBoardDevicePixelRatio,
  resolveBoardTileStyleId,
  type BoardTileStyleId
} from './boardTileStyle';

/** URL parameter that selects the alternate style: `?tileStyle=trace`. Anything else is Chip. */
export const BOARD_TILE_STYLE_PARAM = 'tileStyle';

/** Flag resolver: default Chip, `?tileStyle=trace` for the alternate. Never throws. */
export const resolveBoardTileStyleFromSearch = (search: string | null | undefined): BoardTileStyleId => {
  try {
    const raw = new URLSearchParams(search ?? '').get(BOARD_TILE_STYLE_PARAM);
    return resolveBoardTileStyleId(raw);
  } catch {
    return resolveBoardTileStyleId(null);
  }
};

/* ------------------------------------------------------------------------------------------ */
/* rank grid + reveal composite (pure, injected context)                                      */
/* ------------------------------------------------------------------------------------------ */

/** rank[y][x] = index in the reveal order, or -1 for a cell that is not in the order (walls). */
export const buildRankGrid = (
  order: ReadonlyArray<{ x: number; y: number }>,
  width: number,
  height: number
): Int32Array => {
  const ranks = new Int32Array(Math.max(0, width * height)).fill(-1);
  for (let index = 0; index < order.length; index += 1) {
    const cell = order[index]!;
    if (cell.x >= 0 && cell.x < width && cell.y >= 0 && cell.y < height) {
      ranks[(cell.y * width) + cell.x] = index;
    }
  }
  return ranks;
};

/**
 * Is a floor cell shown while a staged build/deconstruct is running?
 *
 * tileLimit = live BFS tile count (null = no tile limit, every tile shown); rowLimit = the legacy row
 * counter (null = not row-limited). A cell is shown when its rank is below the tile limit OR it sits
 * above the row limit. A null row limit means "the row counter is not part of this stage", NEVER
 * "everything is revealed": reading it as "show all" kept the whole board on screen for the entire
 * deconstruct (the build arms rowLimit = 0, the deconstruct arms rowLimit = null), so the dissolve was
 * invisible and the maze only vanished when the next one replaced it.
 */
export const isBoardCellRevealed = (
  tileLimit: number | null,
  rowLimit: number | null,
  rank: number,
  y: number
): boolean => (
  tileLimit === null
  || (rank >= 0 && rank < tileLimit)
  || (rowLimit !== null && y < rowLimit)
);

/** The subset of CanvasRenderingContext2D the reveal composite uses. */
export interface BoardRevealContext2D {
  globalCompositeOperation: string;
  fillStyle: unknown;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  fill(): void;
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void;
}

export interface BoardRevealInput {
  layout: BoardTileLayout;
  /** grid[y][x] === true is a floor cell. */
  grid: ReadonlyArray<ReadonlyArray<boolean>>;
  /** True when the floor cell (x, y) is currently revealed. */
  isVisible: (x: number, y: number) => boolean;
  /** Wrap docks (the margin strips around the board) are one atomic group. */
  docksVisible: boolean;
}

export interface BoardRevealStats {
  clipRects: number;
  eraseRects: number;
  drawImages: number;
}

/**
 * Draws the visible part of the baked board onto `ctx` (device-pixel sized, cleared here).
 * Clip = every visible floor cell grown by one tile (so the rim glow and wall sockets belong to the
 * revealed corridor and nothing pops in at the end), then hidden floor cells are erased exactly, so
 * a not-yet-built tile never shows through a visible neighbour. Row runs are merged into one rect.
 */
export const composeBoardTileReveal = (
  ctx: BoardRevealContext2D,
  baked: unknown,
  input: BoardRevealInput
): BoardRevealStats => {
  const { layout, grid, isVisible, docksVisible } = input;
  const stats: BoardRevealStats = { clipRects: 0, eraseRects: 0, drawImages: 0 };
  const scale = layout.scale;
  const grow = layout.tileSize;
  const hasDocks = layout.docks.length > 0;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, layout.pixelWidth, layout.pixelHeight);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const visibleRuns: Array<[number, number, number]> = [];
  const hiddenRuns: Array<[number, number, number]> = [];
  for (let y = 0; y < layout.rows; y += 1) {
    const row = grid[y];
    if (!row) {
      continue;
    }
    let visibleStart = -1;
    let hiddenStart = -1;
    for (let x = 0; x <= layout.cols; x += 1) {
      const floor = x < layout.cols && row[x] === true;
      const shown = floor && isVisible(x, y);
      const hidden = floor && !shown;
      if (shown && visibleStart < 0) visibleStart = x;
      if (!shown && visibleStart >= 0) {
        visibleRuns.push([y, visibleStart, x - 1]);
        visibleStart = -1;
      }
      if (hidden && hiddenStart < 0) hiddenStart = x;
      if (!hidden && hiddenStart >= 0) {
        hiddenRuns.push([y, hiddenStart, x - 1]);
        hiddenStart = -1;
      }
    }
  }

  const ox = layout.originX;
  const oy = layout.originY;
  ctx.save();
  ctx.beginPath();
  for (const [y, x0, x1] of visibleRuns) {
    const left = ox + layout.xs[x0]!;
    const top = oy + layout.ys[y]!;
    const right = ox + layout.xs[x1 + 1]!;
    const bottom = oy + layout.ys[y + 1]!;
    ctx.rect(left - grow, top - grow, (right - left) + (2 * grow), (bottom - top) + (2 * grow));
    stats.clipRects += 1;
  }
  if (docksVisible && hasDocks) {
    // The dock margin strips (outside the board rect) belong to the atomic edge group.
    const bw = ox + layout.boardWidth;
    const bh = oy + layout.boardHeight;
    ctx.rect(0, 0, ox, layout.height);
    ctx.rect(bw, 0, layout.width - bw, layout.height);
    ctx.rect(0, 0, layout.width, oy);
    ctx.rect(0, bh, layout.width, layout.height - bh);
    stats.clipRects += 4;
  }
  ctx.clip();
  ctx.drawImage(baked, 0, 0, layout.width, layout.height);
  stats.drawImages += 1;
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  ctx.beginPath();
  for (const [y, x0, x1] of hiddenRuns) {
    const left = ox + layout.xs[x0]!;
    const top = oy + layout.ys[y]!;
    const right = ox + layout.xs[x1 + 1]!;
    const bottom = oy + layout.ys[y + 1]!;
    ctx.rect(left, top, right - left, bottom - top);
    stats.eraseRects += 1;
  }
  if (!docksVisible && hasDocks) {
    const bw = ox + layout.boardWidth;
    const bh = oy + layout.boardHeight;
    ctx.rect(0, 0, ox, layout.height);
    ctx.rect(bw, 0, layout.width - bw, layout.height);
    ctx.rect(0, 0, layout.width, oy);
    ctx.rect(0, bh, layout.width, layout.height - bh);
    stats.eraseRects += 4;
  }
  ctx.fill();
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return stats;
};

/** The subset of CanvasRenderingContext2D the soft reveal composite uses (adds alpha + a source rect). */
export interface BoardSoftRevealContext2D extends Omit<BoardRevealContext2D, 'drawImage'> {
  globalAlpha: number;
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(
    image: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number
  ): void;
}

/** Alpha steps of the soft reveal: a cell's alpha is rounded to k / SOFT_REVEAL_LEVELS (6.25 % per step). */
export const SOFT_REVEAL_LEVELS = 16;

export interface BoardSoftRevealInput {
  layout: BoardTileLayout;
  /** (cols + 2) x (rows + 2) cell alphas 0..255 (boardRevealMask.ts), the grid padded by one cell on every side. */
  cellAlpha: Uint8ClampedArray;
  /** 0..1 alpha of the wrap dock strips; ignored when the layout has no docks. */
  dockAlpha: number;
}

export interface BoardSoftRevealStats {
  /** drawImage calls of the whole baked canvas, one per alpha level in use (at most SOFT_REVEAL_LEVELS). */
  levelDraws: number;
  clipRects: number;
  stripDraws: number;
}

/**
 * Draws the board with a SOFT reveal onto `ctx` (device-pixel sized, cleared here). Every cell (floor, wall, and the
 * pad ring one cell around the board) has its own alpha; cells are bucketed by that alpha rounded to 1/16 and each
 * bucket is ONE clipped drawImage of the baked canvas at its globalAlpha (row runs merged into rects). So the cost is
 * at most 16 draws whatever the maze size, never one per tile, and no full-frame pass: a full-size `destination-in`
 * mask pass was measured to double the render cost in software raster, this does not. Cell edges are device-snapped
 * (layout.xs / ys), so adjacent buckets never leave an antialiasing seam. The wrap dock strips (the margin outside
 * the board rect) are drawn last at `dockAlpha`.
 */
export const composeBoardTileRevealSoft = (
  ctx: BoardSoftRevealContext2D,
  baked: unknown,
  input: BoardSoftRevealInput
): BoardSoftRevealStats => {
  const { layout, cellAlpha, dockAlpha } = input;
  const stats: BoardSoftRevealStats = { levelDraws: 0, clipRects: 0, stripDraws: 0 };
  const scale = layout.scale;
  const { cols, rows } = layout;
  // Padded grid edges in layout px: one extra cell of the edge cell's own size on each side.
  const xs: number[] = [layout.originX + layout.xs[0]! - (layout.xs[1]! - layout.xs[0]!)];
  for (let x = 0; x <= cols; x += 1) xs.push(layout.originX + layout.xs[x]!);
  xs.push(xs[cols + 1]! + (layout.xs[cols]! - layout.xs[cols - 1]!));
  const ys: number[] = [layout.originY + layout.ys[0]! - (layout.ys[1]! - layout.ys[0]!)];
  for (let y = 0; y <= rows; y += 1) ys.push(layout.originY + layout.ys[y]!);
  ys.push(ys[rows + 1]! + (layout.ys[rows]! - layout.ys[rows - 1]!));

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, layout.pixelWidth, layout.pixelHeight);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const stride = cols + 2;
  const buckets: Array<Array<[number, number, number]>> = Array.from({ length: SOFT_REVEAL_LEVELS + 1 }, () => []);
  for (let py = 0; py < rows + 2; py += 1) {
    let runStart = -1;
    let runLevel = 0;
    for (let px = 0; px <= stride; px += 1) {
      const level = px < stride ? Math.round((cellAlpha[(py * stride) + px]! / 255) * SOFT_REVEAL_LEVELS) : 0;
      if (px < stride && level === runLevel && runStart >= 0) {
        continue;
      }
      if (runStart >= 0 && runLevel > 0) {
        buckets[runLevel]!.push([py, runStart, px - 1]);
      }
      runStart = px < stride ? px : -1;
      runLevel = level;
    }
  }

  for (let level = 1; level <= SOFT_REVEAL_LEVELS; level += 1) {
    const runs = buckets[level]!;
    if (runs.length === 0) {
      continue;
    }
    ctx.save();
    ctx.beginPath();
    for (const [py, px0, px1] of runs) {
      ctx.rect(xs[px0]!, ys[py]!, xs[px1 + 1]! - xs[px0]!, ys[py + 1]! - ys[py]!);
      stats.clipRects += 1;
    }
    ctx.clip();
    ctx.globalAlpha = level / SOFT_REVEAL_LEVELS;
    ctx.drawImage(baked, 0, 0, layout.width, layout.height);
    ctx.restore();
    stats.levelDraws += 1;
  }

  if (layout.docks.length > 0) {
    // The margin strips around the board rect, disjoint so no pixel is drawn twice.
    const boardRight = layout.originX + layout.boardWidth;
    const boardBottom = layout.originY + layout.boardHeight;
    const strips: Array<[number, number, number, number]> = [
      [0, 0, layout.originX, layout.height],
      [boardRight, 0, layout.width - boardRight, layout.height],
      [layout.originX, 0, layout.boardWidth, layout.originY],
      [layout.originX, boardBottom, layout.boardWidth, layout.height - boardBottom]
    ];
    ctx.save();
    for (const [x, y, w, h] of strips) {
      if (w <= 0 || h <= 0) {
        continue;
      }
      const sx = Math.round(x * scale);
      const sy = Math.round(y * scale);
      const sw = Math.round(w * scale);
      const sh = Math.round(h * scale);
      ctx.clearRect(sx / scale, sy / scale, sw / scale, sh / scale);
      if (dockAlpha > 0 && sw > 0 && sh > 0) {
        ctx.globalAlpha = Math.min(1, dockAlpha);
        ctx.drawImage(baked, sx, sy, sw, sh, sx / scale, sy / scale, sw / scale, sh / scale);
        stats.stripDraws += 1;
      }
    }
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return stats;
};

/* ------------------------------------------------------------------------------------------ */
/* board layer                                                                                */
/* ------------------------------------------------------------------------------------------ */

export type BoardTileReveal =
  | { kind: 'all' }
  | { kind: 'cells'; key: string; isVisible: (x: number, y: number) => boolean; docksVisible: boolean }
  /**
   * MAZER-VIS-040: the soft build / deconstruct. `fillMask` writes this frame's alpha (0..255) for the padded
   * (cols + 2) x (rows + 2) cell grid (boardRevealMask.ts); the layer draws the bake once per alpha level.
   */
  | { kind: 'soft'; key: string; dockAlpha: number; fillMask: (alpha: Uint8ClampedArray) => void };

export interface BoardTileLayerFrame {
  grid: ReadonlyArray<ReadonlyArray<boolean>>;
  width: number;
  height: number;
  /** Tile edge in layout px (before any container zoom). */
  tileSize: number;
  /** Backing scale: canvas resolution times board zoom, as the other scene canvases compute it. */
  devicePixelRatio: number;
  style: BoardTileStyleId;
  docks: readonly BoardTileDock[];
  start?: BoardCell;
  goal?: BoardCell;
  /** Layout-px position of board cell (0,0)'s top-left corner. */
  boardLeft: number;
  boardTop: number;
  reveal: BoardTileReveal;
  /** Whole-layer alpha (default 1): the reduced-motion crossfade of the board. */
  alpha?: number;
  visible: boolean;
}

export interface BoardTileLayerUpdateStats {
  rebuilt: boolean;
  bakeMs: number;
  composeMs: number;
  recomposed: boolean;
}

const createDocumentSurface = (pixelWidth: number, pixelHeight: number): TileBakeSurface<HTMLCanvasElement> => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, pixelWidth);
  canvas.height = Math.max(1, pixelHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('board tile layer: 2D canvas context unavailable');
  }
  return { canvas, ctx: ctx as unknown as TileBakeContext2D };
};

/** The start and goal cells' chip geometry, board-local css px (null when absent or not a floor cell). */
export interface BoardTileEndpoints {
  /** The start tile, plus the direction its play arrow points: the first step of the solution path (startDirection.ts). */
  start: (ChipTileGeometry & { direction: StartDirection }) | null;
  goal: ChipTileGeometry | null;
}

export class BoardTileLayer {
  readonly image: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly cache = createBoardTileBakeCache<HTMLCanvasElement>();
  private layout: BoardTileLayout | null = null;
  private composedKey: string | null = null;
  private composedHash: string | null = null;
  private endpoints: BoardTileEndpoints = { start: null, goal: null };
  private textureWidth = 0;
  private textureHeight = 0;
  private softCellAlpha = new Uint8ClampedArray(0);
  /** Cumulative diagnostics (read by tests and the runtime diagnostics hook). */
  bakeCount = 0;
  lastBakeMs = 0;
  lastComposeMs = 0;
  lastStats: BoardTileLayerUpdateStats = { rebuilt: false, bakeMs: 0, composeMs: 0, recomposed: false };

  constructor(scene: Phaser.Scene, textureKey: string) {
    this.texture = scene.textures.createCanvas(textureKey, 1, 1) as Phaser.Textures.CanvasTexture;
    this.image = scene.add.image(0, 0, textureKey).setOrigin(0, 0).setVisible(false);
  }

  get currentHash(): string | null {
    return this.cache.current?.hash ?? null;
  }

  get currentBake(): BoardTileBakeResult<HTMLCanvasElement> | null {
    return this.cache.current;
  }

  /** Start/goal chip geometry of the current bake (board-local css px, origin = `snappedOrigin`). */
  get endpointTiles(): BoardTileEndpoints {
    return this.endpoints;
  }

  hide(): void {
    this.image.setVisible(false);
  }

  update(frame: BoardTileLayerFrame): BoardTileLayerUpdateStats {
    if (!frame.visible || frame.width <= 0 || frame.height <= 0 || frame.tileSize <= 0) {
      this.image.setVisible(false);
      this.lastStats = { rebuilt: false, bakeMs: 0, composeMs: 0, recomposed: false };
      return this.lastStats;
    }
    const dpr = clampBoardDevicePixelRatio(frame.devicePixelRatio);
    const input: BoardTileBakeInput = {
      grid: frame.grid,
      width: frame.width,
      height: frame.height,
      tileSize: frame.tileSize,
      devicePixelRatio: dpr,
      style: frame.style,
      docks: frame.docks,
      start: frame.start,
      goal: frame.goal
    };
    const t0 = performance.now();
    const { result, rebuilt } = this.cache.bake(input, createDocumentSurface);
    const bakeMs = rebuilt ? performance.now() - t0 : 0;
    if (rebuilt) {
      this.bakeCount += 1;
      this.lastBakeMs = bakeMs;
      this.layout = computeBoardTileLayout(input);
      const startTile = frame.start ? computeChipTileAt(input, frame.start) : null;
      this.endpoints = {
        start: startTile && frame.start
          ? { ...startTile, direction: resolveStartDirection(frame.grid, frame.start, frame.goal) }
          : null,
        goal: frame.goal ? computeChipTileAt(input, frame.goal) : null
      };
      this.composedKey = null;
    }
    const layout = this.layout!;

    const revealKey = frame.reveal.kind === 'all'
      ? 'all'
      : frame.reveal.kind === 'soft'
        ? `soft:${frame.reveal.key}`
        : `cells:${frame.reveal.key}:${frame.reveal.docksVisible ? 'd' : '-'}`;
    const composeKey = `${result.hash}|${revealKey}`;
    let composeMs = 0;
    let recomposed = false;
    if (this.composedKey !== composeKey) {
      const t1 = performance.now();
      if (this.textureWidth !== result.pixelWidth || this.textureHeight !== result.pixelHeight) {
        this.texture.setSize(result.pixelWidth, result.pixelHeight);
        this.textureWidth = result.pixelWidth;
        this.textureHeight = result.pixelHeight;
      }
      const ctx = this.texture.context;
      if (frame.reveal.kind === 'all') {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, result.pixelWidth, result.pixelHeight);
        ctx.drawImage(result.canvas, 0, 0);
      } else if (frame.reveal.kind === 'soft') {
        composeBoardTileRevealSoft(ctx as unknown as BoardSoftRevealContext2D, result.canvas, {
          layout,
          cellAlpha: this.fillSoftCellAlpha(layout.cols, layout.rows, frame.reveal.fillMask),
          dockAlpha: frame.reveal.dockAlpha
        });
      } else {
        composeBoardTileReveal(ctx, result.canvas, {
          layout,
          grid: frame.grid,
          isVisible: frame.reveal.isVisible,
          docksVisible: frame.reveal.docksVisible
        });
      }
      this.texture.refresh();
      this.composedKey = composeKey;
      recomposed = true;
      composeMs = performance.now() - t1;
      this.lastComposeMs = composeMs;
    }

    // Device-snap the board origin so every baked line lands on a whole device pixel.
    // ...then give Phaser a whole css px (it floors an Image's position under roundPixels; see pixelAlignment.ts),
    // so `snappedOrigin` below is exactly where the board is drawn and the end markers (Graphics) line up with it.
    const left = toWholeImagePosition((Math.round(frame.boardLeft * dpr) / dpr) - result.originX);
    const top = toWholeImagePosition((Math.round(frame.boardTop * dpr) / dpr) - result.originY);
    this.image.setPosition(left, top);
    this.image.setDisplaySize(result.width, result.height);
    this.image.setAlpha(frame.alpha ?? 1);
    this.image.setVisible(true);
    this.composedHash = result.hash;
    this.lastStats = { rebuilt, bakeMs, composeMs, recomposed };
    return this.lastStats;
  }

  /** This frame's padded (cols + 2) x (rows + 2) cell alphas, in one cached buffer. */
  private fillSoftCellAlpha(cols: number, rows: number, fill: (alpha: Uint8ClampedArray) => void): Uint8ClampedArray {
    const length = resolveRevealMaskLength(cols, rows);
    if (this.softCellAlpha.length !== length) {
      this.softCellAlpha = new Uint8ClampedArray(length);
    }
    fill(this.softCellAlpha);
    return this.softCellAlpha;
  }

  /** Layout-px origin the layer last snapped the board to (so markers line up with the bake). */
  get snappedOrigin(): { x: number; y: number } | null {
    const bake = this.cache.current;
    if (!bake || this.composedHash === null) {
      return null;
    }
    return { x: this.image.x + bake.originX, y: this.image.y + bake.originY };
  }
}
