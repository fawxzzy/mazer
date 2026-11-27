/**
 * Mechanic icons: ONE registry of the little icon images every text surface shows (the in-flow notice / first-time
 * cards, the coach mark pill, the level-1 control hint and the Guide rows), each drawn by the SAME painter the board
 * uses for that thing. Nothing here is a copy of board art: a tile is drawChipCell, the goal and start are
 * drawBoardMarkers, the player is drawSparkPlayer, the trail is drawStarDustToGraphics, a wrap is drawEdgeMarker, a
 * switch is drawBleedGatePlan, a shard is drawShardGem, the locked star is drawBoardMarkers dimmed plus
 * drawShardCageRing, and a Pulse Gate is drawHazardGatesToCanvasContext. tests/render/mechanic-icons.test.ts pins each
 * icon's draw calls to a direct call of the board painter, and the Guide rows to these icons.
 *
 * Every icon is frozen (reduced motion, time 0) so it is a still image. Sizes come from the Guide badge: the glyph
 * factors below are the ones the Guide sheet has always used, so routing the Guide through here changes no pixel.
 *
 * Targets: any `IconGraphics` (Phaser Graphics in the Guide and the coach pill, `CanvasIconGraphics` on a DOM canvas).
 */
import type Phaser from 'phaser';
import { drawBoardMarkers } from './boardTileBake';
import { BLEED_GATE_LIT, drawBleedGatePlan, resolveBleedGateDrawPlan } from './bleedGateRenderer';
import { BLEED_GATE_PLATE } from './bleedGateTileLook';
import { DEFAULT_BOARD_TILE_STYLE, boardMaterial, resolveBoardSwatchColors, type BoardTileStyleId } from './boardTileStyle';
import { drawChipCell, resolveChipGridGeometry } from './chipTileGraphics';
import { cyberArcadeMaterial } from './cyberArcadeMaterial';
import { drawEdgeMarker } from './edgeMarkers';
import { HAZARD_GATE_COLOR, drawHazardGatesToCanvasContext } from './hazardGateLayer';
import { CanvasIconGraphics, createIconLineContext, type IconCanvasTarget, type IconGraphics } from './iconGraphics';
import { PhaserGraphicsTileContext } from './phaserTileContext';
import { drawShardCageRing, drawShardGem, resolveShardCageDotRadius, SHARD_LOOK } from './shardLook';
import { createSparkFrame, createSparkMaterial, drawSparkPlayer, resolveSparkFrame, resolveSparkMaterial } from './sparkPlayerSkin';
import { drawStarDustToGraphics, type StarDustSegment } from './starDustTrailCanvas';
import { resolveIridescentRestingCore } from './trailIridescence';
import { TRAIL_WIDTH_RATIO } from './trailLegibility';
import { designTokens, phaserMaterialAliases } from '../theme/tokens';

export const MECHANIC_ICON_IDS = Object.freeze([
  'tile',
  'goal',
  'start',
  'player',
  'trail',
  'wrap',
  'switch',
  'shard',
  'locked-star',
  'pulse-gate'
] as const);

export type MechanicIconId = typeof MECHANIC_ICON_IDS[number];

/** What a board painter needs from the scene to draw like the board (style and backing scale). */
export interface MechanicIconEnv {
  readonly boardTileStyle: BoardTileStyleId;
  /** The board's canvas backing scale (MenuScene.resolveBoardTileBackingScale); the device pixel ratio on a DOM canvas. */
  readonly devicePixelRatio: number;
}

export const DEFAULT_MECHANIC_ICON_ENV: MechanicIconEnv = Object.freeze({
  boardTileStyle: DEFAULT_BOARD_TILE_STYLE,
  devicePixelRatio: 1
});

/**
 * The accent each icon (and its text card) wears: the colour the board gives the thing itself. Switch, wrap, shard and
 * Pulse Gate are the accents Zac picked on the rich-text options page (2026-11-27, B Neon edge).
 */
export const MECHANIC_ICON_ACCENT: Readonly<Record<MechanicIconId, number>> = Object.freeze({
  tile: cyberArcadeMaterial.rail.cyan,
  goal: cyberArcadeMaterial.signal.goal,
  start: cyberArcadeMaterial.signal.start,
  player: cyberArcadeMaterial.signal.player,
  trail: cyberArcadeMaterial.rail.mint,
  wrap: cyberArcadeMaterial.rail.mint,
  switch: BLEED_GATE_LIT,
  shard: phaserMaterialAliases['semantic.reward'],
  'locked-star': phaserMaterialAliases['semantic.reward'],
  'pulse-gate': HAZARD_GATE_COLOR
});

/** Badge outline per icon: round for things, square for the trail (the Guide's long-standing shapes). */
export const MECHANIC_ICON_BADGE: Readonly<Record<MechanicIconId, 'circle' | 'square'>> = Object.freeze({
  tile: 'circle',
  goal: 'circle',
  start: 'circle',
  player: 'circle',
  trail: 'square',
  wrap: 'circle',
  switch: 'circle',
  shard: 'circle',
  'locked-star': 'circle',
  'pulse-gate': 'circle'
});

/** The tile under a one-cell icon, as a share of the badge radius (the Guide marker size). */
export const MECHANIC_ICON_CELL_OF_BADGE = 1.5;

/** CSS hex of an icon's accent (for the DOM skin's `--mazer-neon-accent`). */
export const resolveMechanicIconAccentCss = (id: MechanicIconId): string => (
  `#${MECHANIC_ICON_ACCENT[id].toString(16).padStart(6, '0').toUpperCase()}`
);

// ---- the badge ------------------------------------------------------------------------------------------------

/** The Guide badge: accent wash and keyline, a circle or (trail) a rounded square at the sheet's inset radius (9). */
export const drawMechanicIconBadge = (
  g: IconGraphics,
  shape: 'circle' | 'square',
  centerX: number,
  centerY: number,
  badgeRadius: number,
  accent: number
): void => {
  if (shape === 'square') {
    const half = badgeRadius * 0.92;
    g.fillStyle(accent, 0.16);
    g.fillRoundedRect(centerX - half, centerY - half, half * 2, half * 2, 9);
    g.lineStyle(1.2, accent, 0.7);
    g.strokeRoundedRect(centerX - half, centerY - half, half * 2, half * 2, 9);
    return;
  }
  g.fillStyle(accent, 0.16);
  g.fillCircle(centerX, centerY, badgeRadius);
  g.lineStyle(1.2, accent, 0.7);
  g.strokeCircle(centerX, centerY, badgeRadius);
};

// ---- the glyphs (each one board painter) ---------------------------------------------------------------------

const asPhaserGraphics = (g: IconGraphics): Phaser.GameObjects.Graphics => g as unknown as Phaser.GameObjects.Graphics;

/** Board-coloured chip cells: the board bake's own geometry (resolveChipGridGeometry -> computeChipGeometry). */
const drawChipCells = (
  g: IconGraphics,
  env: MechanicIconEnv,
  grid: boolean[][],
  columns: number,
  rows: number,
  left: number,
  top: number,
  cellSize: number,
  cells: ReadonlyArray<{ column: number; row: number }>
): void => {
  const geometry = resolveChipGridGeometry({ grid, columns, rows, left, top, cellSize });
  const colors = resolveBoardSwatchColors(env.boardTileStyle);
  for (const cell of cells) {
    drawChipCell(asPhaserGraphics(g), geometry, left, top, cell.column, cell.row, colors, 1);
  }
};

const drawSingleCell = (g: IconGraphics, env: MechanicIconEnv, centerX: number, centerY: number, size: number): void => {
  drawChipCells(g, env, [[true]], 1, 1, centerX - (size / 2), centerY - (size / 2), size, [{ column: 0, row: 0 }]);
};

/** A chip tile, then the start or goal marker drawn by the board's own drawBoardMarkers (static frame). */
const drawBoardMarkerGlyph = (
  g: IconGraphics,
  env: MechanicIconEnv,
  kind: 'start' | 'goal',
  centerX: number,
  centerY: number,
  size: number,
  opacity = 1
): void => {
  const left = centerX - (size / 2);
  const top = centerY - (size / 2);
  drawChipCells(g, env, [[true]], 1, 1, left, top, size, [{ column: 0, row: 0 }]);
  const context = new PhaserGraphicsTileContext(asPhaserGraphics(g));
  if (opacity !== 1) context.opacity = opacity;
  drawBoardMarkers(context, {
    style: env.boardTileStyle,
    tileSize: size,
    devicePixelRatio: env.devicePixelRatio,
    originX: left,
    originY: top,
    start: kind === 'start' ? { x: 0, y: 0 } : undefined,
    goal: kind === 'goal' ? { x: 0, y: 0 } : undefined,
    phase: 0,
    reducedMotion: true
  });
};

/** The player (skin Spark): the board's frame + draw, frozen (no ping, pointing right, resting colours). */
const drawPlayerGlyph = (g: IconGraphics, env: MechanicIconEnv, centerX: number, centerY: number, tileSize: number): void => {
  const devicePixelRatio = env.devicePixelRatio;
  const frame = resolveSparkFrame({
    centerX,
    centerY,
    tileSize,
    devicePixelRatio,
    timeMs: 0,
    reducedMotion: true,
    angle: 0,
    motionAmount: 0
  }, createSparkFrame());
  drawSparkPlayer(g, frame, {
    tileSize,
    devicePixelRatio,
    alpha: 1,
    timeMs: 0,
    material: resolveSparkMaterial(null, 0, true, createSparkMaterial()),
    pingStartMs: -1,
    reducedMotion: true
  });
};

/** Three chip tiles in an L with the board's star-dust trail along it (resting iridescent sweep, no twinkle). */
const drawTrailGlyph = (g: IconGraphics, env: MechanicIconEnv, centerX: number, centerY: number, badgeRadius: number): void => {
  const cellSize = Math.max(6, Math.round(badgeRadius * 0.85));
  const left = Math.round(centerX - cellSize);
  const top = Math.round(centerY - cellSize);
  const grid = [[true, false], [true, true]];
  drawChipCells(g, env, grid, 2, 2, left, top, cellSize, [
    { column: 0, row: 0 },
    { column: 0, row: 1 },
    { column: 1, row: 1 }
  ]);
  const points = [
    { x: left + (cellSize * 0.5), y: top + (cellSize * 0.5) },
    { x: left + (cellSize * 0.5), y: top + (cellSize * 1.5) },
    { x: left + (cellSize * 1.5), y: top + (cellSize * 1.5) }
  ];
  const coreWidth = Math.max(2, cellSize * TRAIL_WIDTH_RATIO);
  const segments: StarDustSegment[] = [];
  for (let leg = 0; leg < 2; leg += 1) {
    const from = points[leg]!;
    const to = points[leg + 1]!;
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const start = leg * cellSize;
    for (const [a, b, d0, distanceTiles] of [[from, mid, start, (leg * 2) + 0.5], [mid, to, start + (cellSize / 2), (leg * 2) + 1.5]] as const) {
      const color = resolveIridescentRestingCore(distanceTiles * 1.6, 0);
      segments.push({
        previous: { x: a.x, y: a.y, distance: d0 },
        current: { x: b.x, y: b.y, distance: d0 + (cellSize / 2) },
        glowColor: color,
        coreColor: color,
        alpha: 1
      });
    }
  }
  drawStarDustToGraphics(g, segments, {
    tileSize: cellSize,
    threadWidth: Math.max(1, coreWidth * 0.4),
    keylineColor: boardMaterial.void,
    keylineAlpha: 1
  });
};

/** A wrap: the perimeter diamond itself (drawEdgeMarker), idle station, fixed board size. */
const drawWrapGlyph = (g: IconGraphics, centerX: number, centerY: number): void => {
  drawEdgeMarker(
    g,
    { id: 1, inwardAngle: Math.PI / 2, isCorner: false, side: 'top', x: centerX, y: centerY },
    { alpha: 0.95, energized: false, energy: 0, fill: 0.6, flash: 0, hidden: false, id: 1, spinRad: 0 }
  );
};

/** A switch: the pale plate (a disc, to sit in the round badge) and the board's own sleeping gate draw. */
const drawSwitchGlyph = (g: IconGraphics, centerX: number, centerY: number, badgeRadius: number): void => {
  g.fillStyle(BLEED_GATE_PLATE, 1);
  g.fillCircle(centerX, centerY, badgeRadius * 0.92);
  drawBleedGatePlan(g, resolveBleedGateDrawPlan({
    axis: 'horizontal',
    centerX,
    centerY,
    tileSize: badgeRadius * 2.2,
    activation: 0,
    timeSec: 0,
    reducedMotion: true,
    lit: false
  }));
};

/** A shard: a chip tile with the board's sharp gem on it, at the board's gem share of the tile. */
const drawShardGlyph = (g: IconGraphics, env: MechanicIconEnv, centerX: number, centerY: number, size: number): void => {
  drawSingleCell(g, env, centerX, centerY, size);
  drawShardGem(g, centerX, centerY, size * SHARD_LOOK.gem.halfHeightOfTile, size * SHARD_LOOK.gem.halfWidthOfTile, 1, designTokens.strokePx.hairline);
};

/** The locked star: the goal marker dimmed as the board dims it while caged, inside the board's dotted cage ring. */
const drawLockedStarGlyph = (g: IconGraphics, env: MechanicIconEnv, centerX: number, centerY: number, size: number): void => {
  drawBoardMarkerGlyph(g, env, 'goal', centerX, centerY, size, SHARD_LOOK.cage.lockedStarOpacity);
  drawShardCageRing(
    g,
    centerX,
    centerY,
    size * SHARD_LOOK.cage.radiusOfTile,
    SHARD_LOOK.cage.dots,
    resolveShardCageDotRadius(size),
    0,
    phaserMaterialAliases['line.active'],
    SHARD_LOOK.cage.alpha
  );
};

/** A Pulse Gate: a chip tile with the board's own gate bars (closed, still), through the line-context adapter. */
const drawPulseGateGlyph = (g: IconGraphics, env: MechanicIconEnv, centerX: number, centerY: number, size: number): void => {
  drawSingleCell(g, env, centerX, centerY, size);
  drawHazardGatesToCanvasContext(createIconLineContext(g) as unknown as CanvasRenderingContext2D, {
    gateCount: 1,
    gateX: () => 0,
    gateY: () => 0,
    gateAxis: () => 0,
    isOpenAt: () => false
  }, {
    tileSize: size,
    originX: centerX - (size / 2),
    originY: centerY - (size / 2),
    alpha: 1,
    tick: 0,
    rampStep: 0,
    reducedMotion: true
  });
};

/** Paints one icon's glyph (no badge) centred on (centerX, centerY), sized from the badge radius. */
export const drawMechanicIconGlyph = (
  g: IconGraphics,
  id: MechanicIconId,
  centerX: number,
  centerY: number,
  badgeRadius: number,
  env: MechanicIconEnv = DEFAULT_MECHANIC_ICON_ENV
): void => {
  const cell = Math.round(badgeRadius * MECHANIC_ICON_CELL_OF_BADGE);
  switch (id) {
    case 'tile': drawSingleCell(g, env, centerX, centerY, cell); return;
    case 'goal': drawBoardMarkerGlyph(g, env, 'goal', centerX, centerY, cell); return;
    case 'start': drawBoardMarkerGlyph(g, env, 'start', centerX, centerY, cell); return;
    case 'player': drawPlayerGlyph(g, env, centerX, centerY, badgeRadius * MECHANIC_ICON_CELL_OF_BADGE); return;
    case 'trail': drawTrailGlyph(g, env, centerX, centerY, badgeRadius); return;
    case 'wrap': drawWrapGlyph(g, centerX, centerY); return;
    case 'switch': drawSwitchGlyph(g, centerX, centerY, badgeRadius); return;
    case 'shard': drawShardGlyph(g, env, centerX, centerY, cell); return;
    case 'locked-star': drawLockedStarGlyph(g, env, centerX, centerY, cell); return;
    case 'pulse-gate': drawPulseGateGlyph(g, env, centerX, centerY, cell); return;
  }
};

/** Badge + glyph: the full icon, as the Guide row shows it. */
export const drawMechanicIcon = (
  g: IconGraphics,
  id: MechanicIconId,
  centerX: number,
  centerY: number,
  badgeRadius: number,
  options: { env?: MechanicIconEnv; accent?: number; badge?: 'circle' | 'square' } = {}
): void => {
  drawMechanicIconBadge(g, options.badge ?? MECHANIC_ICON_BADGE[id], centerX, centerY, badgeRadius, options.accent ?? MECHANIC_ICON_ACCENT[id]);
  drawMechanicIconGlyph(g, id, centerX, centerY, badgeRadius, options.env);
};

// ---- DOM canvas ----------------------------------------------------------------------------------------------

export interface MechanicIconCanvasLike {
  width: number;
  height: number;
  style: { width: string; height: string };
  getContext(kind: '2d'): (IconCanvasTarget & { setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void; clearRect(x: number, y: number, w: number, h: number): void }) | null;
}

/**
 * Paints an icon's glyph (no badge: the DOM skin draws the ring) into a square canvas of `sizeCss` CSS px at the
 * device pixel ratio, centred. The board painters run unchanged through CanvasIconGraphics.
 */
export const paintMechanicIconCanvas = (
  canvas: MechanicIconCanvasLike,
  id: MechanicIconId,
  sizeCss: number,
  devicePixelRatio: number,
  boardTileStyle: BoardTileStyleId = DEFAULT_BOARD_TILE_STYLE
): boolean => {
  const dpr = Math.max(1, Math.min(4, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1));
  const size = Math.max(8, Math.round(sizeCss));
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  // No 2D context (a test double, or a browser out of canvas memory): no icon, never a throw.
  const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) return false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  // The glyph fills the badge at the Guide's proportions: badge radius = half the canvas.
  drawMechanicIconGlyph(new CanvasIconGraphics(ctx), id, size / 2, size / 2, size / 2, { boardTileStyle, devicePixelRatio: dpr });
  return true;
};

/** Hazard kinds whose board layer exists map to a registry icon; the rest keep their guide-local glyph. */
export const resolveHazardGlyphMechanicIcon = (glyph: 'hazard-gate' | 'hazard-sentry' | 'hazard-hunter' | 'hazard-shard'): MechanicIconId | null => {
  switch (glyph) {
    case 'hazard-gate': return 'pulse-gate';
    case 'hazard-shard': return 'shard';
    default: return null;
  }
};
