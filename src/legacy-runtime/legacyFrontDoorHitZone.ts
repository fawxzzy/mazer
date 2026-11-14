import { LEGACY_MIN_HIT_TARGET_PX, resolveLegacyMinHitRect, type LegacyHitRect, type LegacyHitRectInput } from './legacyHitTarget';

/**
 * MAZER-UI-015: the explicit hit zone for the front-door Start / Login wordmark.
 * It used to be the whole screen, so a stray tap anywhere started a run. The
 * wordmark keeps its look; only this zone (generous around the glyph word, never
 * smaller than the 44 px target) starts a run.
 */
export const FRONT_DOOR_HIT_ZONE_WIDTH_SCALE = 1.6;
export const FRONT_DOOR_HIT_ZONE_HEIGHT_SCALE = 2;
export const FRONT_DOOR_HIT_ZONE_MIN_HEIGHT_PX = 88;
export const FRONT_DOOR_HIT_ZONE_EDGE_MARGIN_PX = 8;

export const resolveLegacyFrontDoorHitZone = (
  visual: LegacyHitRectInput,
  viewport: { height: number; width: number }
): LegacyHitRect => {
  const maxWidth = Math.max(LEGACY_MIN_HIT_TARGET_PX, viewport.width - (FRONT_DOOR_HIT_ZONE_EDGE_MARGIN_PX * 2));
  const width = Math.min(maxWidth, Math.max(visual.width, visual.width * FRONT_DOOR_HIT_ZONE_WIDTH_SCALE));
  const height = Math.max(FRONT_DOOR_HIT_ZONE_MIN_HEIGHT_PX, visual.height * FRONT_DOOR_HIT_ZONE_HEIGHT_SCALE);
  return resolveLegacyMinHitRect(
    {
      height,
      left: visual.left + ((visual.width - width) / 2),
      top: visual.top + ((visual.height - height) / 2),
      width
    },
    viewport,
    LEGACY_MIN_HIT_TARGET_PX
  );
};

export const isPointInLegacyFrontDoorHitZone = (zone: LegacyHitRect, x: number, y: number): boolean => (
  x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom
);
