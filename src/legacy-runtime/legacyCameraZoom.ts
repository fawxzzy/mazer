import { clampNumber } from './legacyDefaults';

export const LEGACY_CAMERA_ZOOM_MIN = -50;
export const LEGACY_CAMERA_ZOOM_MAX = 50;
export const LEGACY_CAMERA_ZOOM_DEFAULT = 0;
export const LEGACY_CAMERA_ZOOM_STEP = 5;

export const normalizeLegacyCameraZoom = (
  value: unknown,
  fallback = LEGACY_CAMERA_ZOOM_DEFAULT
): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  const fallbackNumeric = typeof fallback === 'number' && Number.isFinite(fallback)
    ? fallback
    : LEGACY_CAMERA_ZOOM_DEFAULT;

  if (!Number.isFinite(numeric)) {
    return clampNumber(
      Math.round(fallbackNumeric),
      LEGACY_CAMERA_ZOOM_MIN,
      LEGACY_CAMERA_ZOOM_MAX
    );
  }

  return clampNumber(
    Math.round(numeric),
    LEGACY_CAMERA_ZOOM_MIN,
    LEGACY_CAMERA_ZOOM_MAX
  );
};

export const quantizeLegacyCameraZoom = (
  value: unknown,
  fallback = LEGACY_CAMERA_ZOOM_DEFAULT
): number => {
  const normalized = normalizeLegacyCameraZoom(value, fallback);
  const stepped = Math.round(normalized / LEGACY_CAMERA_ZOOM_STEP) * LEGACY_CAMERA_ZOOM_STEP;
  const clamped = clampNumber(stepped, LEGACY_CAMERA_ZOOM_MIN, LEGACY_CAMERA_ZOOM_MAX);

  return Object.is(clamped, -0) ? 0 : clamped;
};

export const resolveLegacyCameraZoomPosition = (value: unknown): number => (
  (quantizeLegacyCameraZoom(value) - LEGACY_CAMERA_ZOOM_MIN)
  / (LEGACY_CAMERA_ZOOM_MAX - LEGACY_CAMERA_ZOOM_MIN)
);

export const resolveLegacyCameraZoomFromPosition = (position: number): number => {
  const normalizedPosition = clampNumber(
    Number.isFinite(position) ? position : 0.5,
    0,
    1
  );

  return quantizeLegacyCameraZoom(
    LEGACY_CAMERA_ZOOM_MIN
      + (normalizedPosition * (LEGACY_CAMERA_ZOOM_MAX - LEGACY_CAMERA_ZOOM_MIN))
  );
};

export const formatLegacyCameraZoomPercent = (value: unknown): string => (
  `${100 + quantizeLegacyCameraZoom(value)}%`
);
