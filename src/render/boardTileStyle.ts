/**
 * Board tile style/token layer for the baked board tile renderer (DRAFT, not wired into any scene).
 *
 * This module owns three things and nothing else:
 *   1. the render-local `board` colour group, built ONLY from the existing token registry
 *      (`designTokens` / `cyberArcadeMaterial`) -- no free hex literals live in this file;
 *   2. the geometry ratios (named constants) that the chip and trace styles are built from;
 *   3. `resolveBoardTileStyle(style, tileSize, dpr)`, which turns ratios into concrete CSS-pixel
 *      numbers snapped to the device-pixel grid (every line width is at least one device pixel).
 *
 * The derived `path.chip` colour is the one new colour role this redesign needs. It is NOT a new
 * token and NOT a free hex: it is `mix(line.normal, bg.canvas, BOARD_CHIP_CANVAS_MIX)`, computed here
 * from the registry values. `BOARD_CHIP_DERIVATION` documents the derivation and a unit test pins
 * it, so a future palette change in the registry moves the chip with it instead of silently drifting.
 *
 * Reference design: Navigation Core v2 amendment draft
 * (docs/assets/reference/navigation-core-v2/README.md).
 */
import { cyberArcadeMaterial } from './cyberArcadeMaterial';
import { designTokens, phaserMaterialAliases } from '../theme/tokens';

export type BoardTileStyleId = 'chip' | 'trace';

/** Owner-delegated default (reversible): flip by passing `style: 'trace'` to the bake. */
export const DEFAULT_BOARD_TILE_STYLE: BoardTileStyleId = 'chip';

export const BOARD_TILE_STYLE_IDS: readonly BoardTileStyleId[] = Object.freeze(['chip', 'trace'] as const);

/** Parses an untrusted value (setting, URL parameter) into a style id, falling back to the default. */
export const resolveBoardTileStyleId = (value: unknown): BoardTileStyleId => (
  value === 'trace' || value === 'chip' ? value : DEFAULT_BOARD_TILE_STYLE
);

/* ------------------------------------------------------------------------------------------ */
/* colour helpers (24-bit numeric colours, matching phaserMaterialAliases)                    */
/* ------------------------------------------------------------------------------------------ */

export const channelsOf = (color: number): [number, number, number] => [
  (color >> 16) & 0xff,
  (color >> 8) & 0xff,
  color & 0xff
];

export const colorFromChannels = (r: number, g: number, b: number): number => (
  ((Math.round(r) & 0xff) << 16) | ((Math.round(g) & 0xff) << 8) | (Math.round(b) & 0xff)
);

/** Linear sRGB-space-agnostic channel mix (the same arithmetic the prototype used), t in [0, 1]. */
export const mixColor = (from: number, toward: number, t: number): number => {
  const a = channelsOf(from);
  const b = channelsOf(toward);
  return colorFromChannels(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  );
};

export const parseTokenHex = (hex: string): number => parseInt(hex.replace(/^#/, ''), 16);

export const cssRgb = (color: number): string => {
  const [r, g, b] = channelsOf(color);
  return `rgb(${r},${g},${b})`;
};

export const cssRgba = (color: number, alpha: number): string => {
  const [r, g, b] = channelsOf(color);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${Number(a.toFixed(3))})`;
};

/* ------------------------------------------------------------------------------------------ */
/* derived path.chip                                                                          */
/* ------------------------------------------------------------------------------------------ */

/**
 * path.chip derivation: 35% of the way from `line.normal` toward `bg.canvas`.
 * Chosen so the calm mid-tone fill is dark enough for the player/start/goal-badge markers to clear
 * 3:1 against it, yet bright enough to stay clearly above the board background. It stays in the
 * rail's teal hue because it is made from the rail colour itself.
 */
export const BOARD_CHIP_CANVAS_MIX = 0.35;

export const BOARD_CHIP_DERIVATION = Object.freeze({
  token: 'path.chip',
  from: 'line.normal',
  toward: 'bg.canvas',
  amount: BOARD_CHIP_CANVAS_MIX,
  rule: 'path.chip = mix(line.normal, bg.canvas, 0.35), per-channel linear mix, rounded'
} as const);

const registry = phaserMaterialAliases;

export const BOARD_CHIP_FILL: number = mixColor(
  parseTokenHex(designTokens.color[BOARD_CHIP_DERIVATION.from]),
  parseTokenHex(designTokens.color[BOARD_CHIP_DERIVATION.toward]),
  BOARD_CHIP_DERIVATION.amount
);

/* ------------------------------------------------------------------------------------------ */
/* render-local `board` colour group                                                          */
/* ------------------------------------------------------------------------------------------ */

/** Share of the lit rim colour blended into the bg for the trace core (keeps it off pure white). */
export const BOARD_TRACE_CORE_CANVAS_MIX = 0.15;

export const boardMaterial = Object.freeze({
  /** Derived mid-tone chip fill (see BOARD_CHIP_DERIVATION). */
  chip: BOARD_CHIP_FILL,
  /** The one thin lit edge: token line.active. */
  rim: cyberArcadeMaterial.signal.playerHalo,
  /** Board background and the dark keyline / badge colour: token bg.canvas. */
  void: cyberArcadeMaterial.substrate.field,
  /** Wall-socket dots and dead-end rings: token line.normal. */
  socket: cyberArcadeMaterial.path.edge,
  /** Trace channel body: token bg.shell. */
  channel: cyberArcadeMaterial.substrate.fieldRaised,
  /** Trace channel border: token line.subtle. */
  channelBorder: cyberArcadeMaterial.rail.edge,
  /** Trace glow: token rail.cyan. */
  glow: cyberArcadeMaterial.rail.cyan,
  /** Trace bright core: line.active pulled slightly toward the background. */
  traceCore: mixColor(
    cyberArcadeMaterial.signal.playerHalo,
    cyberArcadeMaterial.substrate.field,
    BOARD_TRACE_CORE_CANVAS_MIX
  ),
  start: cyberArcadeMaterial.signal.start,
  goal: cyberArcadeMaterial.signal.goal,
  goalHalo: cyberArcadeMaterial.signal.violet,
  player: cyberArcadeMaterial.signal.player,
  playerEdge: cyberArcadeMaterial.signal.playerAccent,
  /** Trail reference colour used for the 3:1 contrast check (the real trail keeps its energy stops). */
  trailReference: cyberArcadeMaterial.rail.cyan,
  white: cyberArcadeMaterial.rail.white
} as const);

export type BoardMaterial = typeof boardMaterial;

/* ------------------------------------------------------------------------------------------ */
/* geometry ratios (named, tile-relative unless suffixed Css/Px)                              */
/* ------------------------------------------------------------------------------------------ */

export const BOARD_TILE_GEOMETRY = Object.freeze({
  /** Convex corner radius of a chip, as a share of the tile. */
  chipCornerRatio: 0.3,
  /** Dead-end cap radius: fully round. */
  capRadiusRatio: 0.5,
  /** Rim (lit edge) width: 10% of the tile, clamped to the CSS range below (about 1.4 css px at 14 px). */
  rimRatio: 0.1,
  rimMinCss: 1.25,
  rimMaxCss: 2.4,
  /** Rim glow blur in CSS px (converted to device px for shadowBlur). */
  rimGlowBlurCss: 2.5,
  padDotRatio: 0.06,
  padDotMinCss: 0.8,
  padDotAlpha: 0.24,
  junctionNodeRatio: 0.12,
  junctionNodeMinCss: 1,
  junctionNodeAlpha: 0.85,
  /** Wall sockets: faint dots on wall cells within one cell (8-neighbourhood) of the path. */
  socketRatio: 0.05,
  socketMinCss: 0.6,
  socketAlphaChip: 0.09,
  socketAlphaTrace: 0.1,
  socketMinTileCss: 10,
  socketCap: 480,
  /** Bleed / wrap dock: four diminishing chip slices and a lintel bar at the board edge. */
  dockSliceCount: 4,
  dockSliceLengthRatio: 0.8,
  dockSliceRadiusRatio: 0.2,
  dockSliceAlphas: Object.freeze([0.9, 0.55, 0.28, 0.14]),
  dockGapCss: 2,
  dockLintelCss: 2.5,
  dockDefaultLengthTiles: 3,
  /** Transparent margin around the board inside the bake so the rim glow is never clipped. */
  bakeEdgePadCss: 2,
  trace: Object.freeze({
    channelRatio: 0.9,
    channelBorderCss: 1,
    glowSteps: Object.freeze([
      Object.freeze({ widthRatio: 0.62, alpha: 0.07 }),
      Object.freeze({ widthRatio: 0.42, alpha: 0.12 }),
      Object.freeze({ widthRatio: 0.3, alpha: 0.22 })
    ]),
    coreRatio: 0.2,
    coreMinCss: 2,
    junctionRingRatio: 0.27,
    junctionRingWidthRatio: 0.11,
    junctionRingWidthMinCss: 1.5,
    deadEndPadRatio: 0.17,
    deadEndRingRatio: 0.3,
    deadEndRingAlpha: 0.45,
    dockStubRatio: 0.9,
    dockStubWidthRatio: 0.2,
    dockStubWidthMinCss: 2,
    dockDotSpacingRatio: 0.55,
    dockDotRatio: 0.1,
    dockDotMinCss: 0.7,
    dockNodeRatio: 0.27
  }),
  marker: Object.freeze({
    /** Start: gold corner brackets. */
    startHalfRatio: 0.3,
    startArmRatio: 0.2,
    startWidthRatio: 0.1,
    startWidthMinCss: 1.5,
    startDotRatio: 0.7,
    /** Goal: star in a dark disc badge with a lit ring. */
    goalBadgeRatio: 0.47,
    goalRingRatio: 0.09,
    goalRingMinCss: 1.25,
    goalStarOuterRatio: 0.33,
    goalStarInnerRatio: 0.15,
    /** Player: rounded square, mint edge, dark keyline. */
    playerSizeRatio: 0.6,
    playerRadiusRatio: 0.2,
    playerEdgeCss: 1,
    playerKeylineCss: 1.25,
    /** Trace-style marker variants. */
    traceStartDiscRatio: 0.3,
    traceStartOuterRatio: 0.44,
    traceGoalDiscRatio: 0.36,
    traceGoalHaloRatio: 0.47,
    traceGoalStarOuterRatio: 0.4,
    traceGoalStarInnerRatio: 0.18,
    tracePlayerSizeRatio: 0.56,
    tracePlayerRadiusRatio: 0.16,
    /** Goal ring alpha swing driven by the (reduced-motion-gated) phase input. */
    goalRingAlphaBase: 0.85,
    goalRingAlphaSwing: 0.15
  })
} as const);

/* ------------------------------------------------------------------------------------------ */
/* device-pixel snapping                                                                      */
/* ------------------------------------------------------------------------------------------ */

export const clampBoardDevicePixelRatio = (dpr: number): number => (
  Number.isFinite(dpr) && dpr > 0 ? Math.min(4, Math.max(1, dpr)) : 1
);

/** Line width in CSS px snapped to whole device pixels, never below one device pixel. */
export const snapLineWidth = (cssPx: number, dpr: number): number => (
  Math.max(1, Math.round(cssPx * dpr)) / dpr
);

/** Coordinate or radius in CSS px snapped to the device-pixel grid (may be zero). */
export const snapCoordinate = (cssPx: number, dpr: number): number => Math.round(cssPx * dpr) / dpr;

/* ------------------------------------------------------------------------------------------ */
/* resolved style                                                                             */
/* ------------------------------------------------------------------------------------------ */

export interface ResolvedGlowStep {
  readonly width: number;
  readonly alpha: number;
}

export interface ResolvedBoardTileStyle {
  readonly style: BoardTileStyleId;
  readonly tileSize: number;
  readonly dpr: number;
  readonly material: BoardMaterial;
  readonly rimWidth: number;
  /** shadowBlur value in DEVICE pixels (canvas shadowBlur ignores the transform). */
  readonly rimGlowBlurDevicePx: number;
  readonly cornerRadius: number;
  readonly capRadius: number;
  readonly padDotRadius: number;
  readonly junctionNodeRadius: number;
  readonly socketRadius: number;
  readonly dock: {
    readonly sliceCount: number;
    readonly sliceLength: number;
    readonly sliceRadius: number;
    readonly gap: number;
    readonly lintel: number;
    readonly alphas: readonly number[];
    readonly defaultLength: number;
  };
  readonly trace: {
    readonly channelWidth: number;
    readonly channelBorderWidth: number;
    readonly glowSteps: readonly ResolvedGlowStep[];
    readonly coreWidth: number;
    readonly junctionRingRadius: number;
    readonly junctionRingWidth: number;
    readonly deadEndPadRadius: number;
    readonly deadEndRingRadius: number;
    readonly deadEndRingWidth: number;
    readonly deadEndRingAlpha: number;
    readonly dockStubLength: number;
    readonly dockStubWidth: number;
    readonly dockDotSpacing: number;
    readonly dockDotRadius: number;
    readonly dockNodeRadius: number;
  };
  readonly marker: {
    readonly startHalf: number;
    readonly startArm: number;
    readonly startWidth: number;
    readonly startDotRadius: number;
    readonly goalBadgeRadius: number;
    readonly goalRingWidth: number;
    readonly goalStarOuter: number;
    readonly goalStarInner: number;
    readonly playerSize: number;
    readonly playerRadius: number;
    readonly playerEdge: number;
    readonly playerKeyline: number;
    readonly traceStartDiscRadius: number;
    readonly traceStartOuterRadius: number;
    readonly traceGoalDiscRadius: number;
    readonly traceGoalHaloRadius: number;
    readonly traceGoalStarOuter: number;
    readonly traceGoalStarInner: number;
    readonly tracePlayerSize: number;
    readonly tracePlayerRadius: number;
    readonly hairline: number;
  };
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const resolveBoardTileStyle = (
  style: BoardTileStyleId,
  tileSize: number,
  devicePixelRatio: number
): ResolvedBoardTileStyle => {
  const dpr = clampBoardDevicePixelRatio(devicePixelRatio);
  const T = Number.isFinite(tileSize) && tileSize > 0 ? tileSize : 1;
  const g = BOARD_TILE_GEOMETRY;
  const tr = g.trace;
  const mk = g.marker;
  const line = (cssPx: number): number => snapLineWidth(cssPx, dpr);
  const coord = (cssPx: number): number => snapCoordinate(cssPx, dpr);
  const radius = (cssPx: number, minCss = 0): number => Math.max(coord(minCss), coord(cssPx));

  const rimWidth = line(clamp(T * g.rimRatio, g.rimMinCss, g.rimMaxCss));
  const coreWidth = line(Math.max(tr.coreMinCss, T * tr.coreRatio));
  const junctionRingWidth = line(Math.max(tr.junctionRingWidthMinCss, T * tr.junctionRingWidthRatio));
  const keyline = line(mk.playerKeylineCss);
  const dockLength = coord(T * g.dockSliceLengthRatio);

  return Object.freeze({
    style,
    tileSize: T,
    dpr,
    material: boardMaterial,
    rimWidth,
    rimGlowBlurDevicePx: g.rimGlowBlurCss * dpr,
    cornerRadius: radius(T * g.chipCornerRatio),
    capRadius: radius(T * g.capRadiusRatio),
    padDotRadius: radius(Math.max(g.padDotMinCss, T * g.padDotRatio)),
    junctionNodeRadius: radius(Math.max(g.junctionNodeMinCss, T * g.junctionNodeRatio)),
    socketRadius: radius(Math.max(g.socketMinCss, T * g.socketRatio)),
    dock: Object.freeze({
      sliceCount: g.dockSliceCount,
      sliceLength: dockLength,
      sliceRadius: radius(T * g.dockSliceRadiusRatio),
      gap: line(g.dockGapCss),
      lintel: line(g.dockLintelCss),
      alphas: g.dockSliceAlphas,
      defaultLength: coord(T * g.dockDefaultLengthTiles)
    }),
    trace: Object.freeze({
      channelWidth: line(T * tr.channelRatio),
      channelBorderWidth: line(tr.channelBorderCss),
      glowSteps: Object.freeze(tr.glowSteps.map((step) => Object.freeze({
        width: line(T * step.widthRatio),
        alpha: step.alpha
      }))),
      coreWidth,
      junctionRingRadius: radius(T * tr.junctionRingRatio),
      junctionRingWidth,
      deadEndPadRadius: radius(T * tr.deadEndPadRatio),
      deadEndRingRadius: radius(T * tr.deadEndRingRatio),
      deadEndRingWidth: line(1),
      deadEndRingAlpha: tr.deadEndRingAlpha,
      dockStubLength: coord(T * tr.dockStubRatio),
      dockStubWidth: line(Math.max(tr.dockStubWidthMinCss, T * tr.dockStubWidthRatio)),
      dockDotSpacing: coord(T * tr.dockDotSpacingRatio),
      dockDotRadius: radius(Math.max(tr.dockDotMinCss, T * tr.dockDotRatio)),
      dockNodeRadius: radius(T * tr.dockNodeRatio)
    }),
    marker: Object.freeze({
      startHalf: coord(T * mk.startHalfRatio),
      startArm: coord(T * mk.startArmRatio),
      startWidth: line(Math.max(mk.startWidthMinCss, T * mk.startWidthRatio)),
      startDotRadius: radius(line(Math.max(mk.startWidthMinCss, T * mk.startWidthRatio)) * mk.startDotRatio),
      goalBadgeRadius: radius(T * mk.goalBadgeRatio),
      goalRingWidth: line(Math.max(mk.goalRingMinCss, T * mk.goalRingRatio)),
      goalStarOuter: radius(T * mk.goalStarOuterRatio),
      goalStarInner: radius(T * mk.goalStarInnerRatio),
      playerSize: coord(T * mk.playerSizeRatio),
      playerRadius: radius(T * mk.playerRadiusRatio),
      playerEdge: line(mk.playerEdgeCss),
      playerKeyline: keyline,
      traceStartDiscRadius: radius(T * mk.traceStartDiscRatio),
      traceStartOuterRadius: radius(T * mk.traceStartOuterRatio),
      traceGoalDiscRadius: radius(T * mk.traceGoalDiscRatio),
      traceGoalHaloRadius: radius(T * mk.traceGoalHaloRatio),
      traceGoalStarOuter: radius(T * mk.traceGoalStarOuterRatio),
      traceGoalStarInner: radius(T * mk.traceGoalStarInnerRatio),
      tracePlayerSize: coord(T * mk.tracePlayerSizeRatio),
      tracePlayerRadius: radius(T * mk.tracePlayerRadiusRatio),
      hairline: line(1)
    })
  });
};

/** Re-exported so callers/tests can read the registry-sourced numbers this layer was built from. */
export const BOARD_TILE_TOKEN_SOURCES = Object.freeze({
  lineNormal: registry['line.normal'],
  lineActive: registry['line.active'],
  canvas: registry['bg.canvas']
});
