import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  MAZER_BOOT_SPLASH_FADE_IN_ANIMATION,
  MAZER_BOOT_SPLASH_FAILSAFE_ANIMATION,
  MAZER_BOOT_SPLASH_ID,
  MAZER_BOOT_SPLASH_STAGE_ID,
  fadeOutMazerBootSplash,
  type BootSplashAnimationLike,
  type BootSplashDocumentLike,
  type BootSplashElementLike
} from '../../src/boot/bootSplash';
import {
  LOADER_BOOT_FAILSAFE_MS,
  LOADER_FADE_IN_MS,
  LOADER_FADE_OUT_MS,
  LOADER_MIN_HOLD_MS,
  LOADER_PULSE_PERIOD_MS,
  LOADER_SHOW_DELAY_MS,
  LOADER_WAIT_CEILING_MS
} from '../../src/render/appLoader';
import { AppLoaderOverlay } from '../../src/render/appLoaderOverlay';

class El implements BootSplashElementLike {
  textContent: string | null = '';
  removed = false;
  style = { opacity: '1', pointerEvents: '', transition: '', animation: '' };
  constructor(public animations: BootSplashAnimationLike[] = []) {}
  remove(): void { this.removed = true; }
  getAnimations(): BootSplashAnimationLike[] { return this.animations; }
  getBoundingClientRect(): unknown { return {}; }
}

const setup = (stageAnimations: BootSplashAnimationLike[], rootAnimations: BootSplashAnimationLike[] = []) => {
  const root = new El(rootAnimations);
  const stage = new El(stageAnimations);
  const documentRef: BootSplashDocumentLike = {
    getElementById: (id) => (id === MAZER_BOOT_SPLASH_ID ? root : id === MAZER_BOOT_SPLASH_STAGE_ID ? stage : null)
  };
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const schedule = (fn: () => void, ms: number) => { timers.push({ fn, ms }); };
  return { root, stage, documentRef, timers, schedule };
};
const fadeIn = (currentTime: number): BootSplashAnimationLike => ({ animationName: MAZER_BOOT_SPLASH_FADE_IN_ANIMATION, currentTime });

describe('loader constants are pinned (shared with Fitness)', () => {
  test('timing and failsafe numbers', () => {
    expect([LOADER_SHOW_DELAY_MS, LOADER_MIN_HOLD_MS, LOADER_FADE_IN_MS, LOADER_FADE_OUT_MS, LOADER_PULSE_PERIOD_MS])
      .toEqual([150, 350, 200, 300, 1200]);
    expect(LOADER_BOOT_FAILSAFE_MS).toBe(8000);
    expect(LOADER_WAIT_CEILING_MS).toBe(15000);
  });
  test('index.html carries the CSS boot failsafe with the same delay and a fade', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain(`animation: ${MAZER_BOOT_SPLASH_FAILSAFE_ANIMATION} 300ms ease ${LOADER_BOOT_FAILSAFE_MS}ms forwards`);
    expect(html).toContain(`@keyframes ${MAZER_BOOT_SPLASH_FAILSAFE_ANIMATION}`);
  });
});

describe('bug 1: no icon ghost when the load beats the show delay', () => {
  test('a stage still inside its delay is held hidden before the cover fades', () => {
    const s = setup([fadeIn(80)]);
    fadeOutMazerBootSplash({ documentRef: s.documentRef, reducedMotion: false, schedule: s.schedule });
    expect(s.stage.style.animation).toBe('none');
    expect(s.stage.style.opacity).toBe('0');
    expect(s.root.style.opacity).toBe('0');
  });
  test('a stage that did show is left alone', () => {
    const s = setup([fadeIn(200)]);
    fadeOutMazerBootSplash({ documentRef: s.documentRef, reducedMotion: false, schedule: s.schedule });
    expect(s.stage.style.opacity).toBe('1');
    expect(s.stage.style.animation).toBe('');
  });
});

describe('bug 2: a failsafe-hidden cover never flashes back', () => {
  test('a late start removes the splash without a fade', () => {
    const s = setup([fadeIn(9000)], [{ animationName: MAZER_BOOT_SPLASH_FAILSAFE_ANIMATION, currentTime: 8300, playState: 'finished' }]);
    expect(fadeOutMazerBootSplash({ documentRef: s.documentRef, reducedMotion: false, schedule: s.schedule })).toBe(true);
    expect(s.root.removed).toBe(true);
    expect(s.root.style.opacity).toBe('1');
    expect(s.root.style.transition).toBe('');
    expect(s.timers).toHaveLength(0);
  });
  test('a failsafe still running does not skip the normal exit', () => {
    const s = setup([fadeIn(500)], [{ animationName: MAZER_BOOT_SPLASH_FAILSAFE_ANIMATION, currentTime: 500, playState: 'running' }]);
    fadeOutMazerBootSplash({ documentRef: s.documentRef, reducedMotion: false, schedule: s.schedule });
    expect(s.root.removed).toBe(false);
    expect(s.root.style.opacity).toBe('0');
  });
});

describe('bug 3 and the wait ceiling: the in-game cover settles hidden', () => {
  const makeScene = () => {
    const handlers: Record<string, () => void> = {};
    const obj = (): Record<string, unknown> => {
      const o: Record<string, unknown> = { visible: true, alpha: 1, width: 10 };
      for (const m of ['setOrigin', 'setDepth', 'setPosition', 'setSize', 'setScale']) o[m] = () => o;
      o.setVisible = (v: boolean) => { o.visible = v; return o; };
      o.setAlpha = (a: number) => { o.alpha = a; return o; };
      o.destroy = () => undefined;
      return o;
    };
    const made: Array<Record<string, unknown>> = [];
    const add = () => { const o = obj(); made.push(o); return o; };
    const scene = {
      events: { once: (name: string, fn: () => void) => { handlers[name] = fn; } },
      textures: { exists: () => true, addBase64: () => undefined, createCanvas: () => null },
      add: { rectangle: add, image: add }
    };
    return { scene, handlers, made };
  };
  test('shutdown hides the cover and resets the machine', () => {
    const { scene, handlers, made } = makeScene();
    const overlay = new AppLoaderOverlay(scene as never, 10);
    overlay.sync(true, 0, false, 390, 844, true);
    expect(made.some((o) => o.visible === true)).toBe(true);
    handlers.shutdown?.();
    expect(made.every((o) => o.visible === false)).toBe(true);
    expect(overlay.sync(false, 100, false, 390, 844)).toBe(0);
  });
  test('an error inside a frame settles the cover hidden and rethrows', () => {
    const { scene, made } = makeScene();
    const overlay = new AppLoaderOverlay(scene as never, 10);
    overlay.sync(true, 0, false, 390, 844, true);
    (made[0] as { setAlpha: unknown }).setAlpha = () => { throw new Error('frame failed'); };
    expect(() => overlay.sync(true, 16, false, 390, 844)).toThrow('frame failed');
    expect(made.every((o) => o.visible === false)).toBe(true);
  });
  test('a wait older than the ceiling stops holding the cover', () => {
    const { scene } = makeScene();
    const overlay = new AppLoaderOverlay(scene as never, 10);
    let alpha = 1;
    for (let t = 0; t <= LOADER_WAIT_CEILING_MS + 2000; t += 100) {
      alpha = overlay.sync(true, t, false, 390, 844, true);
    }
    expect(alpha).toBe(0);
  });
});
