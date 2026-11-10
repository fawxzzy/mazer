import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { computeBoardTileLayout, drawBoardMarkers } from '../../src/render/boardTileBake';
import {
  BOARD_TILE_STYLE_PARAM,
  buildRankGrid,
  composeBoardTileReveal,
  isBoardCellRevealed,
  resolveBoardTileStyleFromSearch,
  type BoardRevealContext2D
} from '../../src/render/boardTileLayer';
import { boardMaterial, DEFAULT_BOARD_TILE_STYLE } from '../../src/render/boardTileStyle';
import { PhaserGraphicsTileContext, parseCssRgba } from '../../src/render/phaserTileContext';
import { IRIDESCENT_TRAIL_CORE_STOPS } from '../../src/render/trailIridescence';
import { compositeTrailUnderlay } from '../../src/render/trailLegibility';
import { braidedMazeGrid, contrast, inputFor, wrapDockMaze } from '../render/support/boardTileFixtures';

const MENU_SCENE = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n?/g, '\n');

describe('board tile style flag resolver', () => {
  test('defaults to Chip, and ?tileStyle=trace selects the alternate', () => {
    expect(DEFAULT_BOARD_TILE_STYLE).toBe('chip');
    expect(BOARD_TILE_STYLE_PARAM).toBe('tileStyle');
    expect(resolveBoardTileStyleFromSearch('')).toBe('chip');
    expect(resolveBoardTileStyleFromSearch(null)).toBe('chip');
    expect(resolveBoardTileStyleFromSearch('?tileStyle=chip')).toBe('chip');
    expect(resolveBoardTileStyleFromSearch('?tileStyle=trace')).toBe('trace');
    expect(resolveBoardTileStyleFromSearch('?a=1&tileStyle=trace&b=2')).toBe('trace');
  });

  test('anything unrecognised falls back to Chip, never throws', () => {
    expect(resolveBoardTileStyleFromSearch('?tileStyle=legacy')).toBe('chip');
    expect(resolveBoardTileStyleFromSearch('?tileStyle=')).toBe('chip');
    expect(resolveBoardTileStyleFromSearch('?tileStyle=TRACE')).toBe('chip');
  });
});

describe('rank grid', () => {
  test('rank is the index in the reveal order, -1 for cells not in it, out-of-range cells ignored', () => {
    const ranks = buildRankGrid([{ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }, { x: -1, y: 0 }], 3, 2);
    expect(Array.from(ranks)).toEqual([1, 0, -1, -1, -1, -1]);
  });
});

interface Rect { x: number; y: number; w: number; h: number }

/** Records the reveal composite: clip rects, erase rects and how many images were drawn. */
const createRevealRecorder = () => {
  const events: string[] = [];
  const clip: Rect[] = [];
  const erase: Rect[] = [];
  let mode: 'clip' | 'erase' = 'clip';
  let composite = 'source-over';
  const ctx: BoardRevealContext2D = {
    get globalCompositeOperation() { return composite; },
    set globalCompositeOperation(value: string) { composite = value; },
    fillStyle: '',
    save() { events.push('save'); },
    restore() { events.push('restore'); composite = 'source-over'; },
    setTransform() { events.push('setTransform'); },
    clearRect() { events.push('clearRect'); },
    beginPath() { events.push('beginPath'); mode = composite === 'destination-out' ? 'erase' : 'clip'; },
    rect(x, y, w, h) { (mode === 'erase' ? erase : clip).push({ x, y, w, h }); },
    clip() { events.push('clip'); },
    fill() { events.push('fill'); },
    drawImage() { events.push('drawImage'); }
  };
  return { ctx, events, clip, erase };
};

const floorCells = (grid: boolean[][]): Array<{ x: number; y: number }> => {
  const cells: Array<{ x: number; y: number }> = [];
  grid.forEach((row, y) => row.forEach((on, x) => { if (on) cells.push({ x, y }); }));
  return cells;
};

describe('staged reveal predicate (build AND deconstruct)', () => {
  // Regression: the deconstruct arms rowLimit = null while the tile limit counts DOWN. A null row limit was read as
  // "show everything", so the whole board stayed on screen for the entire dissolve (live app, 2026-11-06).
  test('deconstruct (rowLimit null): only cells ranked below the live tile limit are shown, and it shrinks to nothing', () => {
    const ranks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    let previous = ranks.length + 1;
    for (let limit = ranks.length; limit >= 0; limit -= 1) {
      const shown = ranks.filter((rank) => isBoardCellRevealed(limit, null, rank, rank)).length;
      expect(shown).toBe(limit);
      expect(shown).toBeLessThan(previous);
      previous = shown;
    }
    expect(isBoardCellRevealed(0, null, 3, 0)).toBe(false);
    expect(isBoardCellRevealed(5, null, -1, 0)).toBe(false);
  });

  test('build (rowLimit 0): the tile limit alone decides; unlimited (null tile limit) shows everything', () => {
    expect(isBoardCellRevealed(3, 0, 2, 9)).toBe(true);
    expect(isBoardCellRevealed(3, 0, 3, 9)).toBe(false);
    expect(isBoardCellRevealed(null, 0, -1, 9)).toBe(true);
    expect(isBoardCellRevealed(null, null, 7, 9)).toBe(true);
  });

  test('a live row limit still reveals the rows above it (union with the tile limit)', () => {
    expect(isBoardCellRevealed(2, 5, 9, 4)).toBe(true);
    expect(isBoardCellRevealed(2, 5, 9, 5)).toBe(false);
  });

  test('the scene routes the floor mask AND the marker/player visibility through the same predicate', () => {
    expect(MENU_SCENE).toContain('isBoardCellRevealed(tileLimit, rowLimit,');
    expect(MENU_SCENE).not.toContain('rowLimit === null || y < rowLimit');
    expect(MENU_SCENE).not.toContain('return rowLimit === null || point.y < rowLimit;');
  });
});

describe('rank-based reveal composite', () => {
  const grid = braidedMazeGrid(12, 25, 4242, 12);
  const layout = computeBoardTileLayout(inputFor(grid, { devicePixelRatio: 2 }));
  const floor = floorCells(grid);
  const rankOf = new Map(floor.map((cell, index) => [`${cell.x},${cell.y}`, index]));

  const compose = (limit: number, docksVisible = true) => {
    const rec = createRevealRecorder();
    const stats = composeBoardTileReveal(rec.ctx, {}, {
      layout,
      grid,
      docksVisible,
      isVisible: (x, y) => (rankOf.get(`${x},${y}`) ?? Infinity) < limit
    });
    return { rec, stats };
  };

  test('draws the baked canvas exactly once, clipped, and never per tile', () => {
    for (const limit of [0, 1, 37, floor.length]) {
      const { rec, stats } = compose(limit);
      expect(rec.events.filter((e) => e === 'drawImage')).toHaveLength(1);
      expect(stats.drawImages).toBe(1);
      expect(rec.events.indexOf('clip')).toBeLessThan(rec.events.indexOf('drawImage'));
    }
  });

  test('visible and hidden floor cells partition the floor: row runs cover each exactly once', () => {
    const limit = Math.floor(floor.length / 3);
    const { rec } = compose(limit);
    const tile = layout.tileSize;
    const cellsIn = (rects: Rect[], grow: number): number => rects.reduce((sum, r) => {
      const cols = Math.round((r.w - (2 * grow)) / tile);
      return sum + cols;
    }, 0);
    expect(cellsIn(rec.clip, tile)).toBe(limit);
    expect(cellsIn(rec.erase, 0)).toBe(floor.length - limit);
  });

  test('the reveal is monotonic: a larger limit never shrinks the visible set or grows the hidden set', () => {
    let previousVisible = -1;
    let previousHidden = Number.POSITIVE_INFINITY;
    const tile = layout.tileSize;
    for (const limit of [0, 10, 100, 250, floor.length]) {
      const { rec } = compose(limit);
      const visible = rec.clip.reduce((s, r) => s + Math.round((r.w - (2 * tile)) / tile), 0);
      const hidden = rec.erase.reduce((s, r) => s + Math.round(r.w / tile), 0);
      expect(visible).toBeGreaterThanOrEqual(previousVisible);
      expect(hidden).toBeLessThanOrEqual(previousHidden);
      previousVisible = visible;
      previousHidden = hidden;
    }
    expect(previousVisible).toBe(floor.length);
    expect(previousHidden).toBe(0);
  });

  test('rect count is bounded by the floor cell count (row runs are merged), so the cost is O(rows + runs), not O(draw calls per tile)', () => {
    const { stats } = compose(Math.floor(floor.length / 2));
    expect(stats.clipRects + stats.eraseRects).toBeLessThanOrEqual(floor.length);
    expect(stats.clipRects).toBeLessThan(floor.length);
  });

  test('fully visible with docks shown leaves nothing to erase', () => {
    const { stats } = compose(floor.length);
    expect(stats.eraseRects).toBe(0);
  });

  test('wrap docks are one atomic group: shown adds the four margin strips to the clip, hidden erases them', () => {
    const wrap = wrapDockMaze();
    const dockLayout = computeBoardTileLayout(inputFor(wrap.grid, { docks: wrap.docks }));
    expect(dockLayout.docks.length).toBe(4);
    const shown = createRevealRecorder();
    composeBoardTileReveal(shown.ctx, {}, { layout: dockLayout, grid: wrap.grid, docksVisible: true, isVisible: () => true });
    const hidden = createRevealRecorder();
    composeBoardTileReveal(hidden.ctx, {}, { layout: dockLayout, grid: wrap.grid, docksVisible: false, isVisible: () => true });
    expect(shown.erase).toHaveLength(0);
    expect(hidden.erase).toHaveLength(4);
    const rows = wrap.grid.length;
    expect(shown.clip.length).toBeGreaterThanOrEqual(rows - 1);
    // no docks in the layout: the margin strips are never touched
    const plain = createRevealRecorder();
    composeBoardTileReveal(plain.ctx, {}, { layout, grid, docksVisible: false, isVisible: () => true });
    expect(plain.erase).toHaveLength(0);
  });
});

describe('Phaser graphics adapter for the Chip marker draw code', () => {
  const createGraphicsRecorder = () => {
    const calls: Array<{ op: string; args: number[] }> = [];
    const record = (op: string) => (...args: number[]) => { calls.push({ op, args }); };
    const graphics = {
      beginPath: record('beginPath'),
      closePath: record('closePath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      arc: record('arc'),
      fillStyle: record('fillStyle'),
      lineStyle: record('lineStyle'),
      fillPath: record('fillPath'),
      strokePath: record('strokePath'),
      fillRect: record('fillRect')
    };
    return { graphics: graphics as unknown as import('phaser').GameObjects.Graphics, calls };
  };

  test('parses the rgb()/rgba() strings boardTileBake emits', () => {
    expect(parseCssRgba('rgb(255,128,0)')).toEqual({ color: 0xff8000, alpha: 1 });
    expect(parseCssRgba('rgba(1,2,3,0.5)')).toEqual({ color: 0x010203, alpha: 0.5 });
    expect(parseCssRgba('not a colour').alpha).toBe(1);
  });

  test('drawBoardMarkers paints goal, start and player through it, and the opacity multiplies every alpha', () => {
    const { graphics, calls } = createGraphicsRecorder();
    const context = new PhaserGraphicsTileContext(graphics);
    context.opacity = 0.5;
    const stats = drawBoardMarkers(context, {
      style: 'chip',
      tileSize: 14,
      devicePixelRatio: 2,
      originX: 10,
      originY: 20,
      goal: { x: 3, y: 4 },
      start: { x: 1, y: 1 },
      player: { x: 2, y: 2 }
    });
    expect(stats.paintOps).toBeGreaterThan(0);
    expect(calls.filter((c) => c.op === 'fillPath' || c.op === 'strokePath').length).toBe(stats.paintOps);
    for (const call of calls.filter((c) => c.op === 'fillStyle' || c.op === 'lineStyle')) {
      const alpha = call.args[call.op === 'fillStyle' ? 1 : 2]!;
      expect(alpha).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });

  test('goal marker geometry stays inside its one-tile cell (every path point within the cell box)', () => {
    const { graphics, calls } = createGraphicsRecorder();
    const tile = 14;
    const cell = { x: 5, y: 7 };
    drawBoardMarkers(new PhaserGraphicsTileContext(graphics), { style: 'chip', tileSize: tile, devicePixelRatio: 1, goal: cell });
    const points = calls.filter((c) => c.op === 'moveTo' || c.op === 'lineTo');
    expect(points.length).toBeGreaterThan(5);
    for (const p of points) {
      expect(p.args[0]!).toBeGreaterThanOrEqual(cell.x * tile - 1e-6);
      expect(p.args[0]!).toBeLessThanOrEqual((cell.x + 1) * tile + 1e-6);
      expect(p.args[1]!).toBeGreaterThanOrEqual(cell.y * tile - 1e-6);
      expect(p.args[1]!).toBeLessThanOrEqual((cell.y + 1) * tile + 1e-6);
    }
  });

  test('arcTo emits a shorter-sweep corner arc that ends on the second tangent point', () => {
    const { graphics, calls } = createGraphicsRecorder();
    const context = new PhaserGraphicsTileContext(graphics);
    context.moveTo(0, 10);
    context.lineTo(10, 10);
    context.arcTo(20, 10, 20, 20, 5);
    const arc = calls.find((c) => c.op === 'arc')!;
    const [cx, cy, radius, start, end, ccw] = arc.args;
    expect(radius).toBe(5);
    expect([cx, cy]).toEqual([15, 15]);
    // from the tangent (15,10) to the tangent (20,15): a quarter turn clockwise on screen (y down)
    expect(Math.cos(start!) * 5 + cx!).toBeCloseTo(15);
    expect(Math.sin(end!) * 5 + cy!).toBeCloseTo(15);
    expect(Boolean(ccw)).toBe(false);
  });
});

describe('trail on the Chip floor (amendment open item A8)', () => {
  // The full contrast pins (every iridescent hue against chip / rim / gap, width floors) live in
  // tests/reset/trail-iridescence.test.ts and tests/reset/marker-trail-legibility.test.ts; this keeps the
  // original A8 intent: the dark underlay is what holds the contrast, on every floor.
  test('every resting trail core stop clears 3:1 against the chip, and 4.5:1 under the dark underlay', () => {
    const underlaid = compositeTrailUnderlay(boardMaterial.chip);
    for (const stop of IRIDESCENT_TRAIL_CORE_STOPS) {
      expect(contrast(stop, boardMaterial.chip), `0x${stop.toString(16)} bare`).toBeGreaterThanOrEqual(3);
      expect(contrast(stop, underlaid), `0x${stop.toString(16)}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('end (goal) marker', () => {
  test('the goal star keeps its contrast on its dark keyline (it is only ~1.8:1 on the bare chip, so there is no backdrop and the keyline carries it)', () => {
    expect(contrast(boardMaterial.goal, boardMaterial.void)).toBeGreaterThanOrEqual(3);
    expect(contrast(boardMaterial.void, boardMaterial.chip)).toBeGreaterThanOrEqual(3);
    expect(contrast(boardMaterial.start, boardMaterial.void)).toBeGreaterThanOrEqual(3);
    // the start's gold also clears 3:1 on the chip by itself
    expect(contrast(boardMaterial.start, boardMaterial.chip)).toBeGreaterThanOrEqual(3);
    console.info(`END_MARKER_CONTRAST goal on chip ${contrast(boardMaterial.goal, boardMaterial.chip).toFixed(2)}, goal on keyline ${contrast(boardMaterial.goal, boardMaterial.void).toFixed(2)}, start on chip ${contrast(boardMaterial.start, boardMaterial.chip).toFixed(2)}, start on keyline ${contrast(boardMaterial.start, boardMaterial.void).toFixed(2)}`);
  });

  test('the glyph stays inside the one-cell footprint (a standalone cell is an isolated chip: a disc)', () => {
    const calls: Array<{ op: string; args: number[] }> = [];
    const rec = (op: string) => (...args: number[]) => { calls.push({ op, args }); };
    const graphics = {
      beginPath: rec('beginPath'), closePath: rec('closePath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
      arc: rec('arc'), fillStyle: rec('fillStyle'), lineStyle: rec('lineStyle'), fillPath: rec('fillPath'),
      strokePath: rec('strokePath'), fillRect: rec('fillRect')
    } as unknown as import('phaser').GameObjects.Graphics;
    drawBoardMarkers(new PhaserGraphicsTileContext(graphics), { style: 'chip', tileSize: 14, devicePixelRatio: 2, goal: { x: 2, y: 3 } });
    const pathPoints = calls.filter((c) => c.op === 'moveTo' || c.op === 'lineTo');
    // no disc, no ring, no pad: the star is the only path
    expect(calls.filter((c) => c.op === 'arc')).toHaveLength(0);
    expect(pathPoints.length).toBeGreaterThanOrEqual(10);
    for (const p of pathPoints) {
      expect(p.args[0]!).toBeGreaterThanOrEqual(2 * 14 - 1e-6);
      expect(p.args[0]!).toBeLessThanOrEqual(3 * 14 + 1e-6);
      expect(p.args[1]!).toBeGreaterThanOrEqual(3 * 14 - 1e-6);
      expect(p.args[1]!).toBeLessThanOrEqual(4 * 14 + 1e-6);
    }
  });

  test('the layer hands the scene the start and goal tiles of its own bake, and the start arrow direction (the first step of the solution path)', () => {
    const layerSource = readFileSync(resolve(process.cwd(), 'src/render/boardTileLayer.ts'), 'utf8');
    expect(layerSource).toContain('computeChipTileAt(input, frame.start)');
    expect(layerSource).toContain('computeChipTileAt(input, frame.goal)');
    expect(layerSource).toContain('resolveStartDirection(frame.grid, frame.start, frame.goal)');
    expect(layerSource).toContain('get endpointTiles()');
  });

  test('the scene paints the end markers from those tiles, in one pass over the trail (no pad under it)', () => {
    const fn = MENU_SCENE.slice(MENU_SCENE.indexOf('private fillPlayDynamicMarkerTile('));
    const body = fn.slice(0, fn.indexOf('// Retired: drawLegacyMarkerGemCatchlight'));
    expect(body).toContain('this.boardTileLayer.endpointTiles');
    expect(body).toContain('startTile: endpointTiles.start');
    expect(body).toContain('goalTile: endpointTiles.goal');
    expect(body).toContain('drawBoardMarkers(context, markerInput);');
    expect(body).not.toContain('endpointLayer');
    // the goal glyph yields to the player standing on it (the keyline would otherwise poke out as dark spikes)
    expect(body).toContain("kind === 'goal' && this.player.x === point.x && this.player.y === point.y");
    expect(body).not.toContain("drawBoardMarkers(underContext");
  });
});
