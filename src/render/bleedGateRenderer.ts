// MAZER-L10: the bleed gate tile, Gate D "Pulse ring" (Zac's pick, design options page
// mazer-gate-menu-options-2026-11-19-v1, gate D).
//
// A dashed ring with two chevrons pointing along its bleed path's axis (left/right for a row, up/down for a
// column). Asleep it is dull and still; once walked over it lights (activation 0 -> 1 over 0.6 s), the dashes
// spin, the chevrons slide and two pulse rings breathe out of it. Then the hidden path draws in on the pulse:
// its two border openings fade in under a ring travelling out of each (reveal 0 -> 1 over 1.6 s).
//
// Pure geometry first (resolveBleedGateDrawPlan / resolveBleedGateRevealPlan, unit-tested), then a thin
// Phaser Graphics painter. Sizes are the options page's pixels at a 39 px tile, scaled to the live tile.
// Reduce Motion: no spin, no slide, no breathing rings, and the path is drawn the instant the gate is lit.

import type { BleedAxis } from '../legacy-runtime/legacyBleedPaths';
import { phaserMaterialAliases } from '../theme/tokens';

// Theme tokens (MAZER-UI-013): asleep is the muted text grey, lit is the info cyan (the options page's
// #3d5a64 / #7ff3ff, mapped to the nearest registry colours).
export const BLEED_GATE_DULL = phaserMaterialAliases['text.muted'];
export const BLEED_GATE_LIT = phaserMaterialAliases['semantic.info'];

const DESIGN_TILE = 39;
const RING_RADIUS_SHARE = 0.36;
const DASH_PX = 7;
const GAP_PX = 5;
const RING_LINE_PX = 2.2;
const DASH_SPIN_PX_PER_S = 30;
const ARROW_SPREAD_PX = 8;
const ARROW_SIZE_PX = 4.6;
const ARROW_LINE_PX = 2.6;
const ARROW_SLIDE_PX = 1.8;
const ARROW_SLIDE_RATE = 8;
const PULSE_RATE = 0.9;
const PULSE_REACH_SHARE = 0.9;
const GLOW_PX = 9;

export const mixBleedGateColor = (from: number, to: number, amount: number): number => {
  const t = Math.max(0, Math.min(1, amount));
  const channel = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + ((b - a) * t)) & 0xff;
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};

export interface BleedGateArc {
  // Radians, clockwise from +x (Phaser's arc convention).
  start: number;
  end: number;
}

export interface BleedGatePolyline {
  points: { x: number; y: number }[];
}

export interface BleedGateRing {
  radius: number;
  alpha: number;
}

export interface BleedGateDrawPlan {
  centerX: number;
  centerY: number;
  radius: number;
  color: number;
  lineWidth: number;
  dashes: BleedGateArc[];
  chevrons: BleedGatePolyline[];
  chevronLineWidth: number;
  pulseRings: BleedGateRing[];
  // A soft halo stroke under the ring (stands in for the page's canvas shadow glow).
  glowWidth: number;
  glowAlpha: number;
}

export const resolveBleedGateDrawPlan = (input: {
  axis: BleedAxis;
  centerX: number;
  centerY: number;
  tileSize: number;
  activation: number;
  timeSec: number;
  reducedMotion?: boolean;
}): BleedGateDrawPlan => {
  const { axis, centerX, centerY, tileSize } = input;
  const a = Math.max(0, Math.min(1, input.activation));
  const motion = input.reducedMotion === true ? 0 : 1;
  const t = input.timeSec * motion;
  const scale = tileSize / DESIGN_TILE;
  const radius = RING_RADIUS_SHARE * tileSize;
  const color = mixBleedGateColor(BLEED_GATE_DULL, BLEED_GATE_LIT, a);

  // Dashes along the circumference, shifted by the spin (dash offset -t*30*a, in design px).
  const circumference = 2 * Math.PI * radius;
  const dash = DASH_PX * scale;
  const gap = GAP_PX * scale;
  const period = Math.max(1e-6, dash + gap);
  const count = Math.max(4, Math.floor(circumference / period));
  const step = (2 * Math.PI) / count;
  const dashAngle = step * (dash / period);
  const offsetAngle = ((DASH_SPIN_PX_PER_S * t * a * scale) / Math.max(1e-6, radius));
  const dashes: BleedGateArc[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = (index * step) + offsetAngle;
    dashes.push({ start, end: start + dashAngle });
  }

  // Two chevrons pointing out along the axis, sliding outward and back while lit.
  const slide = a * Math.sin(t * ARROW_SLIDE_RATE) * ARROW_SLIDE_PX * scale;
  const spread = (ARROW_SPREAD_PX * scale) + slide;
  const size = ARROW_SIZE_PX * scale;
  const chevrons: BleedGatePolyline[] = [-1, 1].map((direction) => {
    // Tip at +/- (spread + size/2) along the axis, arms back toward the centre.
    const tip = direction * (spread + (size / 2));
    const back = tip - (direction * size);
    const raw = [
      { along: back, across: -size },
      { along: tip, across: 0 },
      { along: back, across: size }
    ];
    return {
      points: raw.map((point) => (
        axis === 'horizontal'
          ? { x: centerX + point.along, y: centerY + point.across }
          : { x: centerX + point.across, y: centerY + point.along }
      ))
    };
  });

  const pulseRings: BleedGateRing[] = [];
  if (a > 0.5 && motion > 0) {
    for (let index = 0; index < 2; index += 1) {
      const p = ((t * PULSE_RATE) + (index * 0.5)) % 1;
      pulseRings.push({ radius: radius + (p * PULSE_REACH_SHARE * tileSize), alpha: 0.7 * (1 - p) * a });
    }
  }

  return {
    centerX,
    centerY,
    radius,
    color,
    lineWidth: Math.max(1, RING_LINE_PX * scale),
    dashes,
    chevrons,
    chevronLineWidth: Math.max(1, ARROW_LINE_PX * scale),
    pulseRings,
    glowWidth: Math.max(1, (RING_LINE_PX + GLOW_PX) * scale * a),
    glowAlpha: 0.22 * a
  };
};

export interface BleedGateRevealPlan {
  // Alpha of the field-coloured cover over each opening (1 hidden .. 0 drawn in).
  coverAlpha: number;
  ring: BleedGateRing | null;
}

// The draw-in at one opening: the cover fades out as `reveal` runs 0 -> 1, under a ring growing out of it.
export const resolveBleedGateRevealPlan = (reveal: number, tileSize: number): BleedGateRevealPlan => {
  const p = Math.max(0, Math.min(1, reveal));
  const scale = tileSize / DESIGN_TILE;
  return {
    coverAlpha: 1 - p,
    ring: p > 0 && p < 1 ? { radius: (6 + (10 * p)) * scale, alpha: 0.6 * (1 - p) } : null
  };
};

// The slice of Phaser.GameObjects.Graphics the painter uses (kept narrow so tests can record calls).
export interface BleedGateGraphics {
  lineStyle(width: number, color: number, alpha?: number): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  beginPath(): unknown;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): unknown;
  strokePath(): unknown;
  strokeCircle(x: number, y: number, radius: number): unknown;
  fillRect(x: number, y: number, width: number, height: number): unknown;
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
}

export const drawBleedGatePlan = (graphics: BleedGateGraphics, plan: BleedGateDrawPlan, alpha = 1): void => {
  const { centerX, centerY, radius } = plan;
  if (plan.glowAlpha > 0.01) {
    graphics.lineStyle(plan.glowWidth, plan.color, plan.glowAlpha * alpha);
    graphics.strokeCircle(centerX, centerY, radius);
  }
  for (const ring of plan.pulseRings) {
    if (ring.alpha <= 0.01) {
      continue;
    }
    graphics.lineStyle(Math.max(1, plan.lineWidth * 0.6), plan.color, ring.alpha * alpha);
    graphics.strokeCircle(centerX, centerY, ring.radius);
  }
  graphics.lineStyle(plan.lineWidth, plan.color, alpha);
  for (const dash of plan.dashes) {
    graphics.beginPath();
    graphics.arc(centerX, centerY, radius, dash.start, dash.end, false);
    graphics.strokePath();
  }
  graphics.lineStyle(plan.chevronLineWidth, plan.color, alpha);
  for (const chevron of plan.chevrons) {
    const [first, ...rest] = chevron.points;
    if (!first) {
      continue;
    }
    graphics.beginPath();
    graphics.moveTo(first.x, first.y);
    for (const point of rest) {
      graphics.lineTo(point.x, point.y);
    }
    graphics.strokePath();
  }
};
