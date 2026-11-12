import { cyberArcadeMaterial } from '../render/cyberArcadeMaterial';

export interface LegacyMenuBackdropStar {
  alpha: number;
  drift: number;
  radius: number;
  speed: number;
  x: number;
  y: number;
  /**
   * Stable per-star identity in [0, 1), fixed at creation and reassigned
   * only when the star is genuinely reborn (resetLegacyMenuBackdropStarNearWarpOrigin).
   * Confirmed real defect (owner-reported: background stars "switch colors
   * like a strobe" instead of smoothly twinkling): the renderer used to
   * derive its own per-frame "seed" as `((star.x * 9973) + (star.y * 6151))
   * % 1` -- looks like a stable position-keyed hash, but isn't one in
   * practice. Stars drift continuously (advanceLegacyMenuBackdropStars),
   * and multiplying a smoothly-changing float by a large constant before
   * taking it mod 1 amplifies even a sub-pixel position change into an
   * effectively unrelated result -- measured live: for a star moving at
   * its own ordinary drift speed, that expression produced a new,
   * uncorrelated value in [0, 1) on almost every single real frame (30
   * consecutive samples at 50ms apart: 0.473, 0.375, 0.281, 0.198, ...,
   * jumping the full range with no visible pattern), not a stable
   * identity. Every visual it fed -- the sparkle hue, the round-star
   * white/blue/warm color bucket, and each star's own twinkle PERIOD --
   * was silently re-randomizing every frame as a result, which is what
   * actually read as "switching colors like a strobe" (worse than a slow
   * hue rotation) and, via the period, as a non-smooth brightness curve.
   * This field replaces that unstable derivation with a real stored value
   * that only changes at genuine star-rebirth, restoring the already-
   * intended "each star gets its own fixed period/color, twinkling
   * in and out" design the surrounding code already documents.
   */
  seed: number;
}

export interface LegacyMenuBackdropPalette {
  fieldColor: number;
  overlayAlpha: number;
  starAlphaScale: number;
}

const roundBackdropNumber = (value: number): number => Math.round(value * 1000) / 1000;

export const LEGACY_MENU_STAR_COUNT = 240;
export const LEGACY_MENU_BACKDROP_STAR_MOTION = 'radial-warp';
export const LEGACY_MENU_BACKDROP_MOTION_PROFILE = 'visible-parallax-warp';

const LEGACY_MENU_BACKDROP_WARP_CENTER_X = 0.5;
const LEGACY_MENU_BACKDROP_WARP_CENTER_Y = 0.5;
const LEGACY_MENU_BACKDROP_WARP_WRAP_RADIUS = 0.82;
const LEGACY_MENU_BACKDROP_WARP_RESPAWN_MIN_RADIUS = 0.018;
const LEGACY_MENU_BACKDROP_WARP_RESPAWN_RADIUS_RANGE = 0.14;
const LEGACY_MENU_BACKDROP_WARP_EDGE_MARGIN = 0.08;
const LEGACY_MENU_BACKDROP_LIGHT_STAR_SPEED_SCALE = 1.04;
const LEGACY_MENU_BACKDROP_DARK_STAR_SPEED_SCALE = 0.68;

export function createLegacyMenuBackdropStars(
  random: () => number = Math.random
): LegacyMenuBackdropStar[] {
  return Array.from({ length: LEGACY_MENU_STAR_COUNT }, () => {
    // Radius, speed, and alpha all key off one shared "depth" value instead
    // of rolling independently -- a real warp field reads as three-
    // dimensional because near stars are simultaneously bigger, faster, and
    // brighter, not because any single one of those varies on its own. The
    // square bias (depth * depth) keeps the distribution mostly small/dim/
    // far stars with a handful of standout near ones, matching how an actual
    // starfield's brightness histogram looks rather than a flat spread.
    const depth = random() * random();
    return {
      x: random(),
      y: random(),
      radius: 0.6 + (depth * 2.7) + (random() * 0.35),
      speed: 0.009 + (depth * 0.052) + (random() * 0.006),
      alpha: 0.16 + (depth * 0.74) + (random() * 0.1),
      drift: -0.03 + (random() * 0.06),
      seed: random()
    };
  });
}

export function advanceLegacyMenuBackdropStars(
  stars: LegacyMenuBackdropStar[],
  deltaMs: number,
  darkMode: boolean,
  random: () => number = Math.random
): void {
  const elapsedSeconds = Math.min(0.25, Math.max(0, deltaMs / 1000));
  const speedScale = darkMode
    ? LEGACY_MENU_BACKDROP_DARK_STAR_SPEED_SCALE
    : LEGACY_MENU_BACKDROP_LIGHT_STAR_SPEED_SCALE;
  const tangentScale = darkMode ? 0.026 : 0.04;

  for (const star of stars) {
    const warpVector = resolveLegacyMenuBackdropWarpVector(star);
    const distanceFromCenter = resolveLegacyMenuBackdropWarpDistance(star);
    const accelerationScale = 0.82 + Math.min(1.55, distanceFromCenter * 2.35);
    const outwardStep = star.speed * elapsedSeconds * speedScale * accelerationScale;
    const tangentStep = star.drift * elapsedSeconds * tangentScale;

    star.x += (warpVector.x * outwardStep) + (-warpVector.y * tangentStep);
    star.y += (warpVector.y * outwardStep) + (warpVector.x * tangentStep);

    if (shouldRecycleLegacyMenuBackdropStar(star)) {
      resetLegacyMenuBackdropStarNearWarpOrigin(star, random);
    }
  }
}

export function resolveLegacyMenuBackdropWarpDistance(star: LegacyMenuBackdropStar): number {
  return Math.hypot(
    star.x - LEGACY_MENU_BACKDROP_WARP_CENTER_X,
    star.y - LEGACY_MENU_BACKDROP_WARP_CENTER_Y
  );
}

export function resolveLegacyMenuBackdropWarpVector(star: LegacyMenuBackdropStar): { x: number; y: number } {
  const deltaX = star.x - LEGACY_MENU_BACKDROP_WARP_CENTER_X;
  const deltaY = star.y - LEGACY_MENU_BACKDROP_WARP_CENTER_Y;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance > 0.0001) {
    return {
      x: deltaX / distance,
      y: deltaY / distance
    };
  }

  const fallbackAngle = star.drift >= 0 ? -Math.PI / 4 : (-3 * Math.PI) / 4;
  return {
    x: Math.cos(fallbackAngle),
    y: Math.sin(fallbackAngle)
  };
}

function shouldRecycleLegacyMenuBackdropStar(star: LegacyMenuBackdropStar): boolean {
  return star.x < -LEGACY_MENU_BACKDROP_WARP_EDGE_MARGIN
    || star.x > 1 + LEGACY_MENU_BACKDROP_WARP_EDGE_MARGIN
    || star.y < -LEGACY_MENU_BACKDROP_WARP_EDGE_MARGIN
    || star.y > 1 + LEGACY_MENU_BACKDROP_WARP_EDGE_MARGIN
    || resolveLegacyMenuBackdropWarpDistance(star) > LEGACY_MENU_BACKDROP_WARP_WRAP_RADIUS;
}

function resetLegacyMenuBackdropStarNearWarpOrigin(
  star: LegacyMenuBackdropStar,
  random: () => number
): void {
  const angle = random() * Math.PI * 2;
  const radius = LEGACY_MENU_BACKDROP_WARP_RESPAWN_MIN_RADIUS
    + (random() * LEGACY_MENU_BACKDROP_WARP_RESPAWN_RADIUS_RANGE);

  star.x = LEGACY_MENU_BACKDROP_WARP_CENTER_X + (Math.cos(angle) * radius);
  star.y = LEGACY_MENU_BACKDROP_WARP_CENTER_Y + (Math.sin(angle) * radius);
  // A genuine rebirth is the one moment a fresh identity is correct --
  // this is a new point of light appearing at the warp origin, not the
  // same star silently reseeding mid-life (see the field's own doc).
  star.seed = random();
}

export function resolveLegacyMenuBackdropPalette(darkMode: boolean): LegacyMenuBackdropPalette {
  if (darkMode) {
    return {
      fieldColor: cyberArcadeMaterial.substrate.field,
      starAlphaScale: 0.74,
      overlayAlpha: 0.1
    };
  }

  return {
    fieldColor: cyberArcadeMaterial.substrate.fieldRaised,
    starAlphaScale: 1.08,
    overlayAlpha: 0
  };
}

export function resolveLegacyMenuBackdropStreakLength(star: LegacyMenuBackdropStar): number {
  const distanceFromCenter = resolveLegacyMenuBackdropWarpDistance(star);
  return Math.min(6, Math.max(1, Math.round(
    (star.speed * 38) + (distanceFromCenter * 6.2) + (star.radius * 0.52)
  )));
}

export function resolveLegacyMenuBackdropTailStep(star: LegacyMenuBackdropStar): { x: number; y: number } {
  const warpVector = resolveLegacyMenuBackdropWarpVector(star);
  const distanceFromCenter = resolveLegacyMenuBackdropWarpDistance(star);
  const tailMagnitude = 0.68 + Math.min(0.28, distanceFromCenter * 0.42);

  return {
    x: roundBackdropNumber(-warpVector.x * tailMagnitude),
    y: roundBackdropNumber(-warpVector.y * tailMagnitude)
  };
}
