import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_UI_TAP_RECOVERY_FRAMES,
  resolveLegacyTapRecoveryTarget,
  shouldRecoverLegacyTapAfterUiRebuild
} from '../../src/legacy-runtime/legacyUiTapRecovery';

const normalizeSourceLineEndings = (source: string): string => source.replace(/\r\n?/g, '\n');

const base = {
  currentFrame: 101,
  mode: 'menu',
  overCount: 0,
  overlay: 'none',
  rebuildFrame: 100
} as const;

describe('tap recovery after a UI rebuild (Wave 5C)', () => {
  test('accepts a tap that Phaser could not route within the stale-list window, on every frame of it', () => {
    for (let offset = 0; offset <= LEGACY_UI_TAP_RECOVERY_FRAMES; offset += 1) {
      expect(shouldRecoverLegacyTapAfterUiRebuild({ ...base, currentFrame: 100 + offset })).toBe(true);
    }
  });

  test('never recovers once Phaser routed the tap, the list is current, or the surface is not the front door', () => {
    expect(shouldRecoverLegacyTapAfterUiRebuild({ ...base, overCount: 1 })).toBe(false);
    expect(shouldRecoverLegacyTapAfterUiRebuild({ ...base, currentFrame: 100 + LEGACY_UI_TAP_RECOVERY_FRAMES + 1 })).toBe(false);
    expect(shouldRecoverLegacyTapAfterUiRebuild({ ...base, rebuildFrame: null })).toBe(false);
    expect(shouldRecoverLegacyTapAfterUiRebuild({ ...base, rebuildFrame: 200 })).toBe(false);
    expect(shouldRecoverLegacyTapAfterUiRebuild({ ...base, mode: 'play' })).toBe(false);
    expect(shouldRecoverLegacyTapAfterUiRebuild({ ...base, overlay: 'options' })).toBe(false);
  });

  test('re-targets to the topmost fresh button: header zone beats the full-screen Start zone', () => {
    const fullScreenStart = { bottom: 958, depth: 0, index: 0, left: 0, right: 405, top: 0 };
    const settings = { bottom: 53, depth: 3, index: 1, left: 357, right: 401, top: 9 };
    const candidates = [fullScreenStart, settings];

    // The harness tap: bottom-centre, Start's own point.
    expect(resolveLegacyTapRecoveryTarget(203, 914, candidates)).toBe(0);
    // A tap on the header gear must not fall through to Start.
    expect(resolveLegacyTapRecoveryTarget(380, 30, candidates)).toBe(1);
    expect(resolveLegacyTapRecoveryTarget(-5, -5, [settings])).toBeNull();
    expect(resolveLegacyTapRecoveryTarget(1, 1, [])).toBeNull();
  });

  test('breaks a depth tie toward the most recently created button', () => {
    const a = { bottom: 100, depth: 1, index: 0, left: 0, right: 100, top: 0 };
    const b = { bottom: 100, depth: 1, index: 1, left: 0, right: 100, top: 0 };
    expect(resolveLegacyTapRecoveryTarget(50, 50, [a, b])).toBe(1);
    expect(resolveLegacyTapRecoveryTarget(50, 50, [b, a])).toBe(1);
  });

  test('MenuScene stamps every rebuild and routes unclaimed pointerdowns through the recovery first', () => {
    const source = normalizeSourceLineEndings(
      readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8')
    );
    expect(source).toContain('private rebuildUi(): void {\n    this.uiRebuiltAtFrame = this.game.getFrame();');
    const handler = source.slice(source.indexOf('private installInput(): void {'));
    const pointerDown = handler.slice(
      handler.indexOf("this.input.on('pointerdown'"),
      handler.indexOf("this.input.on('pointermove'")
    );
    expect(pointerDown.indexOf('this.recoverTapAfterUiRebuild(pointer, currentlyOver.length)'))
      .toBeGreaterThan(-1);
    expect(pointerDown.indexOf('this.recoverTapAfterUiRebuild('))
      .toBeLessThan(pointerDown.indexOf('this.handleOverlayScrimPointerDown(pointer, currentlyOver.length)'));
    expect(source).toContain("target.background.emit('pointerdown', pointer, pointer.x, pointer.y, pointer.event);");
  });
});
