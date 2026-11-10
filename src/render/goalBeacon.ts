/**
 * Goal beacon: a soft goal-coloured halo with a slow pulse and an occasional expanding ping ring around the
 * goal, sized in CSS PIXELS (not tiles) so the goal can be found at a glance on any board size.
 *
 * It never changes the goal artwork (that is `drawBoardMarkers`' red star with its dark keyline, directly on the tile). It is drawn into its own Graphics layer UNDER the trail canvas, so the trail (and its dark
 * underlay) always sits on top of it and keeps its contrast. Halo and ping are low-alpha and stay outside the
 * marker, so they only ever add a goal-coloured glow around the marker.
 *
 * Reduced motion: the halo is static (no pulse) and the ping is not drawn. Pure functions: the draw is a
 * function of (geometry, timeMs, reducedMotion) only, no Date/Math.random.
 */
import { centerOfCell, type TileBakeContext2D } from './boardTileBake';
import {
  BOARD_MARKER_MIN_CSS,
  boardMaterial,
  clampBoardDevicePixelRatio,
  cssRgba,
  resolveGoalEffectiveTile,
  BOARD_TILE_GEOMETRY
} from './boardTileStyle';

export const GOAL_BEACON = Object.freeze({
  /** Halo outer radius: at least this many css px from the cell centre... */
  minHaloRadiusCss: 34,
  /** ...and at least this multiple of the (floored) badge radius. */
  haloRadiusPerBadgeRadius: 1.9,
  /** Concentric translucent discs that approximate a radial falloff (Phaser Graphics has no gradients). */
  haloSteps: 9,
  /** Cumulative alpha at the badge edge when the pulse is at its peak. */
  haloPeakAlpha: 0.34,
  /** The pulse swings the halo alpha between (1 - swing) and 1 of its peak. */
  pulseSwing: 0.35,
  pulsePeriodMs: 2400,
  /** Reduced motion holds the pulse at this fraction of the peak. */
  reducedMotionLevel: 0.82,
  /** One expanding ping per period, lasting `pingDurationMs`. */
  pingPeriodMs: 4800,
  pingDurationMs: 1500,
  pingStrokeCss: 1.75,
  pingPeakAlpha: 0.75,
  /** The ping travels from the badge edge to this multiple of the halo radius. */
  pingTravel: 1.25
});

export interface GoalBeaconSpec {
  readonly badgeRadiusCss: number;
  readonly haloRadiusCss: number;
  /** Cumulative halo alpha at the badge edge for this instant. */
  readonly haloAlpha: number;
  readonly ping: { readonly radiusCss: number; readonly alpha: number; readonly widthCss: number } | null;
}

export interface GoalBeaconInput {
  tileSize: number;
  timeMs: number;
  reducedMotion: boolean;
  minBadgeDiameterCss?: number;
}

export const resolveGoalBeacon = (input: GoalBeaconInput): GoalBeaconSpec => {
  const k = GOAL_BEACON;
  const effectiveTile = resolveGoalEffectiveTile(
    input.tileSize,
    input.minBadgeDiameterCss ?? BOARD_MARKER_MIN_CSS.goalBadgeDiameterCss
  );
  const badgeRadiusCss = effectiveTile * BOARD_TILE_GEOMETRY.marker.goalBadgeRatio;
  const haloRadiusCss = Math.max(k.minHaloRadiusCss, badgeRadiusCss * k.haloRadiusPerBadgeRadius);
  const wave = (Math.sin((input.timeMs / k.pulsePeriodMs) * Math.PI * 2) + 1) / 2;
  const level = input.reducedMotion ? k.reducedMotionLevel : (1 - k.pulseSwing) + (k.pulseSwing * wave);
  let ping: GoalBeaconSpec['ping'] = null;
  if (!input.reducedMotion) {
    const within = ((input.timeMs % k.pingPeriodMs) + k.pingPeriodMs) % k.pingPeriodMs;
    if (within < k.pingDurationMs) {
      const t = within / k.pingDurationMs;
      const eased = 1 - ((1 - t) * (1 - t));
      ping = {
        radiusCss: badgeRadiusCss + ((haloRadiusCss * k.pingTravel) - badgeRadiusCss) * eased,
        alpha: k.pingPeakAlpha * (1 - t),
        widthCss: k.pingStrokeCss
      };
    }
  }
  return {
    badgeRadiusCss,
    haloRadiusCss,
    haloAlpha: k.haloPeakAlpha * level,
    ping
  };
};

export interface GoalBeaconDrawInput extends GoalBeaconInput {
  goal: { x: number; y: number };
  devicePixelRatio: number;
  originX: number;
  originY: number;
  /** Lifecycle fade (build/deconstruct), 0..1. */
  opacity: number;
}

/** Paints the halo and ping into `ctx` (a Phaser Graphics adapter in the game, any 2D context in tests). */
export const drawGoalBeacon = (ctx: TileBakeContext2D, input: GoalBeaconDrawInput): GoalBeaconSpec => {
  const spec = resolveGoalBeacon(input);
  const scale = clampBoardDevicePixelRatio(input.devicePixelRatio);
  const [cx, cy] = centerOfCell(input.goal, input.tileSize, scale, input.originX, input.originY);
  const opacity = Math.max(0, Math.min(1, input.opacity));
  const steps = GOAL_BEACON.haloSteps;
  // Equal-alpha concentric discs: stacking `steps` of them with alpha a gives ~ steps * a at the centre.
  const perStep = 1 - ((1 - spec.haloAlpha) ** (1 / steps));
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = cssRgba(boardMaterial.goal, perStep * opacity);
  for (let i = 0; i < steps; i += 1) {
    const r = spec.badgeRadiusCss + ((spec.haloRadiusCss - spec.badgeRadiusCss) * (1 - (i / steps)));
    ctx.beginPath();
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (spec.ping) {
    ctx.strokeStyle = cssRgba(boardMaterial.goal, spec.ping.alpha * opacity);
    ctx.lineWidth = spec.ping.widthCss;
    ctx.beginPath();
    ctx.moveTo(cx + spec.ping.radiusCss, cy);
    ctx.arc(cx, cy, spec.ping.radiusCss, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  return spec;
};
