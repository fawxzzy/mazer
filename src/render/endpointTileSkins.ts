/**
 * END-TILE SKINS (lane L5, owner picks 2026-11-19): a registry of looks for the start tile and the end (goal) tile, the
 * pure geometry and clocks of the two picked looks, and their draw code. No Phaser, no DOM, no wall clock, no randomness:
 * every function is a function of (tile geometry, device pixel ratio, scene time, reduced motion).
 *
 * WHY A REGISTRY. The owner picked one start look and one end look from a live options page and asked that the designs he
 * did not pick be kept for a future in-game shop. So every design on that page is registered here by id and name; only the
 * picked ones are `selectable` today (they are the defaults). The looks shipped before L5 stay `drawable` as `retired`
 * entries (their renderers are unchanged and their pixel tests still pin them); the other designs are `archived`: name and
 * description only, their drawing code lives in the design archive (`mazer-look-options-2026-11-19-v4`, outside this repo),
 * and they are built when the shop needs them. Nothing here reads or writes player data: there is no picker yet.
 *
 * START = SEED SPIRAL (default). A one-arm spiral of 26 beads, small and faint at the centre, larger and solid at the
 * rim, that turns clockwise about once per 2.2 s and breathes in and out (its radius swings +-7 %, period 2.1 s). It is
 * deliberately NOT in phase with the end tile (the owner asked for a faster spin, desynced from the end tile). Colour: the
 * start gold (`boardMaterial.start`, #F4C84A), each bead over a one-device-pixel dark keyline disc so it stays crisp on
 * the mid-tone chip.
 *
 * END = TWIN STARS (default). A big OUTLINE star turning counter-clockwise (a turn per 5.6 s) and a smaller SOLID star
 * turning clockwise (a turn per 7 s), so the two weave. The solid star is today's end star (red fill, the shared border
 * colour, the dark keyline) at 0.9 of its fitted size; the outline is the goal red at 0.9 alpha over a dark keyline. The
 * goal beacon's ping (goalBeacon.ts) becomes a five-point star with today's size, timing, stroke and colour (#FF405D),
 * turning counter-clockwise with its own clock.
 *
 * FIT (the owner: stars must not overflow the tile edges but stay readable). The solid star keeps today's fit (inside
 * the lit rim, endpointTiles.ts). The outline star and the seed spiral are larger by design, so they are fitted to the
 * TILE (the cell), not the fill: their farthest painted point (tip or bead, plus the keyline) stays at least
 * max(0.07 of the half-tile, 0.5 device px) inside the cell edge nearest their centre, at any tile size or DPR. They may
 * cross the lit rim (as on the options page) but never leave their tile.
 *
 * PIXEL ALIGNMENT. Everything is Phaser Graphics (never floored by roundPixels), centred on the same device-snapped
 * tile geometry and optical centre as the pre-L5 glyphs (endpointOpticalCentre.ts). No Image, no css-px rounding here.
 *
 * COST. Seed spiral: one fill for the keyline discs and one per bead (27 fills). Twin stars: 2 strokes for the outline and
 * the 3 layers today's star already had. Both ride the existing dynamic redraw cadence (the star spin already forces it);
 * reduced motion holds both still (angle 0, no breathing) and the beacon drops its ping, as before.
 */
import { resolveEndpointCentre } from './endpointOpticalCentre';
import { resolveEndpointTile, type EndpointTileRect } from './endpointTiles';
import { cssRgb, cssRgba, snapLineWidth } from './boardTileStyle';
import { GOAL_STAR_SPIN } from './goalStarSpin';

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------------------------------ */
/* registry                                                                                   */
/* ------------------------------------------------------------------------------------------ */

/**
 * `default`: the owner's pick, drawn today. `retired`: the look shipped before L5, still drawable (not selectable).
 * `archived`: a design from the options page kept for the future shop; registered by name only, not drawable yet.
 */
export type EndpointSkinStatus = 'default' | 'retired' | 'archived';

export interface EndpointSkinEntry<Id extends string = string> {
  readonly id: Id;
  readonly name: string;
  readonly description: string;
  readonly status: EndpointSkinStatus;
  /** A player may pick it today. Only the defaults are; the rest wait for the shop. */
  readonly selectable: boolean;
  /** The game has a renderer for it. */
  readonly drawable: boolean;
}

export type DrawableStartTileSkinId = 'seed-spiral' | 'pinwheel';
export type StartTileSkinId = DrawableStartTileSkinId | 'floor-inlay' | 'portal-rings' | 'landing-pad';
export type DrawableEndTileSkinId = 'twin-stars' | 'solid-star';
export type EndTileSkinId = DrawableEndTileSkinId
  | 'inlay-star'
  | 'beacon-sparkle'
  | 'line-star'
  | 'gem-hexagram'
  | 'nova-burst'
  | 'faceted-star'
  | 'orbit-star'
  | 'compass-rose'
  | 'diamond-gem'
  | 'sun-rays';

export const DEFAULT_START_TILE_SKIN: DrawableStartTileSkinId = 'seed-spiral';
export const DEFAULT_END_TILE_SKIN: DrawableEndTileSkinId = 'twin-stars';

const entry = <Id extends string>(
  id: Id,
  name: string,
  description: string,
  status: EndpointSkinStatus
): EndpointSkinEntry<Id> => Object.freeze({
  id,
  name,
  description,
  status,
  selectable: status === 'default',
  drawable: status !== 'archived'
});

export const START_TILE_SKINS: readonly EndpointSkinEntry<StartTileSkinId>[] = Object.freeze([
  entry('seed-spiral', 'Seed spiral', 'A beaded spiral that breathes in and out as it turns.', 'default'),
  entry('pinwheel', 'Pinwheel spiral', 'Two gold arms turning slowly in step with the end star (the start tile before L5).', 'retired'),
  entry('floor-inlay', 'Floor inlay', 'A two-arm spiral set into a faint plate, like it is printed on the floor.', 'archived'),
  entry('portal-rings', 'Portal rings', 'Four broken rings turning against each other around a pulsing centre.', 'archived'),
  entry('landing-pad', 'Landing pad', 'Corner brackets and a ticking ring frame a small fast spiral.', 'archived')
]);

export const END_TILE_SKINS: readonly EndpointSkinEntry<EndTileSkinId>[] = Object.freeze([
  entry('twin-stars', 'Twin stars', 'A big outline star and a solid star turning opposite ways, so they weave. Ping is a five-point star.', 'default'),
  entry('solid-star', 'Solid star', 'One solid five-point star turning slowly, round ping (the end tile before L5).', 'retired'),
  entry('inlay-star', 'Inlay star', 'Solid five-point star; the ping is a five-point star turning with it.', 'archived'),
  entry('beacon-sparkle', 'Beacon sparkle', 'Slim four-point sparkle with a bright core, pulsing; the ping is a four-point sparkle.', 'archived'),
  entry('line-star', 'Line star', 'Thin outline star with a dark underlay; ping is a thin outline star.', 'archived'),
  entry('gem-hexagram', 'Gem hexagram', 'Two triangles locked into a six-point star, one red, one pale and glinting. Ping is a six-point star.', 'archived'),
  entry('nova-burst', 'Nova burst', 'Eight-point starburst with long and short rays, turning slowly; ping is an eight-point burst.', 'archived'),
  entry('faceted-star', 'Faceted star', 'Five-point star cut like a gem, a light and a dark face per point. Ping is a five-point star.', 'archived'),
  entry('orbit-star', 'Orbit star', 'The star with a tiny satellite circling it on a faint orbit; ping is a five-point star.', 'archived'),
  entry('compass-rose', 'Compass rose', 'Four long points over four short diagonals, like a compass. Ping is an eight-point star.', 'archived'),
  entry('diamond-gem', 'Diamond gem', 'A cut diamond that turns on its axis (it narrows and widens). Ping is a diamond ring.', 'archived'),
  entry('sun-rays', 'Sun rays', 'A round core with twelve thin rays of alternating length, turning. Ping is a twelve-point burst.', 'archived')
]);

const isDrawableStart = (id: unknown): id is DrawableStartTileSkinId => START_TILE_SKINS.some((s) => s.id === id && s.drawable);
const isDrawableEnd = (id: unknown): id is DrawableEndTileSkinId => END_TILE_SKINS.some((s) => s.id === id && s.drawable);

/** The start skin to draw: `id` when it is registered and drawable, else the default (an archived or unknown id never draws). */
export const resolveStartTileSkin = (id?: string | null): DrawableStartTileSkinId => (
  isDrawableStart(id) ? id : DEFAULT_START_TILE_SKIN
);

/** The end skin to draw: `id` when it is registered and drawable, else the default. */
export const resolveEndTileSkin = (id?: string | null): DrawableEndTileSkinId => (
  isDrawableEnd(id) ? id : DEFAULT_END_TILE_SKIN
);

/** The skins a player could pick today (the defaults only; the shop will widen this). */
export const selectableStartTileSkins = (): EndpointSkinEntry<StartTileSkinId>[] => START_TILE_SKINS.filter((s) => s.selectable);
export const selectableEndTileSkins = (): EndpointSkinEntry<EndTileSkinId>[] => END_TILE_SKINS.filter((s) => s.selectable);

/** The shape of the goal beacon's ping for an end skin: today's ring for the retired star, a five-point star for Twin stars. */
export type GoalPingShape = 'circle' | 'star5';
export const resolveGoalPingShape = (id?: string | null): GoalPingShape => (
  resolveEndTileSkin(id) === 'twin-stars' ? 'star5' : 'circle'
);

/* ------------------------------------------------------------------------------------------ */
/* shared helpers                                                                             */
/* ------------------------------------------------------------------------------------------ */

/** The subset of boardTileBake's Painter the skins draw through (it satisfies this structurally). */
export interface EndpointSkinPainter {
  fillStyle(value: string): void;
  strokeStyle(value: string): void;
  lineWidth(value: number): void;
  begin(): void;
  move(x: number, y: number): void;
  line(x: number, y: number): void;
  close(): void;
  circle(cx: number, cy: number, r: number): void;
  fill(): void;
  stroke(): void;
}

/** The colours the skins use (0xRRGGBB): the board's void (keylines), start gold and goal red. */
export interface EndpointSkinColours {
  void: number;
  start: number;
  goal: number;
}

const mod = (value: number, period: number): number => ((value % period) + period) % period;

/** Distance from (x, y) to the nearest edge of the tile's CELL rect (not the fill). */
const cellRoom = (tile: EndpointTileRect, x: number, y: number): number => Math.min(
  x - tile.left,
  (tile.left + tile.width) - x,
  y - tile.top,
  (tile.top + tile.height) - y
);

/** Clearance kept between the farthest painted point and the cell edge: the share endpointTiles.ts keeps from the rim. */
const cellInset = (radius: number, devicePixelRatio: number): number => Math.max(radius * 0.07, 0.5 / devicePixelRatio);

/**
 * An n-point star's vertices about (cx, cy), flat [x0, y0, ...]: tip up at `rotation` 0, a positive rotation turns it
 * clockwise on screen (y grows down). Same convention as boardTileBake's five-point `starPath`.
 */
export const resolveStarPoints = (
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points: number,
  rotation: number
): number[] => {
  const out: number[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const a = rotation + ((i * Math.PI) / points) - (Math.PI / 2);
    const r = i % 2 === 1 ? inner : outer;
    out.push(cx + (Math.cos(a) * r), cy + (Math.sin(a) * r));
  }
  return out;
};

const tracePolygon = (p: EndpointSkinPainter, pts: readonly number[]): void => {
  p.begin();
  p.move(pts[0] as number, pts[1] as number);
  for (let i = 2; i < pts.length; i += 2) {
    p.line(pts[i] as number, pts[i + 1] as number);
  }
  p.close();
};

/* ------------------------------------------------------------------------------------------ */
/* START: Seed spiral                                                                         */
/* ------------------------------------------------------------------------------------------ */

export const SEED_SPIRAL = Object.freeze({
  beads: 26,
  /** Turns the arm winds from the centre bead to the rim bead. */
  turns: 3.4,
  /** One clockwise turn (options page: 2.9 rad/s). Not tied to the end tile's clocks on purpose. */
  spinPeriodMs: 2170,
  /** The breathing: the spiral's radius swings by +-`breathSwing` once per `breathPeriodMs` (options page: sin(3 t)). */
  breathPeriodMs: 2100,
  breathSwing: 0.07,
  /** Shares of the half-tile, at fit 1: the rim bead's distance from the axis, and bead radius base + growth * k. */
  outerOfRadius: 0.72,
  beadBaseOfRadius: 0.051,
  beadGrowthOfRadius: 0.097,
  /** Bead alpha: base + growth * band share (faint centre, solid rim). */
  alphaBase: 0.35,
  alphaGrowth: 0.65,
  /**
   * The alpha is stepped into this many bands (0.35, 0.57, 0.78, 1.0) so the whole spiral is one keyline fill plus one
   * gold fill per band (5 paint ops, not 27): the beads also grow outward, so the steps do not read as steps.
   */
  alphaBands: 4
});

export interface SeedSpiralClock {
  /** Clockwise angle, radians in [0, 2 pi). */
  readonly rotation: number;
  /** Radius scale (1 +- breathSwing). */
  readonly breath: number;
}

/** The spiral's angle and breath for scene time `timeMs`. Reduced motion (or a non-finite clock): still, angle 0, breath 1. */
export const resolveSeedSpiralClock = (timeMs: number, reducedMotion: boolean): SeedSpiralClock => {
  if (reducedMotion || !Number.isFinite(timeMs)) {
    return { rotation: 0, breath: 1 };
  }
  const k = SEED_SPIRAL;
  return {
    rotation: (mod(timeMs, k.spinPeriodMs) / k.spinPeriodMs) * TAU,
    breath: 1 + (Math.sin((mod(timeMs, k.breathPeriodMs) / k.breathPeriodMs) * TAU) * k.breathSwing)
  };
};

export interface SeedSpiralSpec {
  /** Spin axis: the tile's optical centre (board-local css px). */
  readonly cx: number;
  readonly cy: number;
  /** Rim bead distance at breath 1, bead radius base and growth (css px, already fitted). */
  readonly outer: number;
  readonly beadBase: number;
  readonly beadGrowth: number;
  /** Dark keyline around every bead: one device pixel. */
  readonly keyline: number;
}

/** The seed spiral for one end tile, fitted so the farthest bead (at full breath, plus keyline) stays inside the cell. */
export const resolveSeedSpiralTile = (tile: EndpointTileRect, devicePixelRatio: number): SeedSpiralSpec => {
  const k = SEED_SPIRAL;
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const at = resolveEndpointCentre(tile);
  const radius = Math.min(tile.width, tile.height) / 2;
  const keyline = 1 / dpr;
  const room = Math.max(0, cellRoom(tile, at.x, at.y) - cellInset(radius, dpr) - keyline);
  const reach = ((k.outerOfRadius * (1 + k.breathSwing)) + k.beadBaseOfRadius + k.beadGrowthOfRadius) * radius;
  const fit = reach > 0 ? Math.min(1, room / reach) : 0;
  return {
    cx: at.x,
    cy: at.y,
    outer: k.outerOfRadius * radius * fit,
    beadBase: k.beadBaseOfRadius * radius * fit,
    beadGrowth: k.beadGrowthOfRadius * radius * fit,
    keyline
  };
};

export interface SeedBead {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alpha: number;
}

/** The stepped alpha of the bead at share `t` (0 centre .. 1 rim) of the arm. */
export const resolveSeedBeadAlpha = (t: number): number => {
  const k = SEED_SPIRAL;
  const top = k.alphaBands - 1;
  const band = Math.min(top, Math.max(0, Math.floor(t * k.alphaBands)));
  return k.alphaBase + (k.alphaGrowth * (top > 0 ? band / top : 1));
};

/** The beads, centre first, at this clock. The arm winds clockwise outward from the axis. */
export const resolveSeedSpiralBeads = (spec: SeedSpiralSpec, clock: SeedSpiralClock): SeedBead[] => {
  const k = SEED_SPIRAL;
  const beads: SeedBead[] = [];
  const last = k.beads - 1;
  for (let i = 0; i < k.beads; i += 1) {
    const t = i / last;
    const angle = (t * k.turns * TAU) + clock.rotation;
    const r = t * spec.outer * clock.breath;
    beads.push({
      x: spec.cx + (Math.cos(angle) * r),
      y: spec.cy + (Math.sin(angle) * r),
      radius: spec.beadBase + (spec.beadGrowth * t),
      alpha: resolveSeedBeadAlpha(t)
    });
  }
  return beads;
};

/** Paints the seed spiral: every bead's keyline disc in one fill, then one gold fill per alpha band (beads are centre first). */
export const drawSeedSpiral = (
  p: EndpointSkinPainter,
  colours: EndpointSkinColours,
  spec: SeedSpiralSpec,
  clock: SeedSpiralClock,
  ox = 0,
  oy = 0
): void => {
  const beads = resolveSeedSpiralBeads({ ...spec, cx: spec.cx + ox, cy: spec.cy + oy }, clock);
  p.fillStyle(cssRgb(colours.void));
  p.begin();
  for (const bead of beads) {
    p.circle(bead.x, bead.y, bead.radius + spec.keyline);
  }
  p.fill();
  let i = 0;
  while (i < beads.length) {
    const alpha = beads[i]!.alpha;
    p.fillStyle(cssRgba(colours.start, alpha));
    p.begin();
    for (; i < beads.length && beads[i]!.alpha === alpha; i += 1) {
      p.circle(beads[i]!.x, beads[i]!.y, beads[i]!.radius);
    }
    p.fill();
  }
};

/* ------------------------------------------------------------------------------------------ */
/* END: Twin stars                                                                            */
/* ------------------------------------------------------------------------------------------ */

export const TWIN_STARS = Object.freeze({
  /** The base clock: the pre-L5 star's revolution (14 s). The stars and the ping turn at multiples of it. */
  spinPeriodMs: GOAL_STAR_SPIN.periodMs,
  /** Solid star: 2 turns per base revolution, clockwise (7 s a turn). */
  solidTurns: 2,
  /** Outline star: 2.5 turns per base revolution, counter-clockwise (5.6 s a turn). */
  outlineTurns: -2.5,
  /** The beacon's star ping: 2 turns per base revolution, counter-clockwise. */
  pingTurns: -2,
  /** The solid star is today's fitted end star at this scale. */
  solidScale: 0.9,
  /** Outline star outer radius target (share of the half-tile; 1.5 x today's 0.7) and inner/outer ratio (0.7 / 1.5). */
  outlineOuterOfRadius: 1.05,
  outlineInnerShare: 0.7 / 1.5,
  /** Outline stroke (share of the half-tile, snapped to whole device px) and its alpha. */
  outlineStrokeOfRadius: 0.1,
  outlineAlpha: 0.9,
  /** The star ping's inner/outer ratio. */
  pingInnerShare: 0.45
});

/** The angular period of a five-point star's appearance (72 degrees). */
const STAR5_TOOTH_RAD = TAU / 5;

/**
 * A five-point star's angle turning `turns` times per base revolution (negative = counter-clockwise), reduced into one
 * 72 degree tooth so it stays a small precise number however long the scene runs. 0 under reduced motion.
 */
const twinStarAngle = (timeMs: number, turns: number, reducedMotion: boolean): number => {
  if (reducedMotion || !Number.isFinite(timeMs) || turns === 0) {
    return 0;
  }
  const toothMs = TWIN_STARS.spinPeriodMs / Math.abs(turns) / 5;
  return Math.sign(turns) * (mod(timeMs, toothMs) / toothMs) * STAR5_TOOTH_RAD;
};

export interface TwinStarsClock {
  readonly solid: number;
  readonly outline: number;
}

export const resolveTwinStarsClock = (timeMs: number, reducedMotion: boolean): TwinStarsClock => ({
  solid: twinStarAngle(timeMs, TWIN_STARS.solidTurns, reducedMotion),
  outline: twinStarAngle(timeMs, TWIN_STARS.outlineTurns, reducedMotion)
});

/** The star ping's angle (goalBeacon.ts). */
export const resolveTwinStarsPingRotation = (timeMs: number, reducedMotion: boolean): number => (
  twinStarAngle(timeMs, TWIN_STARS.pingTurns, reducedMotion)
);

export interface TwinStarsSpec {
  /** Both stars' centre: the tile's optical centre, the pre-L5 star's circumcentre target (board-local css px). */
  readonly cx: number;
  readonly cy: number;
  /** Dark keyline width (one device pixel, as today's goal star) and the solid star's border width. */
  readonly keyline: number;
  readonly border: number;
  readonly solid: { readonly outer: number; readonly inner: number };
  readonly outline: { readonly outer: number; readonly inner: number; readonly stroke: number };
}

/** The twin stars for one end tile: the solid star from today's fit, the outline fitted inside the cell. */
export const resolveTwinStarsTile = (tile: EndpointTileRect, devicePixelRatio: number): TwinStarsSpec => {
  const k = TWIN_STARS;
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const base = resolveEndpointTile('goal', tile, dpr);
  const { frame } = base;
  const star = base.star ?? { outer: 0, inner: 0 };
  const radius = frame.radius;
  const stroke = snapLineWidth(radius * k.outlineStrokeOfRadius, dpr);
  // A round join paints half the stroke beyond each tip, then the keyline: both must stay inside the cell.
  const room = Math.max(0, cellRoom(tile, frame.cx, frame.cy) - cellInset(radius, dpr) - frame.keyline - (stroke / 2));
  const outer = Math.min(radius * k.outlineOuterOfRadius, room);
  return {
    cx: frame.cx,
    cy: frame.cy,
    keyline: frame.keyline,
    border: frame.border,
    solid: { outer: star.outer * k.solidScale, inner: star.inner * k.solidScale },
    outline: { outer, inner: outer * k.outlineInnerShare, stroke }
  };
};

/**
 * Paints the twin stars: the outline (dark keyline stroke, then the goal red at 0.9 alpha), then the solid star on top in
 * today's three layers (dark keyline, the shared border colour, the red fill). Round joins come from the caller's state.
 */
export const drawTwinStars = (
  p: EndpointSkinPainter,
  colours: EndpointSkinColours,
  spec: TwinStarsSpec,
  clock: TwinStarsClock,
  borderColor: number,
  ox = 0,
  oy = 0
): void => {
  const cx = spec.cx + ox;
  const cy = spec.cy + oy;
  const { outline, solid } = spec;
  if (outline.outer > 0) {
    tracePolygon(p, resolveStarPoints(cx, cy, outline.outer, outline.inner, 5, clock.outline));
    p.strokeStyle(cssRgb(colours.void));
    p.lineWidth(outline.stroke + (spec.keyline * 2));
    p.stroke();
    p.strokeStyle(cssRgba(colours.goal, TWIN_STARS.outlineAlpha));
    p.lineWidth(outline.stroke);
    p.stroke();
  }
  const solidPts = resolveStarPoints(cx, cy, solid.outer, solid.inner, 5, clock.solid);
  tracePolygon(p, solidPts);
  p.fillStyle(cssRgb(colours.void));
  p.strokeStyle(cssRgb(colours.void));
  p.lineWidth((spec.keyline + spec.border) * 2);
  p.fill();
  p.stroke();
  if (spec.border > 0) {
    p.fillStyle(cssRgb(borderColor));
    p.strokeStyle(cssRgb(borderColor));
    p.lineWidth(spec.border * 2);
    p.fill();
    p.stroke();
  }
  tracePolygon(p, solidPts);
  p.fillStyle(cssRgb(colours.goal));
  p.fill();
};
