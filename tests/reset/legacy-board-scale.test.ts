import { describe, expect, test } from 'vitest';
import { planLegacyBoard, resolveLegacyBoardFloorScale, type LegacyBoardPlanViewport } from '../../src/legacy-runtime/legacyBoardPlan';
import {
  LEGACY_BOARD_BASE_SCALE,
  LEGACY_BOARD_FLOOR_SCALE_STEP,
  LEGACY_BOARD_MAX_SCALE,
  LEGACY_BOARD_MAX_SCALE_STEP,
  LEGACY_BOARD_MIN_TILE_PX,
  resolveLegacyBoardDimensions,
  resolveLegacyBoardScaleForLevel
} from '../../src/legacy-runtime/legacyBoardScale';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyProgressionGenerationScale,
  resolveLegacyProgressionScaleDetail
} from '../../src/legacy-runtime/legacyProgression';
import { resolveLegacyGenerationBudgetContract } from '../../src/legacy-runtime/legacyGenerationLifecycle';
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
  test('level 1 starts at the base scale 38 and the curve is a function of the level only', () => {
    expect(LEGACY_BOARD_BASE_SCALE).toBe(38);
    expect(resolveLegacyBoardScaleForLevel(1)).toBe(38);
    for (const level of [Number.NaN, 0, -5, Number.NEGATIVE_INFINITY]) {
      expect(resolveLegacyBoardScaleForLevel(level)).toBe(38);
    }
    expect(resolveLegacyBoardScaleForLevel(201)).toBe(39);
    expect(resolveLegacyBoardScaleForLevel(300)).toBeCloseTo(38 + (2 * 299) / 499, 4);
  });

  test('over levels 1..1000 the scale is strictly increasing, steps by at most 0.0101, and stays below 40', () => {
    let previous = resolveLegacyBoardScaleForLevel(1);
    let largestStep = 0;
    for (let level = 2; level <= 1000; level += 1) {
      const scale = resolveLegacyBoardScaleForLevel(level);
      expect(scale, `level ${level}`).toBeGreaterThan(previous);
      largestStep = Math.max(largestStep, scale - previous);
      expect(scale).toBeLessThan(LEGACY_BOARD_MAX_SCALE);
      previous = scale;
    }
    expect(largestStep).toBeLessThanOrEqual(LEGACY_BOARD_MAX_SCALE_STEP);
    expect(previous).toBeCloseTo(39.6664, 3);
    // Never beyond 40, however far the level goes.
    for (const level of [5000, 100000, 1e9, Number.MAX_SAFE_INTEGER]) {
      expect(resolveLegacyBoardScaleForLevel(level)).toBeLessThanOrEqual(LEGACY_BOARD_MAX_SCALE);
    }
  });

  test('board scale ignores the retired board-zoom setting and is not rounded to a whole number', () => {
    const level40 = resolveLegacyBoardScaleForLevel(40);
    expect(Number.isInteger(level40)).toBe(false);
    expect(resolveLegacyProgressionGenerationScale(25, trackForLevel(40))).toBe(level40);
    expect(resolveLegacyProgressionGenerationScale(150, trackForLevel(40))).toBe(level40);
  });

  test('a phone 360 px wide or more gets exactly the level scale on every surface (never the device)', () => {
    const phones = BOARD_SCALE_REFERENCE_VIEWPORTS.filter((viewport) => viewport.width >= 360);
    for (const level of [1, 10, 50, 100, 150, 201, 300, 600, 1000]) {
      for (const viewport of phones) {
        for (const surface of ['play', 'menu-demo'] as const) {
          const scale = resolveLegacyProgressionScaleDetail(50, trackForLevel(level), {
            surface,
            viewport: { width: viewport.width, height: viewport.height, safeArea: viewport.safeArea, useFloatingTouchControls: true }
          }).scale;
          expect(scale, `${viewport.width}x${viewport.height} ${surface} level ${level}`).toBe(resolveLegacyBoardScaleForLevel(level));
        }
      }
    }
  });

  test('the generation request scale keeps its fraction (not rounded to 38/39/40)', () => {
    const budget = resolveLegacyGenerationBudgetContract('game', resolveLegacyBoardScaleForLevel(100));
    expect(budget.scale).toBe(resolveLegacyBoardScaleForLevel(100));
    expect(Number.isInteger(budget.scale)).toBe(false);
    expect(resolveLegacyGenerationBudgetContract('game', 35).scale).toBe(35);
    expect(resolveLegacyGenerationBudgetContract('game', 3).scale).toBe(25);
    expect(resolveLegacyGenerationBudgetContract('game', 900).scale).toBe(150);
  });

  test('over levels 1..1000 the grid on each reference phone changes only rarely, by at most 2 cells per axis, and never shrinks overall', () => {
    for (const viewport of BOARD_SCALE_REFERENCE_VIEWPORTS) {
      for (const surface of ['play', 'menu'] as const) {
        const first = planLegacyBoard(viewport, resolveLegacyBoardScaleForLevel(1), surface);
        let previous = first;
        let changes = 0;
        for (let level = 2; level <= 1000; level += 1) {
          const plan = planLegacyBoard(viewport, resolveLegacyBoardScaleForLevel(level), surface);
          const label = `${viewport.width}x${viewport.height} ${surface} level ${level}`;
          // The layout's aspect refinement can move the odd grid back by one step (2 cells on one axis) at a
          // handful of levels while the other axis grows; it is never a bigger jump than one odd step.
          expect(Math.abs(plan.width - previous.width), label).toBeLessThanOrEqual(2);
          expect(Math.abs(plan.height - previous.height), label).toBeLessThanOrEqual(2);
          if (plan.width !== previous.width || plan.height !== previous.height) { changes += 1; }
          previous = plan;
        }
        const label = `${viewport.width}x${viewport.height} ${surface}`;
        // About 1.7 scale units across 1000 levels: a handful of changes, not one per level.
        expect(changes, label).toBeLessThanOrEqual(10);
        expect(previous.width * previous.height, label).toBeGreaterThan(first.width * first.height);
      }
    }
  });

  test('on a 320 px phone the floor keeps every tile at 10 px and the scale never falls as the level rises', () => {
    const phone = BOARD_SCALE_REFERENCE_VIEWPORTS.find((viewport) => viewport.width === 320)!;
    for (const surface of ['play', 'menu-demo'] as const) {
      let previous = 0;
      for (let level = 1; level <= 1000; level += 1) {
        const scale = resolveLegacyProgressionScaleDetail(50, trackForLevel(level), {
          surface,
          viewport: { width: phone.width, height: phone.height, safeArea: phone.safeArea, useFloatingTouchControls: true }
        }).scale;
        const label = `${surface} level ${level}`;
        expect(scale, label).toBeLessThanOrEqual(resolveLegacyBoardScaleForLevel(level));
        expect(scale, label).toBeGreaterThanOrEqual(previous);
        expect(planLegacyBoard(phone, scale, surface === 'play' ? 'play' : 'menu').tileSize, label).toBeGreaterThanOrEqual(LEGACY_BOARD_MIN_TILE_PX);
        previous = scale;
      }
      expect(previous).toBeGreaterThanOrEqual(LEGACY_BOARD_BASE_SCALE);
    }
  }, 60_000);

  test('the tile floor holds at every level on a 300..430 px sweep, including 350x568 menu-demo levels 214-219 (9.87 px before)', () => {
    const widths = [350, 351];
    for (let width = 300; width <= 430; width += 5) { widths.push(width); }
    for (const width of widths) {
      for (const height of [568, 667]) {
        if (height <= width) { continue; }
        for (const surface of ['play', 'menu-demo'] as const) {
          const viewport = { width, height, safeArea: { top: 0, bottom: 0 }, useFloatingTouchControls: true };
          let previous = 0;
          for (let level = 1; level <= 260; level += 1) {
            const scale = resolveLegacyProgressionScaleDetail(50, trackForLevel(level), { surface, viewport }).scale;
            const label = `${width}x${height} ${surface} level ${level} s${scale}`;
            expect(planLegacyBoard(viewport, scale, surface === 'play' ? 'play' : 'menu').tileSize, label).toBeGreaterThanOrEqual(LEGACY_BOARD_MIN_TILE_PX);
            expect(scale, label).toBeGreaterThanOrEqual(previous);
            expect(scale, label).toBeLessThanOrEqual(resolveLegacyBoardScaleForLevel(level));
            previous = scale;
          }
        }
      }
    }
  }, 120_000);

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
    const floored = resolveLegacyBoardFloorScale(narrow, 38, 'menu', LEGACY_BOARD_FLOOR_SCALE_STEP);
    expect(floored).toBeLessThan(38);
    expect(planLegacyBoard(narrow, floored, 'menu').tileSize).toBeGreaterThanOrEqual(LEGACY_BOARD_MIN_TILE_PX);
    const detail = resolveLegacyProgressionScaleDetail(50, trackForLevel(20), {
      surface: 'menu-demo',
      viewport: { width: 270, height: 520, useFloatingTouchControls: true }
    });
    expect(detail.scale).toBe(floored);
    const wide: LegacyBoardPlanViewport = { width: 320, height: 568, safeArea: { top: 0, bottom: 0 } };
    expect(resolveLegacyBoardFloorScale(wide, 38, 'menu', LEGACY_BOARD_FLOOR_SCALE_STEP)).toBe(38);
    expect(resolveLegacyBoardFloorScale(narrow, 38, 'menu', LEGACY_BOARD_FLOOR_SCALE_STEP, 36)).toBeGreaterThanOrEqual(36);
  });
});
