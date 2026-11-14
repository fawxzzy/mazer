import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { GOAL_BEACON } from '../../src/render/goalBeacon';
import {
  MOTION_LOOP_MS,
  MOTION_PHASER_EASE_SINE_IN_OUT,
  MOTION_UI_MS
} from '../../src/render/motionScale';

/**
 * MAZER-MOTION-006: the scene's own motion constants that equal a motion scale step read from the scale, and
 * nothing about timing or pixels changed. Every migrated constant is pinned to the number it had BEFORE the
 * migration (a literal in this test, not a read from the scale), so a retune of the scale cannot silently move
 * the scene. The constants that differ from every scale step stay literals; they are pinned here too and
 * listed in the PR for MAZER-MOTION-007 (an owner decision), not changed.
 */
const menuSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

const readConst = (name: string): string => {
  const match = menuSource.match(new RegExp(`^const ${name} = (.+);$`, 'm'));
  if (!match) throw new Error(`MenuScene.ts has no top-level const ${name}`);
  return match[1];
};

describe('scene motion constants on the motion scale (before == after)', () => {
  test('the migrated scene constants read from the scale and equal their pre-migration numbers', () => {
    // before the migration: const LEGACY_MENU_BLINK_PULSE_MS = 2400;
    expect(readConst('LEGACY_MENU_BLINK_PULSE_MS')).toBe('MOTION_LOOP_MS.blink');
    // before the migration: const LEGACY_WORDMARK_SPARKLE_CYCLE_MS = 2400;
    expect(readConst('LEGACY_WORDMARK_SPARKLE_CYCLE_MS')).toBe('MOTION_LOOP_MS.blink');
    expect(MOTION_LOOP_MS.blink).toBe(2400);
    // The text-caret tween that read these two went with the credential form (MAZER-ACCT-043); the scale values stay pinned.
    expect(MOTION_UI_MS.emphasis).toBe(420);
    expect(MOTION_PHASER_EASE_SINE_IN_OUT).toBe('Sine.easeInOut');
    // before the migration: GOAL_BEACON.pulsePeriodMs was 2400.
    expect(GOAL_BEACON.pulsePeriodMs).toBe(2400);
  });

  test('no migrated literal is left behind in the scene', () => {
    expect(menuSource).not.toMatch(/^const LEGACY_MENU_BLINK_PULSE_MS = \d/m);
    expect(menuSource).not.toMatch(/^const LEGACY_WORDMARK_SPARKLE_CYCLE_MS = \d/m);
    expect(menuSource).not.toContain("ease: 'Sine.easeInOut'");
    expect(menuSource).not.toMatch(/duration: 420\b/);
  });

  test('scene motion constants that differ from every scale step are unchanged (owner decision MAZER-MOTION-007)', () => {
    const expected: Record<string, string> = {
      LEGACY_MENU_PATH_TITLE_SWEEP_MS: '2600',
      LEGACY_MENU_PATH_TITLE_GEM_PULSE_MS: '3400',
      LEGACY_MENU_TITLE_TRAIL_SWEEP_FILL_MS: '2200',
      LEGACY_MENU_TITLE_TRAIL_SWEEP_HOLD_MS: '340',
      LEGACY_MENU_TITLE_TRAIL_SWEEP_REVERT_MS: '1500',
      LEGACY_PLAY_TOUCH_STICK_ANCHOR_ORBIT_MS: '3200',
      LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS: '1150',
      LEGACY_GOAL_STAR_RING_SPIN_PERIOD_MS: '5200',
      LEGACY_MENU_STATIC_BUILD_PREROLL_BURST_MS: '500',
      LEGACY_MENU_DEMO_GOAL_RESET_HOLD_MS: '340',
      INITIAL_MENU_DEMO_HOLD_MS: '1800'
    };
    for (const [name, value] of Object.entries(expected)) {
      expect({ name, value: readConst(name) }).toEqual({ name, value });
    }
  });
});
