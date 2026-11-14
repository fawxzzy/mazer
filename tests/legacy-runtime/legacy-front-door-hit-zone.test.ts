import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  isPointInLegacyFrontDoorHitZone,
  resolveLegacyFrontDoorHitZone
} from '../../src/legacy-runtime/legacyFrontDoorHitZone';

const viewports = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
  { width: 412, height: 915 },
  { width: 1280, height: 720 }
];

describe('front-door START / Login hit zone', () => {
  for (const viewport of viewports) {
    const visual = { left: (viewport.width / 2) - 90, top: (viewport.height * 0.55) - 30, width: 180, height: 60 };
    const zone = resolveLegacyFrontDoorHitZone(visual, viewport);

    test(`${viewport.width}x${viewport.height}: taps on the wordmark and its generous margin start`, () => {
      expect(isPointInLegacyFrontDoorHitZone(zone, zone.centerX, zone.centerY)).toBe(true);
      expect(isPointInLegacyFrontDoorHitZone(zone, visual.left + 1, visual.top + 1)).toBe(true);
      expect(isPointInLegacyFrontDoorHitZone(zone, visual.left + visual.width + 20, visual.top + visual.height + 12)).toBe(true);
    });

    test(`${viewport.width}x${viewport.height}: taps elsewhere on the screen do not start`, () => {
      expect(isPointInLegacyFrontDoorHitZone(zone, 4, 4)).toBe(false);
      expect(isPointInLegacyFrontDoorHitZone(zone, viewport.width - 4, 4)).toBe(false);
      expect(isPointInLegacyFrontDoorHitZone(zone, 4, viewport.height - 4)).toBe(false);
      expect(isPointInLegacyFrontDoorHitZone(zone, zone.centerX, zone.top - 20)).toBe(false);
      expect(isPointInLegacyFrontDoorHitZone(zone, zone.centerX, zone.bottom + 20)).toBe(false);
    });

    test(`${viewport.width}x${viewport.height}: zone is at least 44 px, covers the visual and stays on screen`, () => {
      expect(zone.width).toBeGreaterThanOrEqual(44);
      expect(zone.height).toBeGreaterThanOrEqual(44);
      expect(zone.left).toBeLessThanOrEqual(visual.left);
      expect(zone.right).toBeGreaterThanOrEqual(visual.left + visual.width);
      expect(zone.left).toBeGreaterThanOrEqual(0);
      expect(zone.right).toBeLessThanOrEqual(viewport.width);
      expect(zone.top).toBeGreaterThanOrEqual(0);
      expect(zone.bottom).toBeLessThanOrEqual(viewport.height);
    });
  }

  test('a wordmark wider than the screen still yields an on-screen zone', () => {
    const zone = resolveLegacyFrontDoorHitZone({ left: 0, top: 100, width: 380, height: 60 }, { width: 390, height: 844 });
    expect(zone.left).toBeGreaterThanOrEqual(0);
    expect(zone.right).toBeLessThanOrEqual(390);
  });

  test('the menu scene no longer builds a full-screen hit area', () => {
    const source = readFileSync('src/scenes/MenuScene.ts', 'utf8');
    expect(source).not.toContain('fullScreenHitArea');
    expect(source.match(/explicitHitZone: true/g)?.length).toBe(2);
  });
});
