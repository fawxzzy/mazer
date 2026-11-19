// MAZER-L10: paints a maze's bleed gates into the scene's dynamic board graphics (MenuScene calls this once
// per dynamic redraw, right after the bleed-dock glow and before the trail and player).
//
// Per gate: the Pulse ring at the gate tile (bleedGateRenderer.ts), and while its path draws in, a
// field-coloured cover over each of the path's two openings (and the dock strip past the board edge) that
// fades out under a travelling ring. The board bake already shows the opened path from the moment the gate
// is lit (legacyBleedGateState.ts, resolveLegacyBleedGateViewGrid), so the cover is what makes it draw in.
//
// MAZER-VIS-063: the gate tile's darker floor and its idle corner brackets are in the board bake; a LIT gate's
// brackets (cyan, breathing on the ring's pulse clock) are stroked here, under the ring, on the redraws that
// already repaint the ring. The ring itself is drawn exactly as before.

import {
  readLegacyBleedGateTriggeredAtMs,
  resolveLegacyBleedGateAnimationState,
  resolveLegacyBleedGateBorderCells,
  type LegacyBleedGate
} from '../legacy-runtime/legacyBleedGateState';
import {
  drawBleedGatePlan,
  resolveBleedGateDrawPlan,
  resolveBleedGateRevealPlan,
  BLEED_GATE_LIT,
  type BleedGateGraphics
} from './bleedGateRenderer';
import {
  drawBleedGateBrackets,
  resolveBleedGateBracketStyle,
  type BleedGateBracketPlan
} from './bleedGateTileLook';

export interface BleedGateSceneLayerInput {
  maze: {
    readonly bleedGates?: readonly LegacyBleedGate[];
    readonly width: number;
    readonly height: number;
    readonly grid: readonly (readonly boolean[])[];
  };
  mazeLeft: number;
  mazeTop: number;
  tileSize: number;
  nowMs: number;
  reducedMotion: boolean;
  fieldColor: number;
  alpha?: number;
  isVisible?: (point: { x: number; y: number }) => boolean;
  /**
   * MAZER-VIS-063: the bake's gate brackets (BoardTileLayer.bleedGateBrackets, keyed `x,y`, board-local css px)
   * and the layer's snapped origin they are relative to. Absent: no live brackets are drawn.
   */
  brackets?: { origin: { x: number; y: number }; plans: ReadonlyMap<string, BleedGateBracketPlan> } | null;
}

// Cell rect, rounded the same way MenuScene.resolveLegacyPixelTileRect rounds.
const cellRect = (left: number, top: number, tile: number, x: number, y: number) => {
  const x0 = Math.round(left + (x * tile));
  const y0 = Math.round(top + (y * tile));
  return {
    x: x0,
    y: y0,
    width: Math.max(1, Math.round(left + ((x + 1) * tile)) - x0),
    height: Math.max(1, Math.round(top + ((y + 1) * tile)) - y0)
  };
};

// Returns true when anything was drawn.
export const drawLegacyBleedGateLayer = (graphics: BleedGateGraphics, input: BleedGateSceneLayerInput): boolean => {
  const gates = input.maze.bleedGates;
  if (!gates || gates.length === 0) {
    return false;
  }
  const { maze, mazeLeft, mazeTop, tileSize, nowMs, reducedMotion } = input;
  const alpha = input.alpha ?? 1;
  let drew = false;
  for (const gate of gates) {
    const state = resolveLegacyBleedGateAnimationState(readLegacyBleedGateTriggeredAtMs(maze, gate), nowMs, reducedMotion);
    const lit = readLegacyBleedGateTriggeredAtMs(maze, gate) !== null;
    if (lit && state.reveal < 1) {
      const reveal = resolveBleedGateRevealPlan(state.reveal, tileSize);
      for (const cell of resolveLegacyBleedGateBorderCells(gate, maze.width, maze.height)) {
        const rect = cellRect(mazeLeft, mazeTop, tileSize, cell.x, cell.y);
        // Extend one tile outward: the dock strip past the board edge draws in with the opening.
        const outX = cell.x === 0 ? -1 : cell.x === maze.width - 1 ? 1 : 0;
        const outY = cell.y === 0 ? -1 : cell.y === maze.height - 1 ? 1 : 0;
        const cover = {
          x: rect.x + Math.min(0, outX * rect.width),
          y: rect.y + Math.min(0, outY * rect.height),
          width: rect.width * (outX !== 0 ? 2 : 1),
          height: rect.height * (outY !== 0 ? 2 : 1)
        };
        if (reveal.coverAlpha > 0.01) {
          graphics.fillStyle(input.fieldColor, reveal.coverAlpha * alpha);
          graphics.fillRect(cover.x, cover.y, cover.width, cover.height);
        }
        if (reveal.ring) {
          graphics.lineStyle(Math.max(1, tileSize / 18), BLEED_GATE_LIT, reveal.ring.alpha * alpha);
          graphics.strokeCircle(rect.x + (rect.width / 2), rect.y + (rect.height / 2), reveal.ring.radius);
        }
        drew = true;
      }
    }
    if (input.isVisible && !input.isVisible({ x: gate.x, y: gate.y })) {
      continue;
    }
    const bracketPlan = lit ? input.brackets?.plans.get(`${gate.x},${gate.y}`) : undefined;
    if (bracketPlan && input.brackets) {
      const look = resolveBleedGateBracketStyle({ activation: state.activation, timeSec: nowMs / 1000, reducedMotion });
      drawBleedGateBrackets(graphics, bracketPlan, look.color, look.alpha * alpha, input.brackets.origin.x, input.brackets.origin.y);
    }
    const rect = cellRect(mazeLeft, mazeTop, tileSize, gate.x, gate.y);
    drawBleedGatePlan(graphics, resolveBleedGateDrawPlan({
      axis: gate.axis,
      centerX: rect.x + (rect.width / 2),
      centerY: rect.y + (rect.height / 2),
      tileSize,
      activation: state.activation,
      timeSec: nowMs / 1000,
      reducedMotion
    }), alpha);
    drew = true;
  }
  return drew;
};
