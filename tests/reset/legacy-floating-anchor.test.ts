import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  FLOATING_ANCHOR_LEASH_INCHES,
  advanceFloatingAnchor,
  createFloatingAnchorController,
  resolveCssPxPerInch,
  resolveFloatingAnchorConfig,
  type FloatingAnchorConfig
} from '../../src/legacy-runtime/legacyFloatingAnchor';
import {
  LEGACY_FLOATING_ANCHOR_STORAGE_KEY,
  readLegacyFloatingAnchorPreference,
  writeLegacyFloatingAnchorPreference
} from '../../src/legacy-runtime/legacyFloatingAnchorPreference';
import { LEGACY_SETTINGS_GROUP_ROWS } from '../../src/legacy-runtime/legacySettingsSheetPlan';
import {
  HARNESS_PATHS,
  measureReversalCostInches,
  simulateHarnessPath,
  summarizeHarnessSamples
} from '../../scripts/legacy/floating-anchor-harness';

const CONFIG: FloatingAnchorConfig = { easeMs: 140, leashPx: 160, maxStepMs: 100 };

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    values
  };
};

describe('floating anchor: inch from CSS px and DPR', () => {
  test('phones (coarse pointer, DPR >= 1.5) use 160 css px per inch; mouse uses the 96 px reference', () => {
    expect(resolveCssPxPerInch({ coarsePointer: true, devicePixelRatio: 3 })).toBe(160);
    expect(resolveCssPxPerInch({ coarsePointer: true, devicePixelRatio: 2.625 })).toBe(160);
    expect(resolveCssPxPerInch({ coarsePointer: true, devicePixelRatio: 1 })).toBe(130);
    expect(resolveCssPxPerInch({ coarsePointer: false, devicePixelRatio: 2 })).toBe(96);
    expect(resolveCssPxPerInch({ coarsePointer: true, devicePixelRatio: Number.NaN })).toBe(130);
  });

  test('the leash is the option B 90 px on a phone by default, scaled into logical px when the canvas is scaled', () => {
    expect(FLOATING_ANCHOR_LEASH_INCHES).toBeCloseTo(0.5625, 6);
    expect(resolveFloatingAnchorConfig({ coarsePointer: true, devicePixelRatio: 3 }).leashPx).toBeCloseTo(90, 6);
    expect(resolveFloatingAnchorConfig({ coarsePointer: true, devicePixelRatio: 3, logicalPerCssPx: 0.5 }).leashPx).toBeCloseTo(45, 6);
    expect(resolveFloatingAnchorConfig({ coarsePointer: true, devicePixelRatio: 3, leashInches: 0.75 }).leashPx).toBe(120);
    expect(resolveFloatingAnchorConfig({ coarsePointer: true, devicePixelRatio: 3, leashInches: -2 }).leashPx).toBeCloseTo(90, 6);
  });
});

describe('floating anchor: pure step', () => {
  test('a finger inside the leash never moves the anchor', () => {
    const anchor = { x: 10, y: 10 };
    expect(advanceFloatingAnchor(anchor, { x: 10 + 159, y: 10 }, 16, CONFIG)).toBe(anchor);
    expect(advanceFloatingAnchor(anchor, { x: 10, y: 10 }, 16, CONFIG)).toBe(anchor);
    expect(advanceFloatingAnchor(anchor, { x: 500, y: 10 }, 0, CONFIG)).toBe(anchor);
  });

  test('the anchor moves toward the finger, farther finger = faster, and never overshoots the leash distance', () => {
    const near = advanceFloatingAnchor({ x: 0, y: 0 }, { x: 200, y: 0 }, 16, CONFIG);
    const far = advanceFloatingAnchor({ x: 0, y: 0 }, { x: 600, y: 0 }, 16, CONFIG);
    expect(near.x).toBeGreaterThan(0);
    expect(far.x).toBeGreaterThan(near.x);
    expect(near.y).toBe(0);
    let anchor = { x: 0, y: 0 };
    for (let i = 0; i < 600; i += 1) {
      anchor = advanceFloatingAnchor(anchor, { x: 600, y: 0 }, 16, CONFIG);
      expect(600 - anchor.x).toBeGreaterThanOrEqual(CONFIG.leashPx - 1e-6);
    }
    expect(600 - anchor.x).toBeCloseTo(CONFIG.leashPx, 3);
  });

  test('easing: the anchor slows as it catches up', () => {
    const speeds: number[] = [];
    let anchor = { x: 0, y: 0 };
    for (let i = 0; i < 20; i += 1) {
      const next = advanceFloatingAnchor(anchor, { x: 600, y: 0 }, 16, CONFIG);
      speeds.push(next.x - anchor.x);
      anchor = next;
    }
    for (let i = 1; i < speeds.length; i += 1) {
      expect(speeds[i]!).toBeLessThan(speeds[i - 1]!);
    }
  });

  test('frame-rate independent: one 32 ms step equals two 16 ms steps; a stalled step is capped', () => {
    const finger = { x: 700, y: -300 };
    const one = advanceFloatingAnchor({ x: 0, y: 0 }, finger, 32, CONFIG);
    const half = advanceFloatingAnchor({ x: 0, y: 0 }, finger, 16, CONFIG);
    const two = advanceFloatingAnchor(half, finger, 16, CONFIG);
    expect(two.x).toBeCloseTo(one.x, 6);
    expect(two.y).toBeCloseTo(one.y, 6);
    const stalled = advanceFloatingAnchor({ x: 0, y: 0 }, finger, 60_000, CONFIG);
    const capped = advanceFloatingAnchor({ x: 0, y: 0 }, finger, CONFIG.maxStepMs, CONFIG);
    expect(stalled).toEqual(capped);
  });
});

describe('floating anchor: controller', () => {
  test('touch-down plants the anchor at the finger; up forgets it; lift-and-replace plants a fresh one', () => {
    const controller = createFloatingAnchorController(CONFIG);
    expect(controller.active).toBe(false);
    expect(controller.anchor).toBeNull();
    expect(controller.move({ x: 1, y: 1 }, 10)).toBeNull();
    expect(controller.down({ x: 100, y: 200 }, 0)).toEqual({ x: 100, y: 200 });
    controller.move({ x: 600, y: 200 }, 100);
    controller.move({ x: 600, y: 200 }, 200);
    expect(controller.anchor!.x).toBeGreaterThan(100);
    controller.up();
    expect(controller.active).toBe(false);
    expect(controller.finger).toBeNull();
    expect(controller.down({ x: 40, y: 50 }, 1000)).toEqual({ x: 40, y: 50 });
    expect(controller.anchor).toEqual({ x: 40, y: 50 });
  });

  test('a finger held still beyond the leash keeps pulling the anchor until it rests one leash behind', () => {
    const controller = createFloatingAnchorController(CONFIG);
    controller.down({ x: 0, y: 0 }, 0);
    controller.move({ x: 500, y: 0 }, 16);
    const early = controller.anchor!.x;
    let time = 16;
    for (let i = 0; i < 120; i += 1) {
      time += 16;
      controller.tick(time);
    }
    expect(controller.anchor!.x).toBeGreaterThan(early);
    expect(500 - controller.anchor!.x).toBeCloseTo(CONFIG.leashPx, 2);
  });

  test('time never runs backwards: an earlier timestamp does not move the anchor', () => {
    const controller = createFloatingAnchorController(CONFIG);
    controller.down({ x: 0, y: 0 }, 1000);
    controller.move({ x: 500, y: 0 }, 1100);
    const at = controller.anchor!.x;
    controller.tick(900);
    controller.tick(Number.NaN);
    expect(controller.anchor!.x).toBe(at);
  });

  test('quick reversal without lifting: the finger flips the offset sooner than a fixed anchor would', () => {
    const path = HARNESS_PATHS.find((p) => p.name === 'quick-reversal')!;
    const samples = simulateHarnessPath(path, CONFIG, 160);
    const cost = measureReversalCostInches(samples, 160, 0.1);
    expect(cost).not.toBeNull();
    // A fixed anchor at the touch-down needs the finger back across 2 in (plus the deadzone).
    expect(cost!).toBeLessThan(2);
    expect(cost!).toBeLessThanOrEqual((CONFIG.leashPx / 160) + 0.6);
  });

  test('option B default (90 px leash on a phone): a reversal costs well under the 1-inch leash it replaces', () => {
    const config = resolveFloatingAnchorConfig({ coarsePointer: true, devicePixelRatio: 3 });
    const path = HARNESS_PATHS.find((p) => p.name === 'quick-reversal')!;
    const fixedLeash = measureReversalCostInches(simulateHarnessPath(path, CONFIG, 160), 160, 0.1)!;
    const optionB = measureReversalCostInches(simulateHarnessPath(path, config, 160), 160, 0.1)!;
    expect(optionB).toBeLessThan(fixedLeash);
    expect(optionB).toBeLessThanOrEqual(FLOATING_ANCHOR_LEASH_INCHES + 0.6);
  });
});

describe('floating anchor: tuning harness', () => {
  test('every scripted path simulates; the in-leash wiggle never moves the anchor; far paths end one leash behind', () => {
    for (const path of HARNESS_PATHS) {
      const samples = simulateHarnessPath(path, CONFIG, 160);
      expect(samples.length).toBeGreaterThan(10);
    }
    const wiggle = summarizeHarnessSamples('w', simulateHarnessPath(HARNESS_PATHS.find((p) => p.name === 'wiggle-inside-leash')!, CONFIG, 160), 160);
    expect(wiggle.maxAnchorSpeedInchesPerSec).toBe(0);
    const slow = summarizeHarnessSamples('s', simulateHarnessPath(HARNESS_PATHS.find((p) => p.name === 'slow-drag-3in')!, CONFIG, 160), 160);
    expect(slow.finalLagInches).toBeGreaterThanOrEqual(0.99);
    expect(slow.finalLagInches).toBeLessThan(1.1);
  });
});

describe('floating anchor: Settings toggle, default ON (CTRL-003 option B)', () => {
  test('the preference reads on when absent, blocked or unrelated, off only when the player stored off, and round-trips', () => {
    const storage = memoryStorage();
    expect(readLegacyFloatingAnchorPreference(undefined)).toBe(true);
    expect(readLegacyFloatingAnchorPreference(storage)).toBe(true);
    storage.values.set(LEGACY_FLOATING_ANCHOR_STORAGE_KEY, 'garbage');
    expect(readLegacyFloatingAnchorPreference(storage)).toBe(true);
    storage.values.set(LEGACY_FLOATING_ANCHOR_STORAGE_KEY, 'off');
    expect(readLegacyFloatingAnchorPreference(storage)).toBe(false);
    expect(writeLegacyFloatingAnchorPreference(storage, true)).toBe(true);
    expect(readLegacyFloatingAnchorPreference(storage)).toBe(true);
    expect(writeLegacyFloatingAnchorPreference(storage, false)).toBe(false);
    expect(readLegacyFloatingAnchorPreference(storage)).toBe(false);
    expect(readLegacyFloatingAnchorPreference({ getItem: () => { throw new Error('blocked'); } })).toBe(true);
    expect(writeLegacyFloatingAnchorPreference({ setItem: () => { throw new Error('blocked'); } }, true)).toBe(true);
  });

  test('the Settings sheet has a Floating anchor toggle row, device-local (not a synced game-toggle key)', () => {
    const row = LEGACY_SETTINGS_GROUP_ROWS.find((r) => r.id === 'floating-anchor')!;
    expect(row.kind).toBe('toggle');
    expect(row.label).toBe('Floating anchor');
    expect(row.settingKey).toBe('floatingAnchorControls');
    expect(row.description.length).toBeGreaterThan(0);
    const prefs = readFileSync(resolve(__dirname, '../../src/legacy-runtime/legacyGameTogglePreferences.ts'), 'utf8');
    expect(prefs).not.toMatch(/floatingAnchor/i);
  });


  test('the scene wires the controller only when the toggle is on and keeps the stick maths unchanged', () => {
    const scene = readFileSync(resolve(__dirname, '../../src/scenes/MenuScene.ts'), 'utf8');
    expect(scene).toMatch(/private floatingAnchorEnabled = true;/);
    expect(scene).toMatch(/if \(this\.floatingAnchorEnabled\) \{\s*this\.configureLegacyFloatingAnchor\(\);\s*this\.floatingAnchor\.down\(/);
    expect(scene).toMatch(/if \(this\.floatingAnchor\.active\) \{[\s\S]{0,200}this\.floatingAnchor\.move\(/);
    expect(scene).toMatch(/if \(this\.floatingAnchor\?\.active === true\) \{\s*this\.advanceLegacyFloatingAnchor\(time\);/);
  });
});
