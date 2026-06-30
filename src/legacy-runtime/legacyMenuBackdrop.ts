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

export interface LegacyMenuBackdropOrb {
  alpha: number;
  color: number;
  radius: number;
  x: number;
  y: number;
}

interface LegacyMenuBackdropOrbTemplate {
  alpha: number;
  color: number;
  radiusRatio: number;
  xRatio: number;
  yRatio: number;
}

export const LEGACY_MENU_STAR_COUNT = 520;

const LIGHT_BACKDROP_ORBS: LegacyMenuBackdropOrbTemplate[] = [
  { xRatio: 0.52, yRatio: 0.45, radiusRatio: 0.38, alpha: 0.082, color: 0x754996 },
  { xRatio: 0.2, yRatio: 0.22, radiusRatio: 0.24, alpha: 0.044, color: 0x5d356f },
  { xRatio: 0.84, yRatio: 0.22, radiusRatio: 0.25, alpha: 0.05, color: 0x6f4387 },
  { xRatio: 0.82, yRatio: 0.78, radiusRatio: 0.22, alpha: 0.042, color: 0x583163 },
  { xRatio: 0.14, yRatio: 0.82, radiusRatio: 0.18, alpha: 0.026, color: 0x4b294f },
  { xRatio: 0.13, yRatio: 0.12, radiusRatio: 0.06, alpha: 0.016, color: 0xd8cbff },
  { xRatio: 0.9, yRatio: 0.12, radiusRatio: 0.058, alpha: 0.018, color: 0xe7dcff },
  { xRatio: 0.9, yRatio: 0.86, radiusRatio: 0.054, alpha: 0.013, color: 0xd2c4ff }
];

const DARK_BACKDROP_ORBS: LegacyMenuBackdropOrbTemplate[] = [
  { xRatio: 0.52, yRatio: 0.45, radiusRatio: 0.36, alpha: 0.058, color: 0x4b255f },
  { xRatio: 0.2, yRatio: 0.2, radiusRatio: 0.23, alpha: 0.03, color: 0x31133f },
  { xRatio: 0.84, yRatio: 0.22, radiusRatio: 0.24, alpha: 0.032, color: 0x422054 },
  { xRatio: 0.82, yRatio: 0.8, radiusRatio: 0.2, alpha: 0.028, color: 0x2c142f },
  { xRatio: 0.15, yRatio: 0.82, radiusRatio: 0.16, alpha: 0.02, color: 0x261126 },
  { xRatio: 0.12, yRatio: 0.12, radiusRatio: 0.055, alpha: 0.012, color: 0xd7cdff },
  { xRatio: 0.9, yRatio: 0.12, radiusRatio: 0.052, alpha: 0.012, color: 0xe4dcff },
  { xRatio: 0.89, yRatio: 0.85, radiusRatio: 0.05, alpha: 0.01, color: 0xcfc3ff }
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
      fieldColor: 0x150b1f,
      starAlphaScale: 0.74,
      overlayAlpha: 0.1
    };
  }

  return {
    fieldColor: 0x29163f,
    starAlphaScale: 1.08,
    overlayAlpha: 0
  };
}

export function resolveLegacyMenuBackdropOrbs(
  width: number,
  height: number,
  darkMode: boolean
): LegacyMenuBackdropOrb[] {
  const minDimension = Math.min(width, height);
  const templates = darkMode ? DARK_BACKDROP_ORBS : LIGHT_BACKDROP_ORBS;

  return templates.map((template) => ({
    x: width * template.xRatio,
    y: height * template.yRatio,
    radius: minDimension * template.radiusRatio,
    alpha: template.alpha,
    color: template.color
  }));
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
