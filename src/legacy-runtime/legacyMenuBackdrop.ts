export interface LegacyMenuBackdropStar {
  alpha: number;
  drift: number;
  radius: number;
  speed: number;
  x: number;
  y: number;
}

export interface LegacyMenuBackdropPalette {
  fieldColor: number;
  overlayAlpha: number;
  starAlphaScale: number;
}

export interface LegacyMenuBackdropShard {
  alpha: number;
  angle: number;
  color: number;
  length: number;
  thickness: number;
  x: number;
  y: number;
}

export interface LegacyMenuBackdropGlassShard {
  alpha: number;
  angle: number;
  color: number;
  length: number;
  thickness: number;
  x: number;
  y: number;
}

export interface LegacyMenuBackdropDriftRune {
  alpha: number;
  angle: number;
  color: number;
  size: number;
  x: number;
  y: number;
}

interface LegacyMenuBackdropShardTemplate {
  alpha: number;
  angle: number;
  color: number;
  lengthRatio: number;
  thicknessRatio: number;
  xRatio: number;
  yRatio: number;
}

export const LEGACY_MENU_STAR_COUNT = 180;
export const LEGACY_MENU_BACKDROP_SHARD_COUNT = 8;
export const LEGACY_MENU_GLASS_SHARD_COUNT = 5;
export const LEGACY_MENU_DRIFT_RUNE_COUNT = 14;
export const LEGACY_MENU_BACKDROP_STAR_MOTION = 'radial-warp';

const LEGACY_MENU_BACKDROP_WARP_CENTER_X = 0.5;
const LEGACY_MENU_BACKDROP_WARP_CENTER_Y = 0.5;
const LEGACY_MENU_BACKDROP_WARP_WRAP_RADIUS = 0.82;
const LEGACY_MENU_BACKDROP_WARP_RESPAWN_MIN_RADIUS = 0.018;
const LEGACY_MENU_BACKDROP_WARP_RESPAWN_RADIUS_RANGE = 0.14;
const LEGACY_MENU_BACKDROP_WARP_EDGE_MARGIN = 0.08;

const LIGHT_BACKDROP_SHARDS: LegacyMenuBackdropShardTemplate[] = [
  { xRatio: 0.1, yRatio: 0.25, lengthRatio: 0.24, thicknessRatio: 0.012, angle: 0.74, alpha: 0.038, color: 0xb7f2ff },
  { xRatio: 0.9, yRatio: 0.18, lengthRatio: 0.26, thicknessRatio: 0.012, angle: -0.82, alpha: 0.04, color: 0x9cffd2 },
  { xRatio: 0.16, yRatio: 0.82, lengthRatio: 0.22, thicknessRatio: 0.01, angle: -0.52, alpha: 0.03, color: 0x72e0bf },
  { xRatio: 0.84, yRatio: 0.8, lengthRatio: 0.24, thicknessRatio: 0.011, angle: 0.62, alpha: 0.032, color: 0xfff05a },
  { xRatio: 0.31, yRatio: 0.13, lengthRatio: 0.13, thicknessRatio: 0.009, angle: 0.78, alpha: 0.024, color: 0xd8cbff },
  { xRatio: 0.71, yRatio: 0.12, lengthRatio: 0.14, thicknessRatio: 0.009, angle: -0.78, alpha: 0.026, color: 0xe7dcff },
  { xRatio: 0.08, yRatio: 0.56, lengthRatio: 0.16, thicknessRatio: 0.008, angle: -0.36, alpha: 0.022, color: 0x72e0bf },
  { xRatio: 0.92, yRatio: 0.58, lengthRatio: 0.16, thicknessRatio: 0.008, angle: 0.36, alpha: 0.022, color: 0xd2c4ff }
];

const DARK_BACKDROP_SHARDS: LegacyMenuBackdropShardTemplate[] = [
  { xRatio: 0.1, yRatio: 0.25, lengthRatio: 0.22, thicknessRatio: 0.011, angle: 0.74, alpha: 0.026, color: 0x5a9bad },
  { xRatio: 0.9, yRatio: 0.18, lengthRatio: 0.24, thicknessRatio: 0.011, angle: -0.82, alpha: 0.028, color: 0x5ac693 },
  { xRatio: 0.16, yRatio: 0.82, lengthRatio: 0.2, thicknessRatio: 0.009, angle: -0.52, alpha: 0.022, color: 0x2d7a6c },
  { xRatio: 0.84, yRatio: 0.8, lengthRatio: 0.22, thicknessRatio: 0.01, angle: 0.62, alpha: 0.024, color: 0x8f842e },
  { xRatio: 0.31, yRatio: 0.13, lengthRatio: 0.12, thicknessRatio: 0.008, angle: 0.78, alpha: 0.018, color: 0xd7cdff },
  { xRatio: 0.71, yRatio: 0.12, lengthRatio: 0.13, thicknessRatio: 0.008, angle: -0.78, alpha: 0.02, color: 0xe4dcff },
  { xRatio: 0.08, yRatio: 0.56, lengthRatio: 0.15, thicknessRatio: 0.007, angle: -0.36, alpha: 0.016, color: 0x2d7a6c },
  { xRatio: 0.92, yRatio: 0.58, lengthRatio: 0.15, thicknessRatio: 0.007, angle: 0.36, alpha: 0.016, color: 0xcfc3ff }
];

const GLASS_SHARD_TEMPLATES: LegacyMenuBackdropShardTemplate[] = [
  { xRatio: 0.23, yRatio: 0.34, lengthRatio: 0.18, thicknessRatio: 0.012, angle: -0.7, alpha: 0.078, color: 0x72e0bf },
  { xRatio: 0.77, yRatio: 0.36, lengthRatio: 0.22, thicknessRatio: 0.012, angle: 0.64, alpha: 0.072, color: 0xb7f2ff },
  { xRatio: 0.18, yRatio: 0.62, lengthRatio: 0.17, thicknessRatio: 0.01, angle: -0.34, alpha: 0.064, color: 0x9cffd2 },
  { xRatio: 0.82, yRatio: 0.66, lengthRatio: 0.18, thicknessRatio: 0.011, angle: 0.82, alpha: 0.066, color: 0x9cffd2 },
  { xRatio: 0.52, yRatio: 0.86, lengthRatio: 0.2, thicknessRatio: 0.01, angle: -0.74, alpha: 0.06, color: 0xfff05a }
];

export function createLegacyMenuBackdropStars(
  random: () => number = Math.random
): LegacyMenuBackdropStar[] {
  return Array.from({ length: LEGACY_MENU_STAR_COUNT }, () => ({
    x: random(),
    y: random(),
    radius: 0.72 + (random() * 2.18),
    speed: 0.01 + (random() * 0.034),
    alpha: 0.24 + (random() * 0.64),
    drift: -0.03 + (random() * 0.06)
  }));
}

export function advanceLegacyMenuBackdropStars(
  stars: LegacyMenuBackdropStar[],
  deltaMs: number,
  darkMode: boolean,
  random: () => number = Math.random
): void {
  const elapsedSeconds = Math.min(0.25, Math.max(0, deltaMs / 1000));
  const speedScale = darkMode ? 0.46 : 0.72;
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
}

export function resolveLegacyMenuBackdropPalette(darkMode: boolean): LegacyMenuBackdropPalette {
  if (darkMode) {
    return {
      fieldColor: 0x090d19,
      starAlphaScale: 0.74,
      overlayAlpha: 0.1
    };
  }

  return {
    fieldColor: 0x10172c,
    starAlphaScale: 1.08,
    overlayAlpha: 0
  };
}

export function resolveLegacyMenuBackdropShards(
  width: number,
  height: number,
  darkMode: boolean
): LegacyMenuBackdropShard[] {
  const minDimension = Math.min(width, height);
  const templates = darkMode ? DARK_BACKDROP_SHARDS : LIGHT_BACKDROP_SHARDS;

  return templates.map((template) => ({
    x: width * template.xRatio,
    y: height * template.yRatio,
    length: minDimension * template.lengthRatio,
    thickness: Math.max(4, minDimension * template.thicknessRatio),
    angle: template.angle,
    alpha: template.alpha,
    color: template.color
  }));
}

export function resolveLegacyMenuBackdropGlassShards(
  width: number,
  height: number,
  darkMode: boolean,
  timeMs: number,
  animated: boolean
): LegacyMenuBackdropGlassShard[] {
  const minDimension = Math.min(width, height);
  const phase = animated ? timeMs / 1000 : 0;
  const alphaScale = darkMode ? 0.7 : 1;

  return GLASS_SHARD_TEMPLATES.map((template, index) => {
    const localPhase = phase * (0.22 + (index * 0.034)) + (index * 1.73);
    const driftX = Math.sin(localPhase) * 0.042;
    const driftY = Math.cos(localPhase * 0.82) * 0.028;

    return {
      x: width * (template.xRatio + driftX),
      y: height * (template.yRatio + driftY),
      length: minDimension * template.lengthRatio,
      thickness: Math.max(3, minDimension * template.thicknessRatio),
      angle: template.angle + (animated ? Math.sin(localPhase * 0.56) * 0.08 : 0),
      alpha: template.alpha * alphaScale,
      color: template.color
    };
  });
}

export function resolveLegacyMenuBackdropDriftRunes(
  width: number,
  height: number,
  darkMode: boolean,
  timeMs: number,
  animated: boolean
): LegacyMenuBackdropDriftRune[] {
  const progress = animated ? timeMs / 14000 : 0;
  const minDimension = Math.min(width, height);
  const alphaScale = darkMode ? 0.68 : 1;
  const colors = [0x72e0bf, 0xb7f2ff, 0x9cffd2, 0xd8cbff];

  return Array.from({ length: LEGACY_MENU_DRIFT_RUNE_COUNT }, (_, index) => {
    const laneSeed = (index * 0.61803398875) % 1;
    const driftSeed = (index * 0.27316821) % 1;
    const x = width * ((laneSeed + (progress * (0.32 + (driftSeed * 0.18)))) % 1);
    const y = height * ((driftSeed + (progress * (0.12 + (laneSeed * 0.1))) + (Math.sin((progress * 8) + index) * 0.022)) % 1);

    return {
      x,
      y,
      size: Math.max(3, minDimension * (0.0072 + (laneSeed * 0.004))),
      angle: (laneSeed * Math.PI) + (animated ? progress * 1.7 : 0),
      alpha: (0.14 + (driftSeed * 0.1)) * alphaScale,
      color: colors[index % colors.length] ?? 0xb7f2ff
    };
  });
}

export function resolveLegacyMenuBackdropStreakLength(star: LegacyMenuBackdropStar): number {
  const distanceFromCenter = resolveLegacyMenuBackdropWarpDistance(star);
  return Math.min(6, Math.max(1, Math.round(
    (star.speed * 38) + (distanceFromCenter * 6.2) + (star.radius * 0.52)
  )));
}

export function resolveLegacyMenuBackdropTailStep(star: LegacyMenuBackdropStar): { x: number; y: number } {
  const warpVector = resolveLegacyMenuBackdropWarpVector(star);
  const quantizeTailAxis = (value: number): number => {
    if (Math.abs(value) < 0.38) {
      return 0;
    }

    return value > 0 ? -1 : 1;
  };

  return {
    x: quantizeTailAxis(warpVector.x),
    y: quantizeTailAxis(warpVector.y)
  };
}
