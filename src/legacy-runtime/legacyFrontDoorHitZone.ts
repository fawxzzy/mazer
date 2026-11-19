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

/**
 * Tap-anywhere start: on the front door a tap almost anywhere starts a run, except within
 * this margin of any other UI button (the header menu button, ...).
 */
export const FRONT_DOOR_TAP_ANYWHERE_EXCLUSION_MARGIN_PX = 28;

export const isFrontDoorTapAnywhereStart = (
  point: { x: number; y: number },
  otherButtonBounds: ReadonlyArray<{ left: number; top: number; width: number; height: number }>,
  viewport: { height: number; width: number },
  margin: number = FRONT_DOOR_TAP_ANYWHERE_EXCLUSION_MARGIN_PX
): boolean => {
  if (point.x < 0 || point.y < 0 || point.x > viewport.width || point.y > viewport.height) {
    return false;
  }
  return !otherButtonBounds.some((rect) => (
    point.x >= rect.left - margin
    && point.x <= rect.left + rect.width + margin
    && point.y >= rect.top - margin
    && point.y <= rect.top + rect.height + margin
  ));
};

export interface FrontDoorTapAnywhereContext {
  hasStartButton: boolean;
  levelPreviewActive: boolean;
  /** L6: the header menu dropdown is open or still closing; no tap may start a run through it. */
  menuOpen?: boolean;
  mode: string;
  objectsUnderPointer: number;
  otherButtonBounds: ReadonlyArray<{ left: number; top: number; width: number; height: number }>;
  overlay: string;
  playAccess: boolean;
  point: { x: number; y: number };
  viewport: { height: number; width: number };
}

/** Full gate for the tap-anywhere start (MenuScene.handleFrontDoorTapAnywhere delegates here). */
export const shouldFrontDoorTapAnywhereStartRun = (ctx: FrontDoorTapAnywhereContext): boolean => (
  ctx.mode === 'menu'
  && ctx.overlay === 'none'
  && ctx.objectsUnderPointer <= 0
  && !ctx.levelPreviewActive
  && ctx.menuOpen !== true
  && ctx.playAccess
  && ctx.hasStartButton
  && isFrontDoorTapAnywhereStart(ctx.point, ctx.otherButtonBounds, ctx.viewport)
);
