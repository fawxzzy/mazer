import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  MAZER_BOOT_SPLASH_ID,
  fadeOutMazerBootSplash,
  removeMazerBootSplash,
  type BootSplashDocumentLike,
  type BootSplashElementLike
} from '../../src/boot/bootSplash';
import { clearMazerBootStatusForTests, markMazerBootStatus } from '../../src/boot/bootStatus';
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

describe('index.html splash pulse is on the shared loader beat', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

  test('the dot pulses once per beat (MOTION_LOOP_MS.beat)', () => {
    const match = html.match(/animation:\s*mazer-boot-splash-pulse\s+([\d.]+)s\s/);
    expect(match).not.toBeNull();
    expect(Math.round(Number(match?.[1]) * 1000)).toBe(MOTION_LOOP_MS.beat);
  });

  test('reduced motion still stops the pulse (movement), as before', () => {
    expect(html).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*#mazer-boot-splash \.mazer-boot-splash-pulse \{ animation: none/);
  });
});
