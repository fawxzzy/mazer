/**
 * Text card placement (neon text skin, 2026-11-27): where a short text card (the in-flow notice and the first-time
 * cards) sits so it never covers what the player needs: the player, the end star, the thing the card points at, the
 * active wraps and Switches, and the HUD. Pure: rectangles in, a position out (tests/render/text-card-placement.test.ts,
 * proven on real boards at previewLevel 1, 10, 22 and 200).
 *
 * Rule:
 *  1. The card is centred across the view, never above `topMin` (the line under the HUD), never into the bottom inset.
 *  2. Candidates in order: the top band (just under the HUD), the bottom band, then every `stepPx` from the top down.
 *     A bottom-anchored line (`prefer: 'bottom'`, the level-1 control hint) tries the bottom band, then every `stepPx`
 *     from the bottom up, then the top band.
 *  3. The first candidate that covers nothing in `keepClear` wins.
 *  4. When every candidate covers something, the one whose most important covered thing matters least wins
 *     (`keepClear` is most important first); ties keep the earlier candidate (top first).
 */
import type { LegacyMazeSnapshot, LegacyPoint } from '../legacy-runtime/legacyMaze';
import { centerOfCell } from './boardTileBake';

export interface TextCardRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TextCardPlacementInput {
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** The highest the card may sit (CSS px from the top): the line under the HUD. */
  readonly topMin: number;
  /** Gap kept under the card when it sits at the bottom (CSS px). */
  readonly bottomInset: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  /** Screen rects the card must not cover, most important first (null = not on screen). */
  readonly keepClear: readonly (TextCardRect | null)[];
  /** Scan step between the bands (CSS px). */
  readonly stepPx?: number;
  /** Which band to try first (default top). */
  readonly prefer?: 'top' | 'bottom';
}

export interface TextCardPlacement {
  readonly edge: 'top' | 'bottom' | 'scan';
  /** The card's top (CSS px from the view top). */
  readonly topPx: number;
  /** Set for the bottom band: the gap under the card (the notice anchors from the bottom). */
  readonly bottomPx?: number;
  /** Index into keepClear of the most important thing the card covers (-1 = covers nothing). */
  readonly covers: number;
  readonly rect: TextCardRect;
}

export const TEXT_CARD_SCAN_STEP_PX = 8;
/** The card never runs wider than this (the in-flow notice's max width) and keeps this margin to the view sides. */
export const TEXT_CARD_MAX_WIDTH_PX = 360;
export const TEXT_CARD_SIDE_MARGIN_PX = 16;

const overlaps = (a: TextCardRect, b: TextCardRect): boolean => (
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
);

/** Index of the most important keep-clear rect `card` covers (-1 = none). */
export const resolveTextCardCover = (card: TextCardRect, keepClear: readonly (TextCardRect | null)[]): number => (
  keepClear.findIndex((rect) => rect != null && overlaps(card, rect))
);

export const resolveTextCardPlacement = (input: TextCardPlacementInput): TextCardPlacement => {
  const x = Math.round((input.viewWidth - input.cardWidth) / 2);
  const top = Math.max(0, input.topMin);
  const bottomTop = Math.max(top, input.viewHeight - input.bottomInset - input.cardHeight);
  const step = Math.max(1, input.stepPx ?? TEXT_CARD_SCAN_STEP_PX);
  const candidates: { edge: TextCardPlacement['edge']; y: number }[] = [];
  if (input.prefer === 'bottom' && bottomTop > top) {
    candidates.push({ edge: 'bottom', y: bottomTop });
    for (let y = bottomTop - step; y > top; y -= step) candidates.push({ edge: 'scan', y });
    candidates.push({ edge: 'top', y: top });
  } else {
    candidates.push({ edge: 'top', y: top });
    if (bottomTop > top) candidates.push({ edge: 'bottom', y: bottomTop });
    for (let y = top + step; y < bottomTop; y += step) candidates.push({ edge: 'scan', y });
  }

  let best: TextCardPlacement | null = null;
  for (const candidate of candidates) {
    const rect = { x, y: candidate.y, width: input.cardWidth, height: input.cardHeight };
    const covers = resolveTextCardCover(rect, input.keepClear);
    const placement: TextCardPlacement = {
      edge: candidate.edge,
      topPx: candidate.y,
      bottomPx: candidate.edge === 'bottom' ? input.bottomInset : undefined,
      covers,
      rect
    };
    if (covers === -1) return placement;
    if (best === null || covers > best.covers) best = placement;
  }
  return best!;
};

/** The card's width at this view width (the notice host's side padding and max width). */
export const resolveTextCardWidth = (viewWidth: number): number => (
  Math.max(0, Math.min(TEXT_CARD_MAX_WIDTH_PX, viewWidth - (TEXT_CARD_SIDE_MARGIN_PX * 2)))
);

/**
 * The rich neon card's height (CSS px) before it is in the page, from the skin's layout: padding, the icon-well row
 * (kicker + heading), the gap, then the body at ~0.52 em per character on the 14 px body line. Rounded up a little so
 * the estimate is never shorter than the real card (the placement test checks it against the kit layout numbers).
 */
export const estimateTextCardHeight = (options: {
  readonly cardWidth: number;
  readonly bodyChars: number;
  readonly heading: boolean;
  readonly action: boolean;
}): number => {
  const padding = 12;
  const bodyPx = 14;
  const bodyLine = Math.ceil(bodyPx * 1.36);
  const actionWidth = options.action ? 96 : 0;
  const head = options.heading ? 44 + 8 : 0;
  const textWidth = Math.max(40, options.cardWidth - (padding * 2) - (options.heading ? 0 : actionWidth + 12));
  const charsPerLine = Math.max(8, Math.floor(textWidth / (bodyPx * 0.52)));
  const lines = Math.max(1, Math.ceil(options.bodyChars / charsPerLine));
  return Math.ceil((padding * 2) + head + (lines * bodyLine) + 8);
};

/** A cell's keep-clear rect: the cell's screen box grown by `padPx` on every side. */
export const resolveTextCardCellRect = (center: { x: number; y: number } | null, cellPx: number, padPx = 4): TextCardRect | null => (
  center === null ? null : {
    x: center.x - (cellPx / 2) - padPx,
    y: center.y - (cellPx / 2) - padPx,
    width: cellPx + (padPx * 2),
    height: cellPx + (padPx * 2)
  }
);

/**
 * The maze cells a card must leave visible besides the player and goal: every Switch (bleed gate) tile and every
 * wrap mouth (a border floor cell whose opposite border cell in the same row or column is floor too).
 */
export const resolveTextCardMechanicCells = (
  maze: Pick<LegacyMazeSnapshot, 'grid'> & Partial<Pick<LegacyMazeSnapshot, 'bleedGates'>>
): LegacyPoint[] => {
  const cells: LegacyPoint[] = [];
  for (const gate of maze.bleedGates ?? []) cells.push({ x: gate.x, y: gate.y });
  const grid = maze.grid;
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  if (width === 0 || height === 0) return cells;
  const floor = (x: number, y: number): boolean => grid[y]?.[x] === true;
  for (let y = 0; y < height; y += 1) {
    if (floor(0, y) && floor(width - 1, y)) cells.push({ x: 0, y }, { x: width - 1, y });
  }
  for (let x = 0; x < width; x += 1) {
    if (floor(x, 0) && floor(x, height - 1)) cells.push({ x, y: 0 }, { x, y: height - 1 });
  }
  return cells;
};

/** The narrow view of the play scene the DOM cards read (structural, so MenuScene.ts stays untouched). */
export interface TextCardBoardScene {
  readonly mode?: string;
  readonly player?: LegacyPoint | null;
  readonly maze?: (Pick<LegacyMazeSnapshot, 'grid' | 'goal'> & Partial<Pick<LegacyMazeSnapshot, 'bleedGates'>>) | null;
  readonly hazardGateLayout?: { readonly tileSize: number; readonly mazeLeft: number; readonly mazeTop: number } | null;
  readonly boardTileLayer?: { readonly snappedOrigin?: { readonly x: number; readonly y: number } | null } | null;
  readonly boardZoomContainer?: { getWorldTransformMatrix(): { transformPoint(x: number, y: number): { x: number; y: number } } } | null;
  resolveBoardTileBackingScale?(): number;
  readonly layout?: { readonly width: number; readonly lanes?: { readonly hud?: { readonly top: number; readonly height: number } | null } } | null;
}

export interface TextCardBoardView {
  /** Player, end star, then every Switch and wrap mouth, in page (CSS) px. */
  readonly keepClear: readonly (TextCardRect | null)[];
  /** The HUD lane's bottom edge in page px (a card never sits above it). */
  readonly hudBottom: number;
}

/**
 * Reads the keep-clear rects off the live scene and maps them from scene px into page px through the canvas box
 * (`canvasLeft/Top`, scene-to-page `scale`). Null when there is no board in play yet (the caller keeps its default).
 */
export const resolveTextCardBoardView = (
  scene: TextCardBoardScene | null,
  canvas: { readonly left: number; readonly top: number; readonly width: number }
): TextCardBoardView | null => {
  const maze = scene?.maze;
  const layout = scene?.hazardGateLayout;
  const matrix = scene?.boardZoomContainer?.getWorldTransformMatrix?.();
  const viewWidth = scene?.layout?.width ?? 0;
  if (!scene || scene.mode !== 'play' || !maze || !layout || !(layout.tileSize > 0) || !matrix || !(viewWidth > 0)) return null;
  const s = canvas.width / viewWidth;
  const origin = scene.boardTileLayer?.snappedOrigin ?? { x: layout.mazeLeft, y: layout.mazeTop };
  const backing = scene.resolveBoardTileBackingScale?.() ?? 1;
  const toPage = (cell: LegacyPoint): { x: number; y: number } => {
    const [x, y] = centerOfCell(cell, layout.tileSize, backing, origin.x, origin.y);
    const p = matrix.transformPoint(x, y);
    return { x: canvas.left + (p.x * s), y: canvas.top + (p.y * s) };
  };
  const rect = (cell: LegacyPoint | null | undefined): TextCardRect | null => {
    if (!cell) return null;
    const a = toPage(cell);
    const b = toPage({ x: cell.x + 1, y: cell.y });
    return resolveTextCardCellRect(a, Math.abs(b.x - a.x));
  };
  const hud = scene.layout?.lanes?.hud;
  return {
    keepClear: [rect(scene.player), rect(maze.goal), ...resolveTextCardMechanicCells(maze).map(rect)],
    hudBottom: canvas.top + ((hud ? hud.top + hud.height : 0) * s)
  };
};
