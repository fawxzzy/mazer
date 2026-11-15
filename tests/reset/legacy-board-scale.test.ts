import { describe, expect, test } from 'vitest';
import { planLegacyBoard, resolveLegacyBoardFloorScale, type LegacyBoardPlanViewport } from '../../src/legacy-runtime/legacyBoardPlan';
import {
  LEGACY_BOARD_BASE_SCALE,
  LEGACY_BOARD_MIN_TILE_PX,
  resolveLegacyBoardDimensions,
  resolveLegacyBoardScaleForLevel
} from '../../src/legacy-runtime/legacyBoardScale';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyProgressionGenerationScale,
  resolveLegacyProgressionScaleDetail
} from '../../src/legacy-runtime/legacyProgression';
import { BOARD_SCALE_REFERENCE_VIEWPORTS } from '../../scripts/analysis/progression-board-scale-table';

const baseTrack = createEmptyLegacyProgressionState().tracks.player;
const trackForLevel = (level: number) => ({
  ...baseTrack,
  level: String(level),
  targetComplexity: Math.min(400, 8 + ((level - 1) * 4))
});

// Phones from 320 px wide up, with and without a notch / home indicator.
const phoneSweep = (): LegacyBoardPlanViewport[] => {
  const out: LegacyBoardPlanViewport[] = [];
  for (let width = 320; width <= 430; width += 10) {
    for (const [height, top, bottom] of [[568, 0, 0], [667, 0, 0], [740, 24, 0], [844, 47, 34], [932, 59, 34]] as const) {
      if (height > width) { out.push({ width, height, safeArea: { top, bottom } }); }
    }
  }
  return out;
};

describe('MAZER-PROG-020 board scale and the tile floor', () => {
  test('the shipped board scale is the level-keyed base, not the old frozen 35', () => {
    expect(LEGACY_BOARD_BASE_SCALE).toBe(38);
    for (const level of [1, 2, 10, 50, 150, 288, 289, 300, 1000]) {
      expect(resolveLegacyBoardScaleForLevel(level)).toBe(38);
      expect(resolveLegacyProgressionGenerationScale(50, trackForLevel(level))).toBe(38);
    }
  });

  test('board scale ignores the retired board-zoom setting', () => {
    expect(resolveLegacyProgressionGenerationScale(25, trackForLevel(40))).toBe(38);
    expect(resolveLegacyProgressionGenerationScale(150, trackForLevel(40))).toBe(38);
  });

  test('a 320 px phone and a 430 px phone get the same scale for the same level (never the device)', () => {
    for (const level of [1, 10, 100, 300]) {
      const scales = BOARD_SCALE_REFERENCE_VIEWPORTS.flatMap((viewport) => (['play', 'menu-demo'] as const).map((surface) => (
        resolveLegacyProgressionScaleDetail(50, trackForLevel(level), {
          surface,
          viewport: { width: viewport.width, height: viewport.height, safeArea: viewport.safeArea, useFloatingTouchControls: true }
        }).scale
      )));
      expect(new Set(scales)).toEqual(new Set([38]));
    }
  });

  test('the five reference phones draw tiles of at least 10 CSS px at the base scale, untouched by the floor', () => {
    expect(LEGACY_BOARD_MIN_TILE_PX).toBe(10);
    for (const viewport of BOARD_SCALE_REFERENCE_VIEWPORTS) {
      for (const surface of ['menu', 'play'] as const) {
        const plan = planLegacyBoard(viewport, LEGACY_BOARD_BASE_SCALE, surface);
        expect(plan.tileSize, `${viewport.width}x${viewport.height} ${surface} ${plan.width}x${plan.height}`)
          .toBeGreaterThanOrEqual(LEGACY_BOARD_MIN_TILE_PX);
        expect(resolveLegacyBoardFloorScale(viewport, LEGACY_BOARD_BASE_SCALE, surface, 1)).toBe(LEGACY_BOARD_BASE_SCALE);
      }
    }
  });

  test('after the floor, every tile in a 320..430 phone sweep is at least 10 CSS px, menu and play', () => {
    let floored = 0;
    const sweep = phoneSweep();
    for (const viewport of sweep) {
      for (const surface of ['menu', 'play'] as const) {
        const scale = resolveLegacyBoardFloorScale(viewport, LEGACY_BOARD_BASE_SCALE, surface, 1);
        const plan = planLegacyBoard(viewport, scale, surface);
        expect(plan.tileSize, `${viewport.width}x${viewport.height} ${surface} s${scale} ${plan.width}x${plan.height}`)
          .toBeGreaterThanOrEqual(LEGACY_BOARD_MIN_TILE_PX);
        if (scale !== LEGACY_BOARD_BASE_SCALE) { floored += 1; }
      }
    }
    // Only the edge of the sweep (a 320-340 px box whose aspect rounds up to one more column) is floored.
    expect(floored).toBeLessThan(sweep.length * 2 * 0.2);
  });

  test('the board holds more tiles across and down than the old scale 35 on every reference phone', () => {
    for (const viewport of BOARD_SCALE_REFERENCE_VIEWPORTS) {
      const before = planLegacyBoard(viewport, 35, 'menu');
      const after = planLegacyBoard(viewport, LEGACY_BOARD_BASE_SCALE, 'menu');
      // Owner ask: slightly smaller tiles, more tiles across and down. The generator keeps every axis odd, so the
      // across count moves in steps of 2: a 360 or 430 px phone gains no column at 38 (it gains rows), the rest gain 2.
      expect(after.width).toBeGreaterThanOrEqual(before.width);
      expect(after.height).toBeGreaterThanOrEqual(before.height + 2);
      expect(after.width + after.height).toBeGreaterThanOrEqual(before.width + before.height + 4);
      // A width-bound phone can keep (or marginally gain) tile size; none may get a bigger tile than +0.5 px.
      expect(after.tileSize).toBeLessThanOrEqual(before.tileSize + 0.5);
    }
  });

  test('the generator and the planner share one grid rounding rule', () => {
    expect(resolveLegacyBoardDimensions(38, 23 / 51)).toEqual({ width: 26, height: 57 });
    expect(resolveLegacyBoardDimensions(38, 1)).toEqual({ width: 38, height: 38 });
    expect(resolveLegacyBoardDimensions(38, Number.NaN)).toEqual({ width: 38, height: 38 });
  });

  test('a box too narrow to hold the board at 10 px shrinks the scale until it does; wide enough boxes are untouched', () => {
    const narrow: LegacyBoardPlanViewport = { width: 270, height: 520, safeArea: { top: 0, bottom: 0 } };
    const floored = resolveLegacyBoardFloorScale(narrow, 38, 'menu', 1);
    expect(floored).toBeLessThan(38);
    expect(planLegacyBoard(narrow, floored, 'menu').tileSize).toBeGreaterThanOrEqual(LEGACY_BOARD_MIN_TILE_PX);
    const detail = resolveLegacyProgressionScaleDetail(50, trackForLevel(20), {
      surface: 'menu-demo',
      viewport: { width: 270, height: 520, useFloatingTouchControls: true }
    });
    expect(detail.scale).toBe(floored);
    const wide: LegacyBoardPlanViewport = { width: 320, height: 568, safeArea: { top: 0, bottom: 0 } };
    expect(resolveLegacyBoardFloorScale(wide, 38, 'menu', 1)).toBe(38);
    expect(resolveLegacyBoardFloorScale(narrow, 38, 'menu', 1, 36)).toBeGreaterThanOrEqual(36);
  });
});
