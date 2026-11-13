import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  MAZER_BOOT_SPLASH_FADE_IN_ANIMATION,
  MAZER_BOOT_SPLASH_ID,
  MAZER_BOOT_SPLASH_STAGE_ID,
  fadeOutMazerBootSplash,
  removeMazerBootSplash,
  type BootSplashDocumentLike,
  type BootSplashElementLike
} from '../../src/boot/bootSplash';
import { clearMazerBootStatusForTests, markMazerBootStatus } from '../../src/boot/bootStatus';
import {
  LOADER_FADE_IN_MS,
  LOADER_MIN_HOLD_MS,
  LOADER_PULSE_PERIOD_MS,
  LOADER_RING_REDUCED_ALPHA,
  LOADER_RING_REDUCED_SCALE,
  LOADER_SHOW_DELAY_MS
} from '../../src/render/appLoader';
import { MOTION_DURATION_MS, MOTION_LOOP_MS, MOTION_REDUCED_MS } from '../../src/render/motionScale';

let styleLog: string[] = [];

class StyledSplash implements BootSplashElementLike {
  textContent: string | null = '';
  removed = false;
  readonly style = {
    opacityValue: '',
    pointerEventsValue: '',
    transitionValue: '',
    get opacity(): string { return this.opacityValue; },
    set opacity(value: string) { this.opacityValue = value; styleLog.push(`opacity=${value}`); },
    get pointerEvents(): string { return this.pointerEventsValue; },
    set pointerEvents(value: string) { this.pointerEventsValue = value; styleLog.push(`pointerEvents=${value}`); },
    get transition(): string { return this.transitionValue; },
    set transition(value: string) { this.transitionValue = value; styleLog.push(`transition=${value}`); }
  };
  remove(): void { this.removed = true; }
  getBoundingClientRect(): unknown { styleLog.push('reflow'); return {}; }
}

class BareSplash implements BootSplashElementLike {
  textContent: string | null = '';
  removed = false;
  remove(): void { this.removed = true; }
}

const documentWith = (splash: BootSplashElementLike | null): BootSplashDocumentLike => ({
  getElementById: (id) => (id === MAZER_BOOT_SPLASH_ID ? splash : null)
});

afterEach(() => {
  styleLog = [];
  clearMazerBootStatusForTests();
  vi.unstubAllGlobals();
});

describe('boot splash fades out instead of hard-cutting (MAZER-MOTION-002)', () => {
  test('full motion: stops taking taps, flushes style, fades opacity over the slow step, then removes itself', () => {
    const splash = new StyledSplash();
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const result = fadeOutMazerBootSplash({
      documentRef: documentWith(splash),
      reducedMotion: false,
      schedule: (callback, delayMs) => { scheduled.push({ callback, delayMs }); }
    });
    expect(result).toBe(true);
    expect(splash.style.pointerEvents).toBe('none');
    expect(splash.style.transition).toBe(`opacity ${MOTION_DURATION_MS.slow}ms ease`);
    expect(splash.style.opacity).toBe('0');
    // The reflow must come BEFORE the opacity write or the browser snaps instead of animating.
    expect(styleLog.indexOf('reflow')).toBeGreaterThan(-1);
    expect(styleLog.indexOf('reflow')).toBeLessThan(styleLog.indexOf('opacity=0'));
    expect(splash.removed).toBe(false);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delayMs).toBe(MOTION_DURATION_MS.slow);
    scheduled[0].callback();
    expect(splash.removed).toBe(true);
  });

  test('reduced motion: the one 200 ms crossfade', () => {
    const splash = new StyledSplash();
    let delay = -1;
    fadeOutMazerBootSplash({
      documentRef: documentWith(splash),
      reducedMotion: true,
      schedule: (_callback, delayMs) => { delay = delayMs; }
    });
    expect(delay).toBe(MOTION_REDUCED_MS.crossfade);
    expect(splash.style.transition).toBe(`opacity ${MOTION_REDUCED_MS.crossfade}ms ease`);
  });

  test('a stand-in without style is removed at once, and a missing splash returns false', () => {
    const bare = new BareSplash();
    expect(fadeOutMazerBootSplash({ documentRef: documentWith(bare) })).toBe(true);
    expect(bare.removed).toBe(true);
    expect(fadeOutMazerBootSplash({ documentRef: documentWith(null) })).toBe(false);
  });

  test('the boot-error path still removes the splash immediately, never behind a fade', () => {
    const splash = new StyledSplash();
    vi.stubGlobal('window', {} as Window);
    vi.stubGlobal('document', documentWith(splash));
    markMazerBootStatus('error', 'boom');
    expect(splash.removed).toBe(true);
    expect(styleLog).not.toContain('opacity=0');
  });

  test('splash-removed fades a real splash; removeMazerBootSplash stays an immediate removal', () => {
    const splash = new StyledSplash();
    vi.stubGlobal('window', {} as Window);
    vi.stubGlobal('document', documentWith(splash));
    markMazerBootStatus('splash-removed');
    expect(splash.style.opacity).toBe('0');
    expect(splash.style.pointerEvents).toBe('none');
    expect(removeMazerBootSplash(documentWith(splash))).toBe(true);
    expect(splash.removed).toBe(true);
  });
});

describe('index.html splash loader is on the shared loader timeline (MAZER-VIS-039)', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

  test('the icon and the ring each pulse once per beat (MOTION_LOOP_MS.beat)', () => {
    for (const name of ['mazer-boot-splash-breathe', 'mazer-boot-splash-ring']) {
      const at = html.indexOf(`animation: ${name} `);
      expect(at, name).toBeGreaterThan(-1);
      const match = /^([0-9.]+)s /.exec(html.slice(at + `animation: ${name} `.length));
      expect(match, name).not.toBeNull();
      expect(Math.round(Number(match?.[1]) * 1000), name).toBe(LOADER_PULSE_PERIOD_MS);
    }
    expect(LOADER_PULSE_PERIOD_MS).toBe(MOTION_LOOP_MS.beat);
  });

  test('the stage fades in after the show delay over the fade-in step, and never starts visible', () => {
    const match = html.match(/\.mazer-boot-splash-stage \{[^}]*?opacity: 0;\s*animation: mazer-boot-splash-in (\d+)ms ease (\d+)ms both;/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(LOADER_FADE_IN_MS);
    expect(Number(match?.[1])).toBe(MOTION_DURATION_MS.base);
    expect(Number(match?.[2])).toBe(LOADER_SHOW_DELAY_MS);
  });

  test('the fade-in animation is on the stage, never on the root, so the root fade-out is not overridden', () => {
    expect(html).toMatch(/#mazer-boot-splash \{[^}]*background: #02080f/);
    expect(html.match(/#mazer-boot-splash \{[^}]*\}/)?.[0]).not.toMatch(/animation/);
    expect(html).toContain(`id="${MAZER_BOOT_SPLASH_STAGE_ID}"`);
    expect(html).toContain(`@keyframes ${MAZER_BOOT_SPLASH_FADE_IN_ANIMATION}`);
  });

  test('reduced motion stops the icon pulse and the ring movement (a still halo), as the owner rule says', () => {
    expect(html).toMatch(/prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.mazer-boot-splash-icon \{ animation: none; \}/);
    expect(html).toMatch(/\.mazer-boot-splash-ring \{ animation: none; transform: scale\(1\.08\); opacity: 0\.28; \}/);
    expect(LOADER_RING_REDUCED_SCALE).toBe(1.08);
    expect(LOADER_RING_REDUCED_ALPHA).toBe(0.28);
  });

  test('the loader icon is inline (no request, no pop-in) and its size is reserved', () => {
    expect(html).toMatch(/<img id="mazer-boot-splash-icon"[^>]*width="256" height="256"[^>]*src="data:image\/webp;base64,/);
    expect(html).not.toMatch(/<img[^>]*src="\//);
  });
});

describe('boot splash exit waits out the minimum hold once the icon has shown (MAZER-VIS-039)', () => {
  const animated = (currentTime: unknown): BootSplashElementLike => ({
    textContent: '',
    remove: () => undefined,
    getAnimations: () => [{ animationName: MAZER_BOOT_SPLASH_FADE_IN_ANIMATION, currentTime }]
  });
  const stageAndSplash = (currentTime: unknown) => {
    const splash = new StyledSplash();
    const stage = animated(currentTime);
    const doc: BootSplashDocumentLike = {
      getElementById: (id) => (id === MAZER_BOOT_SPLASH_ID ? splash : id === MAZER_BOOT_SPLASH_STAGE_ID ? stage : null)
    };
    return { splash, doc };
  };

  test('still inside the show delay: the loader never showed, so the exit starts at once', () => {
    const { splash, doc } = stageAndSplash(LOADER_SHOW_DELAY_MS - 1);
    const scheduled: number[] = [];
    fadeOutMazerBootSplash({ documentRef: doc, reducedMotion: false, schedule: (_cb, delayMs) => { scheduled.push(delayMs); } });
    expect(splash.style.opacity).toBe('0');
    expect(scheduled).toEqual([MOTION_DURATION_MS.slow]);
  });

  test('shown 200 ms ago: the exit waits for the rest of the hold, then fades', () => {
    const { splash, doc } = stageAndSplash(LOADER_SHOW_DELAY_MS + 200);
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    fadeOutMazerBootSplash({ documentRef: doc, reducedMotion: false, schedule: (callback, delayMs) => { scheduled.push({ callback, delayMs }); } });
    expect(splash.style.opacity).toBe('');
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delayMs).toBe(LOADER_MIN_HOLD_MS - 200);
    scheduled[0].callback();
    expect(splash.style.opacity).toBe('0');
    expect(scheduled[1].delayMs).toBe(MOTION_DURATION_MS.slow);
  });

  test('shown long enough: the exit starts at once; a second request never double-schedules', () => {
    const { splash, doc } = stageAndSplash(LOADER_SHOW_DELAY_MS + LOADER_MIN_HOLD_MS + 50);
    const scheduled: number[] = [];
    const schedule = (_cb: () => void, delayMs: number): void => { scheduled.push(delayMs); };
    fadeOutMazerBootSplash({ documentRef: doc, reducedMotion: true, schedule });
    fadeOutMazerBootSplash({ documentRef: doc, reducedMotion: true, schedule });
    expect(splash.style.opacity).toBe('0');
    expect(scheduled).toEqual([MOTION_REDUCED_MS.crossfade]);
  });

  test('an unreadable animation clock is treated as no hold to serve', () => {
    const { splash, doc } = stageAndSplash(null);
    fadeOutMazerBootSplash({ documentRef: doc, reducedMotion: false, schedule: () => undefined });
    expect(splash.style.opacity).toBe('0');
  });
});
