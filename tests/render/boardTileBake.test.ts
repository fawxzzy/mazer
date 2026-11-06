import { describe, expect, test } from 'vitest';
import {
  BOARD_TILE_BAKE_VERSION,
  bakeBoardTiles,
  computeBoardTileBakeHash,
  computeBoardTileLayout,
  computeChipGeometry,
  computeWallSockets,
  createBoardTileBakeCache,
  drawBoardMarkers,
  slotBlocker,
  slotGate,
  slotPatrol,
  type BoardTileBakeInput
} from '../../src/render/boardTileBake';
import {
  BOARD_CHIP_FILL,
  BOARD_TILE_GEOMETRY,
  boardMaterial,
  cssRgb,
  cssRgba,
  resolveBoardTileStyle
} from '../../src/render/boardTileStyle';
import {
  braidedMazeGrid,
  contrast,
  corridorGrid,
  countPaintOps,
  createRecordingContext,
  createRecordingSurface,
  emptyGrid,
  inputFor,
  wrapDockMaze
} from './support/boardTileFixtures';

const bake = (input: BoardTileBakeInput) => {
  const surface = createRecordingSurface();
  const result = bakeBoardTiles(input, surface.factory);
  return { result, rec: surface.rec, surface };
};

const maze = braidedMazeGrid();

describe('bakeBoardTiles basics', () => {
  test('rejects a grid whose size disagrees with width/height, and a non-positive tile size', () => {
    expect(() => bake({ ...inputFor(corridorGrid()), width: 3 })).toThrow(RangeError);
    expect(() => bake({ ...inputFor(corridorGrid()), tileSize: 0 })).toThrow(RangeError);
  });

  test('creates one device-sized surface and returns canvas, size, scale and hash', () => {
    const { result, surface } = bake(inputFor(maze));
    expect(surface.calls).toHaveLength(1);
    expect(surface.calls[0]).toEqual([result.pixelWidth, result.pixelHeight]);
    expect(result.canvas).toEqual({ w: result.pixelWidth, h: result.pixelHeight });
    expect(result.scale).toBe(2);
    expect(result.pixelWidth).toBe(Math.round(result.width * 2));
    expect(result.hash).toMatch(/^[0-9a-f]{14}$/);
    expect(result.style).toBe('chip');
    expect(BOARD_TILE_BAKE_VERSION).toContain('board-tile-bake');
  });
});

describe('determinism and rebuild skipping', () => {
  test('same input gives an identical draw list and hash, for both styles', () => {
    for (const style of ['chip', 'trace'] as const) {
      const a = bake(inputFor(maze, { style }));
      const b = bake(inputFor(maze, { style }));
      expect(a.rec.log).toEqual(b.rec.log);
      expect(a.result.hash).toBe(b.result.hash);
      expect(a.result.stats).toEqual(b.result.stats);
    }
  });

  test('the draw list never depends on Math.random or Date.now', () => {
    const realRandom = Math.random;
    const realNow = Date.now;
    Math.random = () => { throw new Error('Math.random used'); };
    Date.now = () => { throw new Error('Date.now used'); };
    try {
      expect(() => bake(inputFor(maze))).not.toThrow();
      expect(() => bake(inputFor(maze, { style: 'trace' }))).not.toThrow();
    } finally {
      Math.random = realRandom;
      Date.now = realNow;
    }
  });

  test('hash changes with style, dpr, tile size, grid and docks but not with reducedMotion', () => {
    const base = computeBoardTileBakeHash(inputFor(maze));
    expect(computeBoardTileBakeHash(inputFor(maze, { style: 'trace' }))).not.toBe(base);
    expect(computeBoardTileBakeHash(inputFor(maze, { devicePixelRatio: 3 }))).not.toBe(base);
    expect(computeBoardTileBakeHash(inputFor(maze, { tileSize: 15 }))).not.toBe(base);
    const flipped = maze.map((row) => [...row]);
    flipped[0]![0] = !flipped[0]![0];
    expect(computeBoardTileBakeHash(inputFor(flipped))).not.toBe(base);
    expect(computeBoardTileBakeHash(inputFor(maze, { docks: [{ x: 1, y: 1, side: 'left' }] }))).not.toBe(base);
    expect(computeBoardTileBakeHash(inputFor(maze, { reducedMotion: true }))).toBe(base);
    expect(computeBoardTileBakeHash(inputFor(maze, { style: 'chip' }))).toBe(base);
  });

  test('cache skips the rebuild when nothing changed and rebuilds when something did', () => {
    const cache = createBoardTileBakeCache<{ w: number; h: number }>();
    const s = createRecordingSurface();
    const first = cache.bake(inputFor(maze), s.factory);
    const second = cache.bake(inputFor(maze, { reducedMotion: true }), s.factory);
    const third = cache.bake(inputFor(maze, { style: 'trace' }), s.factory);
    expect([first.rebuilt, second.rebuilt, third.rebuilt]).toEqual([true, false, true]);
    expect(second.result).toBe(first.result);
    expect(s.calls).toHaveLength(2);
    expect(cache.current).toBe(third.result);
    cache.clear();
    expect(cache.current).toBeNull();
  });

  test('reduced motion is a no-op for the bake (identical draw list)', () => {
    const a = bake(inputFor(maze));
    const b = bake(inputFor(maze, { reducedMotion: true }));
    expect(b.rec.log).toEqual(a.rec.log);
  });

  test('switching style changes the draw list', () => {
    const chip = bake(inputFor(maze, { style: 'chip' }));
    const trace = bake(inputFor(maze, { style: 'trace' }));
    expect(trace.rec.log).not.toEqual(chip.rec.log);
    expect(trace.result.style).toBe('trace');
    expect(trace.rec.log.some((e) => e.startsWith('set shadowBlur'))).toBe(false);
    expect(chip.rec.log.some((e) => e.startsWith('set shadowBlur'))).toBe(true);
  });
});

describe('seam-free joins (chip)', () => {
  test.each([[1, 14], [2, 14], [3, 14], [3, 14.5], [2, 13.3], [3, 26.37]])(
    'adjacent floor tiles abut exactly with no inset across the join (dpr %f, tile %f)',
    (dpr, tileSize) => {
      const tiles = computeChipGeometry(inputFor(maze, { devicePixelRatio: dpr, tileSize }));
      const at = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
      let joins = 0;
      for (const t of tiles) {
        const right = at.get(`${t.x + 1},${t.y}`);
        if (right) {
          joins += 1;
          expect(t.open.r && right.open.l).toBe(true);
          expect(t.left + t.width).toBe(right.left);
          expect(t.fill.left + t.fill.width).toBe(t.left + t.width);
          expect(right.fill.left).toBe(right.left);
          expect(t.radii[1]).toBe(0);
          expect(t.radii[2]).toBe(0);
          expect(right.radii[0]).toBe(0);
          expect(right.radii[3]).toBe(0);
        }
        const down = at.get(`${t.x},${t.y + 1}`);
        if (down) {
          joins += 1;
          expect(t.open.d && down.open.u).toBe(true);
          expect(t.top + t.height).toBe(down.top);
          expect(t.fill.top + t.fill.height).toBe(t.top + t.height);
          expect(down.fill.top).toBe(down.top);
          expect(t.radii[2]).toBe(0);
          expect(t.radii[3]).toBe(0);
          expect(down.radii[0]).toBe(0);
          expect(down.radii[1]).toBe(0);
        }
      }
      expect(joins).toBeGreaterThan(300);
    }
  );

  test('every coordinate sits on the device-pixel grid', () => {
    for (const dpr of [1, 2, 3]) {
      const tiles = computeChipGeometry(inputFor(maze, { devicePixelRatio: dpr, tileSize: 14.5 }));
      for (const t of tiles) {
        for (const v of [t.left, t.top, t.width, t.height, t.fill.left, t.fill.top, t.fill.width, t.fill.height]) {
          expect(Math.abs(v * dpr - Math.round(v * dpr)), `dpr ${dpr}`).toBeLessThan(1e-6);
        }
      }
    }
  });

  test('a straight corridor is one gapless ribbon: contiguous outer rects, no rounding mid-run', () => {
    const tiles = computeChipGeometry(inputFor(corridorGrid(), { devicePixelRatio: 3, tileSize: 14.5 }));
    expect(tiles).toHaveLength(51);
    for (let i = 1; i < tiles.length; i += 1) {
      const prev = tiles[i - 1]!;
      expect(prev.top + prev.height).toBe(tiles[i]!.top);
      expect(prev.left).toBe(tiles[i]!.left);
      expect(prev.width).toBe(tiles[i]!.width);
    }
    for (const t of tiles.slice(1, -1)) {
      expect(t.kind).toBe('straight');
      expect(t.radii).toEqual([0, 0, 0, 0]);
    }
  });

  test('concave corners (both neighbours open, diagonal wall) get a rim patch; convex ones do not', () => {
    // T-shape: row 1 is a full bar, column 1 continues down.
    const g = emptyGrid(3, 3);
    g[1]![0] = true; g[1]![1] = true; g[1]![2] = true; g[2]![1] = true;
    const tiles = computeChipGeometry(inputFor(g, { tileSize: 20, devicePixelRatio: 2 }));
    const junction = tiles.find((t) => t.x === 1 && t.y === 1)!;
    expect(junction.kind).toBe('junction');
    expect(junction.concave).toEqual({ tl: false, tr: false, br: true, bl: true });
    const bar = tiles.find((t) => t.x === 0 && t.y === 1)!;
    expect(bar.kind).toBe('cap');
  });
});

describe('dead-end caps, junction nodes, dots', () => {
  test('dead ends are fully round on the closed end and flat on the open side', () => {
    const g = emptyGrid(3, 1);
    g[0]![0] = true; g[0]![1] = true; g[0]![2] = true;
    const tiles = computeChipGeometry(inputFor(g, { tileSize: 16, devicePixelRatio: 2 }));
    const style = resolveBoardTileStyle('chip', 16, 2);
    expect(tiles[0]!.kind).toBe('cap');
    expect(tiles[0]!.radii).toEqual([style.capRadius, 0, 0, style.capRadius]);
    expect(tiles[2]!.radii).toEqual([0, style.capRadius, style.capRadius, 0]);
    expect(tiles[1]!.radii).toEqual([0, 0, 0, 0]);
    expect(style.capRadius).toBe(8);
    expect(tiles[0]!.width / 2).toBe(style.capRadius);
  });

  test('an isolated tile becomes a disc', () => {
    const g = emptyGrid(3, 3);
    g[1]![1] = true;
    const [t] = computeChipGeometry(inputFor(g, { tileSize: 16, devicePixelRatio: 2 }));
    expect(t!.kind).toBe('isolated');
    expect(t!.radii.every((r) => r === 8)).toBe(true);
  });

  test('junction nodes sit in their own pass; one circle per floor tile (tiles under 10 px have no sockets)', () => {
    const input = inputFor(maze, { tileSize: 8, start: { x: 1, y: 1 }, goal: { x: 23, y: 49 } });
    const { rec, result } = bake(input);
    const tiles = computeChipGeometry(input);
    const rest = tiles.filter((t) => !(t.x === 1 && t.y === 1) && !(t.x === 23 && t.y === 49));
    expect(rest.filter((t) => t.degree >= 3).length).toBeGreaterThan(10);
    expect(result.stats.sockets).toBe(0);
    expect(rec.count('arc(')).toBe(rest.length);
    expect(rec.log).toContain(`set fillStyle=${cssRgba(boardMaterial.rim, BOARD_TILE_GEOMETRY.junctionNodeAlpha)}`);
    expect(rec.log).toContain(`set fillStyle=${cssRgba(boardMaterial.rim, BOARD_TILE_GEOMETRY.padDotAlpha)}`);
  });

  test('start and goal cells get no pad dot or node so the markers stay clean', () => {
    const withMarkers = bake(inputFor(corridorGrid(), { start: { x: 12, y: 0 }, goal: { x: 12, y: 50 }, tileSize: 8 }));
    const without = bake(inputFor(corridorGrid(), { start: undefined, goal: undefined, tileSize: 8 }));
    expect(withMarkers.rec.count('arc(')).toBe(without.rec.count('arc(') - 2);
  });

  test('trace draws junction rings and dead-end pads', () => {
    const g = emptyGrid(3, 3);
    g[1]![0] = true; g[1]![1] = true; g[1]![2] = true; g[2]![1] = true;
    const { rec } = bake(inputFor(g, { style: 'trace', tileSize: 8, start: undefined, goal: undefined }));
    // 1 junction ring (fill + stroke path) + 3 dead-end pads (fill + ring path)
    expect(rec.count('arc(')).toBe(1 + 1 + 3 + 3);
    expect(rec.log).toContain(`set strokeStyle=${cssRgba(boardMaterial.rim, resolveBoardTileStyle('trace', 8, 2).trace.deadEndRingAlpha)}`);
  });
});

describe('line widths snapped to device pixels', () => {
  test.each([1, 2, 3])('every stroked line width is a whole number of device px, at least 1, at DPR %i (both styles, markers included)', (dpr) => {
    const { grid, docks } = wrapDockMaze();
    for (const style of ['chip', 'trace'] as const) {
      const { rec } = bake(inputFor(grid, { style, devicePixelRatio: dpr, docks }));
      const mrec = createRecordingContext();
      drawBoardMarkers(mrec.ctx, {
        style, tileSize: 14, devicePixelRatio: dpr, start: { x: 1, y: 1 }, goal: { x: 5, y: 5 }, player: { x: 3.5, y: 3 }
      });
      // chip floor is fill-only (its rim width is covered by the geometry snapping tests); trace strokes
      if (style === 'trace') expect(rec.strokeWidths.length).toBeGreaterThan(0);
      expect(mrec.strokeWidths.length).toBeGreaterThan(0);
      for (const w of [...rec.strokeWidths, ...mrec.strokeWidths]) {
        expect(w * dpr, `${style} dpr${dpr}`).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(Math.abs(w * dpr - Math.round(w * dpr))).toBeLessThan(1e-9);
      }
    }
  });
});

describe('docks', () => {
  const { grid, docks } = wrapDockMaze();

  test('four docks resolve and the surface grows only on the sides that have one', () => {
    const layout = computeBoardTileLayout(inputFor(grid, { docks, devicePixelRatio: 2 }));
    const style = resolveBoardTileStyle('chip', 14, 2);
    expect(layout.docks).toHaveLength(4);
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      expect(layout.margin[side]).toBeGreaterThanOrEqual(style.dock.defaultLength);
    }
    const plain = computeBoardTileLayout(inputFor(grid, { devicePixelRatio: 2 }));
    expect(plain.margin.left).toBe(BOARD_TILE_GEOMETRY.bakeEdgePadCss);
    expect(layout.originX).toBe(layout.margin.left);
    expect(layout.width).toBe(layout.margin.left + layout.boardWidth + layout.margin.right);
  });

  test('chip dock: four diminishing slices (0.9, 0.55, 0.28, 0.14) and one lintel bar per dock', () => {
    const { rec } = bake(inputFor(grid, { docks, devicePixelRatio: 2 }));
    const alphas = rec.log.filter((e) => e.startsWith('set globalAlpha=')).map((e) => Number(e.split('=')[1]));
    expect(alphas.filter((a) => a < 1)).toEqual(Array.from({ length: 4 }, () => [0.9, 0.55, 0.28, 0.14]).flat());
    expect(rec.log.filter((e) => e.startsWith('fillRect('))).toHaveLength(4);
  });

  test('lintel bars sit flush outside the board edge on each side', () => {
    const { rec, result } = bake(inputFor(grid, { docks, devicePixelRatio: 2 }));
    const t = resolveBoardTileStyle('chip', 14, 2).dock.lintel;
    const bars = rec.log.filter((e) => e.startsWith('fillRect(')).map((e) => e.slice(9, -1).split(',').map(Number) as [number, number, number, number]);
    expect(bars.some(([x, , w]) => x === -t && w === t)).toBe(true);
    expect(bars.some(([x, , w]) => x === result.boardWidth && w === t)).toBe(true);
    expect(bars.some(([, y, , h]) => y === -t && h === t)).toBe(true);
    expect(bars.some(([, y, , h]) => y === result.boardHeight && h === t)).toBe(true);
  });

  test('trace docks are dotted stubs with a threshold node (no chip slices, no lintel)', () => {
    const { rec, result } = bake(inputFor(grid, { docks, style: 'trace', devicePixelRatio: 2 }));
    expect(rec.count('fillRect(')).toBe(0);
    expect(result.stats.docks).toBe(4);
    expect(rec.count('arc(')).toBeGreaterThan(8);
  });

  test('descriptors that are off-edge, on a wall, or duplicated are ignored', () => {
    const layout = computeBoardTileLayout(inputFor(grid, {
      docks: [{ x: 5, y: 5, side: 'left' }, { x: 0, y: 0, side: 'left' }, ...docks, ...docks]
    }));
    expect(layout.docks).toHaveLength(4);
  });

  test('explicit lengthPx grows the margin', () => {
    const d = docks[0]!;
    const layout = computeBoardTileLayout(inputFor(grid, { docks: [{ ...d, lengthPx: 60 }] }));
    expect(layout.margin[d.side]).toBeGreaterThanOrEqual(60);
  });

  test('the dock cell is open toward the dock, so its edge has no rim or rounding there', () => {
    const d = docks.find((x) => x.side === 'left')!;
    const tile = computeChipGeometry(inputFor(grid, { docks })).find((t) => t.x === d.x && t.y === d.y)!;
    expect(tile.open.l).toBe(true);
    expect(tile.fill.left).toBe(tile.left);
    expect(tile.radii[0]).toBe(0);
    expect(tile.radii[3]).toBe(0);
  });
});

describe('wall sockets are cheap and capped', () => {
  test('sockets only sit on wall cells next to the path', () => {
    const sockets = computeWallSockets(inputFor(maze));
    expect(sockets.length).toBeGreaterThan(0);
    for (const s of sockets) {
      expect(maze[s.y]![s.x]).toBe(false);
      let near = false;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) near = near || maze[s.y + dy]?.[s.x + dx] === true;
      expect(near).toBe(true);
    }
  });

  test('a checkerboard with far more candidates than the cap is clamped, evenly and deterministically', () => {
    const big = emptyGrid(60, 60).map((row, y) => row.map((_, x) => (x + y) % 2 === 0));
    const a = computeWallSockets(inputFor(big));
    expect(a).toHaveLength(BOARD_TILE_GEOMETRY.socketCap);
    expect(a).toEqual(computeWallSockets(inputFor(big)));
    expect(new Set(a.map((s) => `${s.x},${s.y}`)).size).toBe(a.length);
    expect(a[a.length - 1]!.y).toBeGreaterThan(50);
  });

  test('all sockets are painted in one path and tiles under the minimum size get none', () => {
    const { rec, result } = bake(inputFor(maze, { start: undefined, goal: undefined }));
    expect(result.stats.sockets).toBeGreaterThan(0);
    expect(result.stats.sockets).toBeLessThanOrEqual(BOARD_TILE_GEOMETRY.socketCap);
    expect(computeWallSockets(inputFor(maze, { tileSize: 9 }))).toEqual([]);
    const firstFill = rec.log.findIndex((e) => e === 'fill()');
    expect(rec.log.slice(0, firstFill).filter((e) => e.startsWith('arc(')).length).toBe(result.stats.sockets);
  });
});

describe('bounded draw calls', () => {
  const cases: Array<[string, () => { grid: boolean[][]; docks?: BoardTileBakeInput['docks'] }]> = [
    ['25x51 braided maze', () => ({ grid: maze })],
    ['51-tile corridor', () => ({ grid: corridorGrid() })],
    ['25x51 maze with 4 docks', () => ({ grid: wrapDockMaze().grid, docks: wrapDockMaze().docks })]
  ];
  const report: Array<Record<string, unknown>> = [];

  test.each(cases)('%s stays bounded for both styles and stats match the recorded calls', (name, make) => {
    const { grid, docks } = make();
    for (const style of ['chip', 'trace'] as const) {
      const { rec, result } = bake(inputFor(grid, { style, docks }));
      const paint = countPaintOps(rec);
      expect(result.stats.paintOps).toBe(paint);
      expect(rec.count('save(') + rec.count('restore(')).toBeLessThanOrEqual(4);
      // raster ops do not scale with board size: a handful of union fills/strokes plus a few per dock
      expect(paint).toBeLessThanOrEqual(style === 'chip' ? 12 + 9 * result.stats.docks : 30 + 12 * result.stats.docks);
      expect(result.stats.pathOps).toBeLessThanOrEqual(result.stats.floorTiles * 40 + result.stats.sockets * 2 + 200);
      expect(rec.log.some((e) => e.includes('Gradient'))).toBe(false);
      report.push({
        scene: name, style, floorTiles: result.stats.floorTiles, sockets: result.stats.sockets,
        docks: result.stats.docks, paintOps: paint, pathOps: result.stats.pathOps,
        stateOps: result.stats.stateOps, loggedCalls: rec.log.length
      });
    }
  });

  test('report', () => {
    console.info(`BOARD_TILE_BAKE_DRAW_COUNTS ${JSON.stringify(report)}`);
    expect(report.length).toBeGreaterThan(0);
  });
});

describe('markers', () => {
  const draw = (extra: Partial<Parameters<typeof drawBoardMarkers>[1]> = {}) => {
    const rec = createRecordingContext();
    const stats = drawBoardMarkers(rec.ctx, {
      style: 'chip', tileSize: 14, devicePixelRatio: 2, start: { x: 1, y: 1 }, goal: { x: 9, y: 9 }, player: { x: 4, y: 4 }, ...extra
    });
    return { rec, stats };
  };

  test('draws with bounded work, no gradient and no shadow, for both styles', () => {
    for (const style of ['chip', 'trace'] as const) {
      const { rec, stats } = draw({ style });
      expect(stats.paintOps).toBeLessThanOrEqual(16);
      expect(stats.paintOps).toBe(countPaintOps(rec));
      expect(rec.count('save(')).toBe(1);
      expect(rec.count('restore(')).toBe(1);
      expect(rec.log.some((e) => e.includes('Gradient') || e.startsWith('set shadowBlur'))).toBe(false);
    }
  });

  test('chip player: dark keyline first, mint edge, then the green core', () => {
    const { rec } = draw({ start: undefined, goal: undefined });
    expect(rec.log.filter((e) => e.startsWith('set fillStyle='))).toEqual([
      `set fillStyle=${cssRgb(boardMaterial.void)}`,
      `set fillStyle=${cssRgb(boardMaterial.playerEdge)}`,
      `set fillStyle=${cssRgb(boardMaterial.player)}`
    ]);
  });

  test('chip goal: goal-coloured end pad, dark disc badge, lit ring and a star in the danger colour', () => {
    const { rec } = draw({ start: undefined, player: undefined });
    expect(rec.log).toContain(`set fillStyle=${cssRgb(boardMaterial.void)}`);
    expect(rec.log).toContain(`set fillStyle=${cssRgb(boardMaterial.goal)}`);
    // Chip wiring (2026-11-06) added the end pad (the cell's inscribed circle, goal colour at goalWashAlpha)
    // under the badge so the goal cell reads at board scale: three arcs now (pad, badge, ring), was two.
    expect(rec.log).toContain(`set fillStyle=${cssRgba(boardMaterial.goal, BOARD_TILE_GEOMETRY.marker.goalWashAlpha)}`);
    expect(rec.count('arc(')).toBe(3);
  });

  test('chip start: gold corner brackets in one stroked path', () => {
    const { rec } = draw({ goal: undefined, player: undefined });
    expect(rec.log).toContain(`set strokeStyle=${cssRgb(boardMaterial.start)}`);
    expect(rec.count('stroke(')).toBe(1);
    expect(rec.count('moveTo(')).toBe(4 + 1);
  });

  test('start marker is skipped while the player stands on it', () => {
    const on = draw({ player: { x: 1, y: 1 }, goal: undefined });
    const off = draw({ player: { x: 2, y: 1 }, goal: undefined });
    expect(on.rec.log.some((e) => e.includes(cssRgb(boardMaterial.start)))).toBe(false);
    expect(off.rec.log.some((e) => e.includes(cssRgb(boardMaterial.start)))).toBe(true);
  });

  test('reduced motion pins the phase: it is a no-op, while otherwise phase modulates the goal ring', () => {
    const still = draw({ phase: 0 });
    expect(draw({ phase: 0.8, reducedMotion: true }).rec.log).toEqual(still.rec.log);
    expect(draw({ phase: 0.8 }).rec.log).not.toEqual(still.rec.log);
  });

  test('is deterministic', () => {
    expect(draw().rec.log).toEqual(draw().rec.log);
    expect(draw({ style: 'trace' }).rec.log).toEqual(draw({ style: 'trace' }).rec.log);
    expect(draw({ style: 'trace' }).rec.log).not.toEqual(draw().rec.log);
  });

  test('marker contrast against the chip fill (WCAG >= 3:1)', () => {
    const chip = BOARD_CHIP_FILL;
    const rows: Array<[string, number, number]> = [
      ['player', boardMaterial.player, chip],
      ['start', boardMaterial.start, chip],
      ['trail', boardMaterial.trailReference, chip],
      ['goal badge', boardMaterial.void, chip],
      ['goal star on badge', boardMaterial.goal, boardMaterial.void],
      ['goal ring', boardMaterial.rim, chip]
    ];
    console.info(`BOARD_TILE_CONTRAST ${rows.map(([n, f, b]) => `${n}: ${contrast(f, b).toFixed(2)}`).join(' | ')}`);
    for (const [name, fg, bg] of rows) {
      expect(contrast(fg, bg), name).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('reserved hazard slots draw nothing', () => {
  const input = { cell: { x: 3, y: 4 }, tileSize: 14, devicePixelRatio: 2, originX: 10, originY: 20 };

  test('blocker, gate and patrol never touch the context and report drawn=false', () => {
    const rec = createRecordingContext();
    const slots = [slotBlocker(rec.ctx, input), slotGate(rec.ctx, input), slotPatrol(rec.ctx, input)];
    expect(rec.log).toEqual([]);
    expect(slots.map((s) => s.kind)).toEqual(['blocker', 'gate', 'patrol']);
    for (const slot of slots) {
      expect(slot.drawn).toBe(false);
      expect(slot.cell).toEqual({ x: 3, y: 4 });
      expect(slot.rect.width).toBeCloseTo(14, 5);
      expect(slot.rect.x).toBe(10 + 42);
      expect(slot.rect.y).toBe(20 + 56);
      expect(slot.requires.length).toBeGreaterThan(0);
    }
  });

  test('slots accept a null context and are deterministic', () => {
    expect(slotGate(null, input)).toEqual(slotGate(null, input));
    expect(Object.keys(slotGate(null, input).parts)).toEqual(['bar', 'ticks']);
    expect(Object.keys(slotPatrol(null, input).parts)).toEqual(['body', 'facing', 'lane']);
    expect(Object.keys(slotBlocker(null, input).parts)).toEqual(['hatch']);
  });
});
