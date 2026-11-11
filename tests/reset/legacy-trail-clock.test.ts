import { describe, expect, test, vi } from 'vitest';
import { MenuScene } from '../../src/scenes/MenuScene';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)), Linear: (a: number, b: number, t: number) => a + ((b - a) * t) },
    Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
    Scene: class {}
  }
}));

type ClockScene = {
  mode: 'play' | 'menu';
  overlay: string;
  locked: boolean;
  reduced: boolean;
  trailAnimationElapsedMs: number;
  trailAnimationLastRealMs: number | null;
  isLegacyPlayLifecycleInputLocked: () => boolean;
  prefersLegacyReducedMotion: () => boolean;
};

const advance = (scene: ClockScene, time: number): number => (
  (MenuScene.prototype as unknown as { advanceLegacyTrailAnimationClock: (t: number) => number })
    .advanceLegacyTrailAnimationClock.call(scene, time)
);

const makeScene = (patch: Partial<ClockScene> = {}): ClockScene => {
  const scene: ClockScene = {
    mode: 'play',
    overlay: 'none',
    locked: false,
    reduced: false,
    trailAnimationElapsedMs: 0,
    trailAnimationLastRealMs: null,
    isLegacyPlayLifecycleInputLocked() { return scene.locked; },
    prefersLegacyReducedMotion() { return scene.reduced; },
    ...patch
  };
  return scene;
};

describe('trail colour clock: the trail colour shifts with time on the menu demo as well as in play', () => {
  test.each(['play', 'menu'] as const)('%s: the clock advances while the board is settled and visible', (mode) => {
    const scene = makeScene({ mode });
    advance(scene, 1000);
    expect(advance(scene, 1600)).toBe(600);
    expect(advance(scene, 2000)).toBe(1000);
  });

  test.each(['play', 'menu'] as const)('%s: it holds while an overlay is open, the board is locked, or reduced motion is on', (mode) => {
    const overlay = makeScene({ mode, overlay: 'options', trailAnimationElapsedMs: 500 });
    advance(overlay, 1000);
    expect(advance(overlay, 2000)).toBe(500);
    const locked = makeScene({ mode, locked: true, trailAnimationElapsedMs: 500 });
    advance(locked, 1000);
    expect(advance(locked, 2000)).toBe(500);
    const reduced = makeScene({ mode, reduced: true, trailAnimationElapsedMs: 500 });
    advance(reduced, 1000);
    expect(advance(reduced, 2000)).toBe(500);
  });

  test('a pause does not bank the time spent paused', () => {
    const scene = makeScene({ mode: 'menu' });
    advance(scene, 1000);
    advance(scene, 1500);
    scene.overlay = 'options';
    advance(scene, 5000);
    scene.overlay = 'none';
    advance(scene, 9000);
    expect(advance(scene, 9400)).toBe(900);
  });
});
