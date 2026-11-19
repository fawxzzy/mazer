// MAZER-VIS-063: the bleed gate TILE's look, around the unchanged Pulse ring (bleedGateRenderer.ts).
//
// Zac's pick from the gate visibility options page (2026-11-19), "mix C and D, keep the current ring":
//   - D: the gate tile's floor is darker (#1F3A38) with the normal lit rim kept, so the gate reads as a dark
//        patch from across the maze;
//   - C: four corner brackets mark the cell: #F2FBFA while the gate sleeps; once it is lit they turn the gate's
//        lit cyan and breathe on the ring's own pulse clock.
// The ring (dashes, chevrons, spin, slide, pulse rings, halo, colours) is not touched here.
//
// Cost: the dark floor and the idle brackets are part of the board bake (boardTileBake.ts), so a sleeping gate
// costs nothing per frame. Only a LIT gate draws its four brackets in the dynamic layer, on the same redraws
// that already repaint its ring (bleedGateSceneLayer.ts); no new redraw is scheduled.
//
// Geometry comes from the options page's 100-unit tile (a 92-unit chip): bracket corner 8 units inside the
// chip, arms 16 units, stroke 6 units, as shares of the live tile. The live chip is smaller than the page's
// (the rim insets it) and the kept ring fills most of it, so: the brackets sit inside the chip's fill (never on
// the rim) and clear its rounded corners; a bracket moves out into the fill corner when the ring is close; its
// arms are shortened toward the ring but keep one stroke width, so on a phone tile they read as short corner
// ticks. At a rounded fill corner the rim wins and the bracket may graze the ring's outer edge by a fraction of
// a px (the ring is drawn on top). Coordinates and the stroke are device-pixel snapped so the baked and the lit
// brackets are crisp and land on the same pixels.

import type { BoardCell, BoardTileGate } from './boardTileBake';
import { mixBleedGateColor, BLEED_GATE_LIT, BLEED_GATE_PULSE_RATE } from './bleedGateRenderer';

/** D: the gate tile's floor (the chip fill inside the rim). The rim keeps the board's normal lit edge. */
export const BLEED_GATE_FLOOR = 0x1f3a38;
/** C: the corner brackets while the gate sleeps. */
export const BLEED_GATE_BRACKET_IDLE = 0xf2fbfa;
/** C: the corner brackets once the gate is lit (the ring's own lit cyan, token semantic.info #6be8e1). */
export const BLEED_GATE_BRACKET_LIT = BLEED_GATE_LIT;

export const BLEED_GATE_BRACKET_GEOMETRY = Object.freeze({
  /** Options-page chip size in its 100-unit viewBox (4..96). */
  designChip: 92,
  /** Bracket corner (stroke centre) inside the chip fill, design units. */
  inset: 8,
  /** Arm length from the corner, design units. */
  arm: 16,
  /** Stroke width, design units. */
  stroke: 6,
  /** Never thinner than this many css px (the bracket must stay readable on a 14 px phone tile). */
  minStrokeCss: 1,
  /** Clear space between a bracket's stroke edge and the ring's outer edge, css px. */
  ringGapCss: 0.5,
  /** Lit pulse: alpha swings between this floor and 1 on the ring's pulse clock. */
  litAlphaMin: 0.55
});

export interface BleedGateBracketTile {
  /** The chip fill rect (inside the rim on closed sides), board-local css px. */
  fill: { left: number; top: number; width: number; height: number };
  /** Fill corner radii: top-left, top-right, bottom-right, bottom-left. */
  fillRadii: readonly [number, number, number, number];
  /** The cell rect, board-local css px (the ring is centred on it). */
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BleedGateBracketPlan {
  lineWidth: number;
  /** Four L-shapes (arm end, corner, arm end), order: top-left, top-right, bottom-right, bottom-left. */
  brackets: { x: number; y: number }[][];
}

const snap = (value: number, scale: number): number => Math.round(value * scale) / scale;

/**
 * The four corner brackets of one gate tile, in the same coordinates as `tile` (board-local css px in the bake,
 * or shifted by the bake's snapped origin in the scene). `ringOuterRadius` is the ring's radius plus half its
 * line (resolveBleedGateDrawPlan at activation 0), measured from the cell centre.
 */
export const resolveBleedGateBrackets = (input: {
  tile: BleedGateBracketTile;
  tileSize: number;
  scale: number;
  ringOuterRadius: number;
}): BleedGateBracketPlan => {
  const g = BLEED_GATE_BRACKET_GEOMETRY;
  const { tile, tileSize } = input;
  const scale = Number.isFinite(input.scale) && input.scale > 0 ? input.scale : 1;
  const unit = tileSize / g.designChip;
  const lineDevice = Math.max(1, Math.round(Math.max(g.minStrokeCss, g.stroke * unit) * scale));
  const lineWidth = lineDevice / scale;
  // An odd device-pixel stroke is centred on a half device pixel so both of its edges land on whole pixels.
  const half = (lineDevice % 2) / (2 * scale);
  const centreX = tile.left + (tile.width / 2);
  const centreY = tile.top + (tile.height / 2);
  const clearR = input.ringOuterRadius + (lineWidth / 2) + g.ringGapCss;
  const { fill } = tile;
  const corners: { sx: -1 | 1; sy: -1 | 1; radius: number; x: number; y: number }[] = [
    { sx: -1, sy: -1, radius: tile.fillRadii[0], x: fill.left, y: fill.top },
    { sx: 1, sy: -1, radius: tile.fillRadii[1], x: fill.left + fill.width, y: fill.top },
    { sx: 1, sy: 1, radius: tile.fillRadii[2], x: fill.left + fill.width, y: fill.top + fill.height },
    { sx: -1, sy: 1, radius: tile.fillRadii[3], x: fill.left, y: fill.top + fill.height }
  ];
  // Snap toward the tile centre, so a snapped bracket never leaves the fill or reaches a rounded corner's arc.
  const placeInward = (edge: number, side: -1 | 1, inset: number): number => {
    const raw = (edge - (side * inset) - half) * scale;
    return ((side < 0 ? Math.ceil(raw - 1e-9) : Math.floor(raw + 1e-9)) / scale) + half;
  };
  const clearsRing = (x: number, y: number): boolean => (
    Math.hypot(x - centreX, y - centreY) - (lineWidth / 2) >= input.ringOuterRadius
  );
  const brackets = corners.map((corner) => {
    // Closest the bracket may sit to the fill corner: its stroke on the fill edge, or, at a rounded fill corner,
    // its stroke just clear of the arc.
    const minInset = corner.radius > 0
      ? Math.max(lineWidth / 2, corner.radius - ((corner.radius - (lineWidth / 2)) / Math.SQRT2))
      : lineWidth / 2;
    let cx = placeInward(corner.x, corner.sx, Math.max(g.inset * unit, minInset));
    let cy = placeInward(corner.y, corner.sy, Math.max(g.inset * unit, minInset));
    if (!clearsRing(cx, cy)) {
      // Small tiles: the ring leaves little room, so the bracket moves out into the fill corner.
      cx = placeInward(corner.x, corner.sx, minInset);
      cy = placeInward(corner.y, corner.sy, minInset);
    }
    const dx = Math.abs(cx - centreX);
    const dy = Math.abs(cy - centreY);
    // Arm length, shortened so the arm end stays outside the ring (never below one stroke width).
    const armFor = (along: number, across: number): number => {
      let arm = g.arm * unit;
      if (across < clearR) {
        arm = Math.min(arm, along - Math.sqrt((clearR * clearR) - (across * across)));
      }
      return snap(Math.max(lineWidth, arm), scale);
    };
    const armX = armFor(dx, dy);
    const armY = armFor(dy, dx);
    return [
      { x: cx, y: cy - (corner.sy * armY) },
      { x: cx, y: cy },
      { x: cx - (corner.sx * armX), y: cy }
    ];
  });
  return { lineWidth, brackets };
};

/**
 * Colour and alpha of the brackets. Asleep (activation 0): the idle colour at full alpha, exactly what the bake
 * shows, so the hand-off from the baked brackets to the drawn ones is seamless. Lit: the colour mixes to cyan
 * with the ring's activation and the alpha breathes on the ring's pulse clock (brightest as each pulse ring
 * leaves the gate). Reduce Motion: no breathing.
 */
export const resolveBleedGateBracketStyle = (input: {
  activation: number;
  timeSec: number;
  reducedMotion?: boolean;
}): { color: number; alpha: number } => {
  const a = Math.max(0, Math.min(1, input.activation));
  const color = mixBleedGateColor(BLEED_GATE_BRACKET_IDLE, BLEED_GATE_BRACKET_LIT, a);
  if (input.reducedMotion === true) {
    return { color, alpha: 1 };
  }
  const phase = ((input.timeSec * BLEED_GATE_PULSE_RATE) % 1 + 1) % 1;
  const wave = 0.5 + (0.5 * Math.cos(2 * Math.PI * phase));
  const pulse = BLEED_GATE_BRACKET_GEOMETRY.litAlphaMin + ((1 - BLEED_GATE_BRACKET_GEOMETRY.litAlphaMin) * wave);
  return { color, alpha: 1 - (a * (1 - pulse)) };
};

/** The slice of Phaser Graphics the bracket painter uses. */
export interface BleedGateBracketGraphics {
  lineStyle(width: number, color: number, alpha?: number): unknown;
  beginPath(): unknown;
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  strokePath(): unknown;
}

export const drawBleedGateBrackets = (
  graphics: BleedGateBracketGraphics,
  plan: BleedGateBracketPlan,
  color: number,
  alpha: number,
  offsetX = 0,
  offsetY = 0
): void => {
  if (alpha <= 0.01) {
    return;
  }
  graphics.lineStyle(plan.lineWidth, color, alpha);
  for (const bracket of plan.brackets) {
    const [first, ...rest] = bracket;
    if (!first) {
      continue;
    }
    graphics.beginPath();
    graphics.moveTo(first.x + offsetX, first.y + offsetY);
    for (const point of rest) {
      graphics.lineTo(point.x + offsetX, point.y + offsetY);
    }
    graphics.strokePath();
  }
};

/** The bake input for a maze's gates: every gate cell, and whether it is lit (a lit gate's brackets are drawn live). */
export const resolveBoardTileGates = <TGate extends BoardCell>(
  gates: readonly TGate[] | undefined,
  isLit: (gate: TGate) => boolean
): BoardTileGate[] => (gates ?? []).map((gate) => ({ x: gate.x, y: gate.y, lit: isLit(gate) }));
