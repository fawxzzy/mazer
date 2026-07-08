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

const LIGHT_BACKDROP_SHARDS: LegacyMenuBackdropShardTemplate[] = [
  { xRatio: 0.52, yRatio: 0.44, lengthRatio: 0.62, thicknessRatio: 0.038, angle: -0.64, alpha: 0.055, color: 0x72e0bf },
  { xRatio: 0.2, yRatio: 0.23, lengthRatio: 0.38, thicknessRatio: 0.028, angle: 0.74, alpha: 0.034, color: 0xb7f2ff },
  { xRatio: 0.84, yRatio: 0.22, lengthRatio: 0.42, thicknessRatio: 0.03, angle: -0.82, alpha: 0.038, color: 0x9cffd2 },
  { xRatio: 0.82, yRatio: 0.78, lengthRatio: 0.34, thicknessRatio: 0.026, angle: 0.62, alpha: 0.03, color: 0xfff05a },
  { xRatio: 0.14, yRatio: 0.82, lengthRatio: 0.3, thicknessRatio: 0.022, angle: -0.52, alpha: 0.024, color: 0x72e0bf },
  { xRatio: 0.13, yRatio: 0.12, lengthRatio: 0.14, thicknessRatio: 0.018, angle: 0.78, alpha: 0.026, color: 0xd8cbff },
  { xRatio: 0.9, yRatio: 0.12, lengthRatio: 0.15, thicknessRatio: 0.018, angle: -0.78, alpha: 0.028, color: 0xe7dcff },
  { xRatio: 0.9, yRatio: 0.86, lengthRatio: 0.14, thicknessRatio: 0.016, angle: 0.58, alpha: 0.02, color: 0xd2c4ff }
];

const DARK_BACKDROP_SHARDS: LegacyMenuBackdropShardTemplate[] = [
  { xRatio: 0.52, yRatio: 0.44, lengthRatio: 0.58, thicknessRatio: 0.034, angle: -0.64, alpha: 0.04, color: 0x3b9f8a },
  { xRatio: 0.2, yRatio: 0.2, lengthRatio: 0.36, thicknessRatio: 0.024, angle: 0.74, alpha: 0.024, color: 0x5a9bad },
  { xRatio: 0.84, yRatio: 0.22, lengthRatio: 0.4, thicknessRatio: 0.026, angle: -0.82, alpha: 0.026, color: 0x5ac693 },
  { xRatio: 0.82, yRatio: 0.8, lengthRatio: 0.32, thicknessRatio: 0.022, angle: 0.62, alpha: 0.022, color: 0x8f842e },
  { xRatio: 0.15, yRatio: 0.82, lengthRatio: 0.28, thicknessRatio: 0.02, angle: -0.52, alpha: 0.018, color: 0x2d7a6c },
  { xRatio: 0.12, yRatio: 0.12, lengthRatio: 0.13, thicknessRatio: 0.016, angle: 0.78, alpha: 0.018, color: 0xd7cdff },
  { xRatio: 0.9, yRatio: 0.12, lengthRatio: 0.13, thicknessRatio: 0.016, angle: -0.78, alpha: 0.018, color: 0xe4dcff },
  { xRatio: 0.89, yRatio: 0.85, lengthRatio: 0.12, thicknessRatio: 0.014, angle: 0.58, alpha: 0.014, color: 0xcfc3ff }
];

const GLASS_SHARD_TEMPLATES: LegacyMenuBackdropShardTemplate[] = [
  { xRatio: 0.28, yRatio: 0.36, lengthRatio: 0.34, thicknessRatio: 0.03, angle: -0.7, alpha: 0.115, color: 0x72e0bf },
  { xRatio: 0.72, yRatio: 0.38, lengthRatio: 0.42, thicknessRatio: 0.034, angle: 0.64, alpha: 0.098, color: 0xb7f2ff },
  { xRatio: 0.5, yRatio: 0.58, lengthRatio: 0.4, thicknessRatio: 0.032, angle: -0.34, alpha: 0.106, color: 0x9cffd2 },
  { xRatio: 0.18, yRatio: 0.74, lengthRatio: 0.3, thicknessRatio: 0.026, angle: 0.82, alpha: 0.086, color: 0x9cffd2 },
  { xRatio: 0.84, yRatio: 0.78, lengthRatio: 0.32, thicknessRatio: 0.028, angle: -0.74, alpha: 0.09, color: 0xfff05a }
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
  const speedScale = darkMode ? 0.22 : 0.38;
  const driftScale = darkMode ? 0.12 : 0.18;

  for (const star of stars) {
    star.y += star.speed * (deltaMs / 1000) * speedScale;
    star.x += star.drift * (deltaMs / 1000) * driftScale;

    if (star.y > 1.06) {
      star.y = -0.06;
      star.x = random();
    }

    if (star.x > 1.03) {
      star.x = -0.03;
    } else if (star.x < -0.03) {
      star.x = 1.03;
    }
  }
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
  return Math.max(1, Math.round((star.speed * 34) + (star.radius * 0.52)));
}

export function resolveLegacyMenuBackdropTailStep(star: LegacyMenuBackdropStar): { x: number; y: number } {
  if (star.drift > 0.002) {
    return { x: -1, y: -1 };
  }

  if (star.drift < -0.002) {
    return { x: 1, y: -1 };
  }

  return { x: 0, y: -1 };
}
