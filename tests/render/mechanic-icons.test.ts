import { describe, expect, test, vi } from 'vitest';
import { MenuScene } from '../../src/scenes/MenuScene';
import {
  DEFAULT_MECHANIC_ICON_ENV,
  MECHANIC_ICON_ACCENT,
  MECHANIC_ICON_BADGE,
  MECHANIC_ICON_IDS,
  drawMechanicIcon,
  drawMechanicIconBadge,
  drawMechanicIconGlyph,
  paintMechanicIconCanvas,
  resolveHazardGlyphMechanicIcon,
  resolveMechanicIconAccentCss,
  type MechanicIconEnv,
  type MechanicIconId
} from '../../src/render/mechanicIcons';
import { CanvasIconGraphics, createIconLineContext, toIconRgba, type IconGraphics } from '../../src/render/iconGraphics';
import { drawLegacyGuideRowIcon, resolveLegacyGuideMechanicIcon } from '../../src/legacy-runtime/legacyGuideIconRoute';
import { LEGACY_GUIDE_HAZARD_ROWS, LEGACY_GUIDE_ROWS, type LegacyGuideRow } from '../../src/legacy-runtime/legacyGuideContent';
import { LEGACY_GUIDE_SHEET_SIZES } from '../../src/legacy-runtime/legacyGuideSheetPlan';
import { BOARD_TILE_STYLE_IDS, resolveBoardSwatchColors } from '../../src/render/boardTileStyle';
import { drawBoardMarkers } from '../../src/render/boardTileBake';
import { drawChipCell, resolveChipGridGeometry } from '../../src/render/chipTileGraphics';
import { drawHazardGatesToCanvasContext } from '../../src/render/hazardGateLayer';
import { PhaserGraphicsTileContext } from '../../src/render/phaserTileContext';
import { drawShardCageRing, drawShardGem, resolveShardCageDotRadius, SHARD_LOOK } from '../../src/render/shardLook';
import { designTokens, phaserMaterialAliases } from '../../src/theme/tokens';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)), Linear: (a: number, b: number, t: number) => a + ((b - a) * t) },
    Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
    Scene: class {}
  }
}));

// The ONE icon registry (src/render/mechanicIcons.ts) is pinned two ways:
//  1. against MenuScene's own Guide draw (the REAL prototype method on a stub scene): goal, start, player, trail, wrap
//     and switch produce the identical Graphics call stream, so the Guide rows routed through the registry are
//     pixel-identical to what shipped;
//  2. against a direct call of the board painter for the icons that are new (tile, shard, locked star, Pulse Gate).

type Call = [string, ...unknown[]];

const round = (value: unknown): unknown => {
  if (typeof value === 'number') return Math.round(value * 1e6) / 1e6;
  if (Array.isArray(value)) return value.map(round);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, round(v)]));
  }
  return value;
};

const createRecorder = (): { g: IconGraphics; calls: Call[] } => {
  const calls: Call[] = [];
  const g = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      return (...args: unknown[]) => {
        calls.push([prop, ...args.map(round)]);
        return g;
      };
    }
  }) as IconGraphics;
  return { g, calls };
};

const record = (draw: (g: IconGraphics) => void): Call[] => {
  const { g, calls } = createRecorder();
  draw(g);
  return calls;
};

const BADGE_RADIUS = LEGACY_GUIDE_SHEET_SIZES.badgeSize / 2;
const allGuideRows = (): LegacyGuideRow[] => [...LEGACY_GUIDE_ROWS, ...LEGACY_GUIDE_HAZARD_ROWS];
const guideRow = (glyph: string): LegacyGuideRow => allGuideRows().find((r) => r.icon.glyph === glyph)!;

const createSceneStub = (env: MechanicIconEnv): Record<string, unknown> => {
  const scene = Object.create(MenuScene.prototype) as Record<string, unknown>;
  Object.assign(scene, {
    boardTileStyle: env.boardTileStyle,
    resolveBoardTileBackingScale: () => env.devicePixelRatio
  });
  return scene;
};

const sceneGuideIcon = (scene: Record<string, unknown>) => (MenuScene.prototype as unknown as {
  drawLegacyGuideIcon: (icon: unknown, x: number, y: number, accent: number, g: unknown) => void;
}).drawLegacyGuideIcon.bind(scene);

describe('Guide rows routed through the registry are the scene draw, call for call', () => {
  const pinned = ['goal-star', 'start-marker', 'player-block', 'trail-swatch', 'edge-marker', 'bleed-gate'] as const;
  const envs: MechanicIconEnv[] = BOARD_TILE_STYLE_IDS.flatMap((boardTileStyle) => [1, 2, 3].map((devicePixelRatio) => ({ boardTileStyle, devicePixelRatio })));

  for (const glyph of pinned) {
    test(`${glyph}: registry == MenuScene.drawLegacyGuideIcon for every board style and backing scale`, () => {
      const row = guideRow(glyph);
      for (const env of envs) {
        const scene = createSceneStub(env);
        const draw = sceneGuideIcon(scene);
        for (const [x, y] of [[100, 120], [57.5, 33.25]] as const) {
          const accent = 0x39f58a;
          const expected = record((g) => draw(row.icon, x, y, accent, g));
          const actual = record((g) => drawLegacyGuideRowIcon(scene as never, row.icon, x, y, accent, g));
          expect(expected.length, `${glyph} ${env.boardTileStyle}@${env.devicePixelRatio}`).toBeGreaterThan(4);
          expect(actual, `${glyph} ${env.boardTileStyle}@${env.devicePixelRatio}`).toEqual(expected);
        }
      }
    });
  }

  test('glyphs with no board thing still go to the scene draw (Move, Levels, Online, Menu, In a maze, Sound, Sentry, Hunter)', () => {
    const local = allGuideRows().filter((r) => resolveLegacyGuideMechanicIcon(r.icon.glyph) === null).map((r) => r.icon.glyph);
    expect(local).toEqual(['touch-stick', 'level-numeral', 'online-count', 'menu-burger', 'menu-pause', 'sound-speaker', 'hazard-sentry', 'hazard-hunter']);
    const calls: string[] = [];
    const host = { drawLegacyGuideIcon: (icon: { glyph: string }) => { calls.push(icon.glyph); } };
    for (const glyph of local) drawLegacyGuideRowIcon(host as never, guideRow(glyph).icon, 0, 0, 0xffffff, createRecorder().g);
    expect(calls).toEqual(local);
  });

  test('every Guide row whose icon is board art says shared-with-board and names the board painter', () => {
    for (const row of allGuideRows()) {
      if (resolveLegacyGuideMechanicIcon(row.icon.glyph) === null) continue;
      expect(row.icon.status, row.id).toBe('shared-with-board');
      expect(row.icon.boardDraw, row.id).not.toBeNull();
    }
    expect(guideRow('hazard-gate').icon.boardDraw).toEqual({ module: 'src/render/hazardGateLayer.ts', symbol: 'drawHazardGatesToCanvasContext' });
    expect(guideRow('hazard-shard').icon.boardDraw).toEqual({ module: 'src/render/shardLook.ts', symbol: 'drawShardGem' });
  });

  test('the hazard intro card and the Guide pick the same icon for each hazard', () => {
    for (const glyph of ['hazard-gate', 'hazard-sentry', 'hazard-hunter', 'hazard-shard'] as const) {
      expect(resolveHazardGlyphMechanicIcon(glyph)).toBe(resolveLegacyGuideMechanicIcon(glyph));
    }
  });
});

describe('new registry icons are the board painters themselves', () => {
  const env: MechanicIconEnv = { boardTileStyle: 'starlit', devicePixelRatio: 2 };
  const cx = 40;
  const cy = 44;
  const cell = Math.round(BADGE_RADIUS * 1.5);
  const chip = (g: IconGraphics): void => {
    const left = cx - (cell / 2);
    const top = cy - (cell / 2);
    const geometry = resolveChipGridGeometry({ grid: [[true]], columns: 1, rows: 1, left, top, cellSize: cell });
    drawChipCell(g as never, geometry, left, top, 0, 0, resolveBoardSwatchColors(env.boardTileStyle), 1);
  };

  test('tile = drawChipCell with the board bake geometry and the style swatch', () => {
    expect(record((g) => drawMechanicIconGlyph(g, 'tile', cx, cy, BADGE_RADIUS, env))).toEqual(record(chip));
  });

  test('shard = chip tile + drawShardGem at the board gem share of the tile', () => {
    const expected = record((g) => {
      chip(g);
      drawShardGem(g, cx, cy, cell * SHARD_LOOK.gem.halfHeightOfTile, cell * SHARD_LOOK.gem.halfWidthOfTile, 1, designTokens.strokePx.hairline);
    });
    expect(record((g) => drawMechanicIconGlyph(g, 'shard', cx, cy, BADGE_RADIUS, env))).toEqual(expected);
  });

  test('locked star = goal marker dimmed by the cage opacity + the board cage ring (drawShardCageRing)', () => {
    const expected = record((g) => {
      chip(g);
      const context = new PhaserGraphicsTileContext(g as never);
      context.opacity = SHARD_LOOK.cage.lockedStarOpacity;
      drawBoardMarkers(context, {
        style: env.boardTileStyle, tileSize: cell, devicePixelRatio: env.devicePixelRatio, originX: cx - (cell / 2), originY: cy - (cell / 2),
        start: undefined, goal: { x: 0, y: 0 }, phase: 0, reducedMotion: true
      });
      drawShardCageRing(g, cx, cy, cell * SHARD_LOOK.cage.radiusOfTile, SHARD_LOOK.cage.dots, resolveShardCageDotRadius(cell), 0,
        phaserMaterialAliases['line.active'], SHARD_LOOK.cage.alpha);
    });
    const actual = record((g) => drawMechanicIconGlyph(g, 'locked-star', cx, cy, BADGE_RADIUS, env));
    expect(actual).toEqual(expected);
    // dimmed: every fill of the marker is at most the cage opacity
    const goal = record((g) => drawMechanicIconGlyph(g, 'goal', cx, cy, BADGE_RADIUS, env));
    expect(actual.length).toBe(goal.length + 1 + SHARD_LOOK.cage.dots);
  });

  test('pulse gate = chip tile + drawHazardGatesToCanvasContext (closed, still) replayed through the line context', () => {
    // What the board painter does on a real canvas context: the same strokes, colours and widths.
    const strokes: Array<{ width: number; style: unknown; alpha: number; segments: number[][] }> = [];
    let path: number[][] = [];
    let last: number[] = [];
    const ctx = {
      lineCap: 'butt', lineWidth: 1, strokeStyle: '', globalAlpha: 1,
      save: () => undefined, restore: () => undefined, setLineDash: () => undefined, clearRect: () => undefined,
      beginPath: () => { path = []; },
      moveTo: (x: number, y: number) => { last = [x, y]; },
      lineTo: (x: number, y: number) => { path.push([...last, x, y].map((v) => round(v) as number)); last = [x, y]; },
      stroke() { strokes.push({ width: round(this.lineWidth) as number, style: this.strokeStyle, alpha: this.globalAlpha, segments: path }); }
    };
    const source = { gateCount: 1, gateX: () => 0, gateY: () => 0, gateAxis: () => 0, isOpenAt: () => false };
    const frame = { tileSize: cell, originX: cx - (cell / 2), originY: cy - (cell / 2), alpha: 1, tick: 0, rampStep: 0, reducedMotion: true };
    drawHazardGatesToCanvasContext(ctx as unknown as CanvasRenderingContext2D, source, frame);
    expect(strokes.length).toBeGreaterThan(0);

    const calls = record((g) => drawMechanicIconGlyph(g, 'pulse-gate', cx, cy, BADGE_RADIUS, env));
    const chipCalls = record(chip);
    expect(calls.slice(0, chipCalls.length)).toEqual(chipCalls);
    const gate = calls.slice(chipCalls.length);
    const replayed: Array<{ width: number; segments: number[][] }> = [];
    for (let i = 0; i < gate.length; i += 1) {
      if (gate[i]![0] === 'lineStyle') replayed.push({ width: gate[i]![1] as number, segments: [] });
      if (gate[i]![0] === 'moveTo' && gate[i + 1]?.[0] === 'lineTo') {
        replayed[replayed.length - 1]!.segments.push([...(gate[i]!.slice(1) as number[]), ...(gate[i + 1]!.slice(1) as number[])]);
      }
    }
    expect(replayed).toEqual(strokes.map((s) => ({ width: s.width, segments: s.segments })));
  });

  test('every registry icon draws, and its accent is the board colour of the thing', () => {
    for (const id of MECHANIC_ICON_IDS) {
      expect(record((g) => drawMechanicIconGlyph(g, id, cx, cy, BADGE_RADIUS, env)).length, id).toBeGreaterThan(0);
      expect(resolveMechanicIconAccentCss(id), id).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(resolveMechanicIconAccentCss('switch')).toBe(designTokens.color['semantic.info'].toUpperCase());
    expect(resolveMechanicIconAccentCss('shard')).toBe(designTokens.color['semantic.reward'].toUpperCase());
    expect(resolveMechanicIconAccentCss('pulse-gate')).toBe('#FF4FD8');
    expect(resolveMechanicIconAccentCss('wrap')).toBe(designTokens.color['brand.mint'].toUpperCase());
  });

  test('drawMechanicIcon = the Guide badge + the glyph', () => {
    const id: MechanicIconId = 'shard';
    const expected = record((g) => {
      drawMechanicIconBadge(g, MECHANIC_ICON_BADGE[id], cx, cy, BADGE_RADIUS, MECHANIC_ICON_ACCENT[id]);
      drawMechanicIconGlyph(g, id, cx, cy, BADGE_RADIUS, DEFAULT_MECHANIC_ICON_ENV);
    });
    expect(record((g) => drawMechanicIcon(g, id, cx, cy, BADGE_RADIUS))).toEqual(expected);
  });
});

describe('icon graphics adapters', () => {
  const createCtx = () => {
    const log: unknown[][] = [];
    const ctx: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1 };
    for (const name of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'arc', 'fill', 'stroke', 'fillRect', 'setTransform', 'clearRect']) {
      ctx[name] = (...args: unknown[]) => { log.push([name, ...args.map(round)]); };
    }
    return { ctx, log };
  };

  test('CanvasIconGraphics keeps Phaser semantics: colour numbers become rgba, each shape call is its own path', () => {
    const { ctx, log } = createCtx();
    const g = new CanvasIconGraphics(ctx as never);
    g.fillStyle(0xff4fd8, 0.5);
    expect(ctx.fillStyle).toBe('rgba(255, 79, 216, 0.5)');
    g.fillCircle(1, 2, 3);
    g.lineBetween(0, 0, 4, 4);
    g.fillPoints([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], true);
    expect(log.map((c) => c[0])).toEqual(['beginPath', 'arc', 'fill', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'beginPath', 'moveTo', 'lineTo', 'lineTo', 'lineTo', 'fill']);
    expect(toIconRgba(0x03070b, 2)).toBe('rgba(3, 7, 11, 1)');
  });

  test('the line context splits dashed subpaths and applies globalAlpha to the stroke colour', () => {
    const { g, calls } = createRecorder();
    const ctx = createIconLineContext(g);
    ctx.strokeStyle = 'rgba(255, 79, 216, 0.5)';
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(8, 0);
    ctx.stroke();
    ctx.restore();
    expect(calls[0]).toEqual(['lineStyle', 2, 0xff4fd8, 0.25]);
    expect(calls.filter((c) => c[0] === 'moveTo').map((c) => c[1])).toEqual([0, 4]);
    expect(ctx.lineWidth).toBe(2);
  });

  test('paintMechanicIconCanvas sizes the backing store to the device pixel ratio and paints through the board painters', () => {
    const { ctx, log } = createCtx();
    const canvas = { width: 0, height: 0, style: { width: '', height: '' }, getContext: () => ctx };
    expect(paintMechanicIconCanvas(canvas as never, 'shard', 34, 2.625)).toBe(true);
    expect([canvas.width, canvas.height, canvas.style.width]).toEqual([89, 89, '34px']);
    expect(log[0]).toEqual(['setTransform', 2.625, 0, 0, 2.625, 0, 0]);
    expect(log.filter((c) => c[0] === 'fill').length).toBeGreaterThan(5);
    expect(paintMechanicIconCanvas({ ...canvas, getContext: () => null } as never, 'shard', 34, 1)).toBe(false);
  });
});
