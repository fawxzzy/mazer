import { describe, expect, test } from 'vitest';
import {
  MOTION_DURATION_MS,
  MOTION_REDUCED_MS,
  MOTION_STAGGER_BEAM_TOTAL_MS
} from '../../src/render/motionScale';
import {
  UI_ENTRANCE_RISE_DISTANCE_PX,
  assignUiEntranceRows,
  resolveUiEntrancePlan,
  resolveUiEntranceRowFrame,
  resolveUiEntranceStaggerStepMs,
  resolveUiEntranceTotalMs
} from '../../src/render/uiEntrance';
import { UiEntranceDriver } from '../../src/render/uiEntranceDriver';

describe('overlay rise and stagger entrance (MAZER-MOTION-011)', () => {
  test('full motion reads only the shared scale: base row length, the registered stagger budget', () => {
    const plan = resolveUiEntrancePlan(false);
    expect(plan.rowDurationMs).toBe(MOTION_DURATION_MS.base);
    expect(plan.staggerTotalMs).toBe(MOTION_STAGGER_BEAM_TOTAL_MS);
    expect(plan.risePx).toBe(UI_ENTRANCE_RISE_DISTANCE_PX);
  });

  test('pins the stagger step: the budget split over the gaps, last row starts at the budget', () => {
    const plan = resolveUiEntrancePlan(false);
    expect(resolveUiEntranceStaggerStepMs(plan, 7)).toBe(10);
    expect(resolveUiEntranceStaggerStepMs(plan, 1)).toBe(0);
    expect(resolveUiEntranceTotalMs(plan, 7)).toBe(MOTION_DURATION_MS.base + MOTION_STAGGER_BEAM_TOTAL_MS);
    expect(resolveUiEntranceRowFrame(plan, 6, 7, 59).alpha).toBe(0);
    expect(resolveUiEntranceRowFrame(plan, 6, 7, 61).alpha).toBeGreaterThan(0);
  });

  test('rows rise from below and rest exactly at alpha 1, offset 0', () => {
    const plan = resolveUiEntrancePlan(false);
    const start = resolveUiEntranceRowFrame(plan, 0, 4, 0);
    expect(start).toMatchObject({ alpha: 0, offsetY: UI_ENTRANCE_RISE_DISTANCE_PX, done: false });
    const mid = resolveUiEntranceRowFrame(plan, 0, 4, 100);
    expect(mid.offsetY).toBeLessThan(UI_ENTRANCE_RISE_DISTANCE_PX);
    expect(Number.isInteger(mid.offsetY)).toBe(true);
    expect(resolveUiEntranceRowFrame(plan, 0, 4, MOTION_DURATION_MS.base)).toEqual({ alpha: 1, offsetY: 0, done: true });
    expect(resolveUiEntranceRowFrame(plan, 3, 4, 10_000)).toEqual({ alpha: 1, offsetY: 0, done: true });
  });

  test('reduced motion is a plain crossfade of the shared length: no movement, no stagger', () => {
    const plan = resolveUiEntrancePlan(true);
    expect(plan.rowDurationMs).toBe(MOTION_REDUCED_MS.crossfade);
    expect(plan.staggerTotalMs).toBe(0);
    expect(plan.risePx).toBe(0);
    for (const elapsed of [0, 50, 100, 150, 199]) {
      for (const row of [0, 3, 9]) {
        expect(resolveUiEntranceRowFrame(plan, row, 10, elapsed).offsetY).toBe(0);
      }
    }
    expect(resolveUiEntranceRowFrame(plan, 0, 10, 0).alpha).toBe(0);
    expect(resolveUiEntranceRowFrame(plan, 9, 10, 100).alpha).toBe(resolveUiEntranceRowFrame(plan, 0, 10, 100).alpha);
    expect(resolveUiEntranceRowFrame(plan, 9, 10, MOTION_REDUCED_MS.crossfade).done).toBe(true);
    expect(resolveUiEntranceTotalMs(plan, 10)).toBe(MOTION_REDUCED_MS.crossfade);
  });

  test('items on one line share a row; rows are ordered top to bottom', () => {
    expect(assignUiEntranceRows([120, 40, 40.4, 80, NaN])).toEqual({ rows: [3, 1, 1, 2, 0], rowCount: 4 });
  });

  test('the driver restores the exact resting layout (resting frame unchanged)', () => {
    const objects = [
      { type: 'Graphics', alpha: 1, y: 0 },
      { type: 'Text', alpha: 1, y: 100 },
      { type: 'Text', alpha: 0.6, y: 140 },
      { type: 'Rectangle', alpha: 1, y: 140 }
    ];
    const rest = objects.map((o) => ({ ...o }));
    for (const reduced of [false, true]) {
      const driver = new UiEntranceDriver();
      driver.begin(1000, reduced);
      driver.update(1000, objects);
      expect(objects[1].alpha).toBe(0);
      expect(objects[1].y).toBe(reduced ? 100 : 108);
      driver.update(1100, objects);
      expect(driver.active).toBe(true);
      driver.update(1000 + 400, objects);
      expect(driver.active).toBe(false);
      expect(objects).toEqual(rest);
    }
  });

  test('cancel puts objects back at rest', () => {
    const objects = [{ type: 'Text', alpha: 1, y: 50 }];
    const driver = new UiEntranceDriver();
    driver.begin(0, false);
    driver.update(10, objects);
    expect(objects[0].y).not.toBe(50);
    driver.cancel();
    expect(objects[0]).toEqual({ type: 'Text', alpha: 1, y: 50 });
  });
});
