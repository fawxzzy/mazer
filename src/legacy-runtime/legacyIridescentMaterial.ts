export const LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR = 0xe7fff4;
export const LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE = 145;
export const LEGACY_IRIDESCENT_GREEN_ANCHOR = 0x36ff7d;

export const LEGACY_IRIDESCENT_MIDNIGHT_STOPS = [
  0x36ff7d,
  0x59fff0,
  0x7da8ff,
  0xb87dff,
  0xff61c7,
  0xffd36a
] as const;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const normalizeUnit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value - Math.floor(value);
};

const mixChannel = (from: number, to: number, amount: number): number => (
  Math.round(from + ((to - from) * clamp01(amount)))
);

export const mixLegacyIridescentColor = (from: number, to: number, amount: number): number => {
  const fromR = (from >> 16) & 0xff;
  const fromG = (from >> 8) & 0xff;
  const fromB = from & 0xff;
  const toR = (to >> 16) & 0xff;
  const toG = (to >> 8) & 0xff;
  const toB = to & 0xff;
  return (
    (mixChannel(fromR, toR, amount) << 16)
    | (mixChannel(fromG, toG, amount) << 8)
    | mixChannel(fromB, toB, amount)
  );
};

export const measureLegacyIridescentColorDistance = (left: number, right: number): number => {
  const leftR = (left >> 16) & 0xff;
  const leftG = (left >> 8) & 0xff;
  const leftB = left & 0xff;
  const rightR = (right >> 16) & 0xff;
  const rightG = (right >> 8) & 0xff;
  const rightB = right & 0xff;
  return Math.sqrt(
    ((leftR - rightR) ** 2)
    + ((leftG - rightG) ** 2)
    + ((leftB - rightB) ** 2)
  );
};

export const resolveLegacyPathSafeIridescentColor = (
  color: number,
  fallback = LEGACY_IRIDESCENT_GREEN_ANCHOR
): number => {
  if (
    measureLegacyIridescentColorDistance(color, LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR)
    >= LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE
  ) {
    return color;
  }

  if (
    measureLegacyIridescentColorDistance(fallback, LEGACY_IRIDESCENT_PATH_CORE_CONTRAST_COLOR)
    >= LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE
  ) {
    return fallback;
  }

  return 0xff61c7;
};

export const resolveLegacyIridescentMidnightColor = (
  position: number,
  stops: readonly number[] = LEGACY_IRIDESCENT_MIDNIGHT_STOPS
): number => {
  if (stops.length === 0) {
    return LEGACY_IRIDESCENT_GREEN_ANCHOR;
  }
  if (stops.length === 1) {
    return stops[0] ?? LEGACY_IRIDESCENT_GREEN_ANCHOR;
  }

  const wrapped = normalizeUnit(position) * stops.length;
  const startIndex = Math.floor(wrapped) % stops.length;
  const endIndex = (startIndex + 1) % stops.length;
  return mixLegacyIridescentColor(
    stops[startIndex] ?? LEGACY_IRIDESCENT_GREEN_ANCHOR,
    stops[endIndex] ?? LEGACY_IRIDESCENT_GREEN_ANCHOR,
    wrapped - Math.floor(wrapped)
  );
};

export const resolveLegacyIridescentTrailColor = (
  index: number,
  total: number,
  timeMs: number,
  anchorColor = LEGACY_IRIDESCENT_GREEN_ANCHOR
): number => {
  const trailPosition = total <= 1 ? 0 : index / Math.max(1, total - 1);
  const materialPhase = (timeMs / 7200) + (trailPosition * 0.62);
  const prismColor = resolveLegacyIridescentMidnightColor(materialPhase);
  const blendAmount = 0.34 + (0.16 * Math.sin((trailPosition * Math.PI * 2) + (timeMs / 1800)));
  const safeFallback = mixLegacyIridescentColor(
    anchorColor,
    resolveLegacyIridescentMidnightColor(materialPhase + 0.42),
    0.38
  );
  return resolveLegacyPathSafeIridescentColor(
    mixLegacyIridescentColor(anchorColor, prismColor, blendAmount),
    safeFallback
  );
};

export const resolveLegacyIridescentPulseColor = (
  index: number,
  total: number,
  timeMs: number,
  anchorColor = 0xff61c7
): number => {
  const trailPosition = total <= 1 ? 0 : index / Math.max(1, total - 1);
  const prismColor = resolveLegacyIridescentMidnightColor((timeMs / 2600) + (trailPosition * 0.78) + 0.22);
  const safeFallback = mixLegacyIridescentColor(
    anchorColor,
    resolveLegacyIridescentMidnightColor((timeMs / 2600) + (trailPosition * 0.78) + 0.58),
    0.62
  );
  return resolveLegacyPathSafeIridescentColor(
    mixLegacyIridescentColor(anchorColor, prismColor, 0.58),
    safeFallback
  );
};

export const resolveLegacyIridescentPlayerHaloColor = (
  timeMs: number,
  anchorColor = 0x00b84a
): number => (
  resolveLegacyPathSafeIridescentColor(
    mixLegacyIridescentColor(
      anchorColor,
      resolveLegacyIridescentMidnightColor((timeMs / 3600) + 0.14),
      0.42
    ),
    anchorColor
  )
);

export const resolveLegacyIridescentPlayerCoreColor = (): number => LEGACY_IRIDESCENT_GREEN_ANCHOR;

export const resolveLegacyIridescentPlayerAccentColor = (
  timeMs: number,
  anchorColor = LEGACY_IRIDESCENT_GREEN_ANCHOR
): number => (
  resolveLegacyPathSafeIridescentColor(
    mixLegacyIridescentColor(
      anchorColor,
      resolveLegacyIridescentMidnightColor((timeMs / 4200) + 0.58),
      0.3
    ),
    anchorColor
  )
);
