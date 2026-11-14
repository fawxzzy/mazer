import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  MAZER_BOOT_SPLASH_ID,
  MAZER_BOOT_SPLASH_INSTANT_ANIMATION,
  MAZER_BOOT_SPLASH_STAGE_ID,
  fadeOutMazerBootSplash,
  type BootSplashDocumentLike,
  type BootSplashElementLike
} from '../../src/boot/bootSplash';
import { MAZER_LOADER_HANDOFF_ATTRIBUTE, isMazerLoaderHandoff } from '../../src/boot/loaderHandoff';
import { LOADER_MIN_HOLD_MS } from '../../src/render/appLoader';
import { MOTION_DURATION_MS } from '../../src/render/motionScale';

/**
 * MAZER-ACCT-042: host loader -> Mazer loader with no dark gap. The account host holds its loader until 500 ms after
 * its first paint, then navigates; Mazer's loader must be visible from ITS first paint when it was reached from the
 * host (referrer) or with OAuth callback parameters, and keep the usual 150 ms delay for ordinary cold opens.
 */
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8').replace(/\r\n?/g, '\n');

const CASES: ReadonlyArray<[string, { referrer?: string; search?: string }, boolean]> = [
  ['ordinary cold open', { referrer: '', search: '' }, false],
  ['cold open with an unrelated query', { referrer: '', search: '?mode=play' }, false],
  ['referrer is another site', { referrer: 'https://www.google.com/', search: '' }, false],
  ['referrer is the account host', { referrer: 'https://account.fawxzzy.com/', search: '' }, true],
  ['referrer is an account host page', { referrer: 'https://account.fawxzzy.com/login?x=1', search: '' }, true],
  ['referrer is a look-alike host', { referrer: 'https://account.fawxzzy.com.evil.example/', search: '' }, false],
  ['OAuth callback code', { referrer: '', search: '?code=abc&state=def' }, true],
  ['OAuth callback state only', { referrer: '', search: '?state=def' }, true],
  ['OAuth callback error', { referrer: '', search: '?error=access_denied' }, true],
  ['OAuth callback error description', { referrer: '', search: '?foo=1&error_description=nope' }, true],
  ['a parameter that merely contains the word', { referrer: '', search: '?encoded=1&stateless=2' }, false]
];

describe('the pure hand-off test', () => {
  test.each(CASES)('%s', (_label, facts, expected) => {
    expect(isMazerLoaderHandoff(facts)).toBe(expected);
  });
});

describe('the inline script in index.html is the same test (no drift)', () => {
  const script = /<script>\s*([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

  test('there is exactly one inline script and it runs before the splash markup', () => {
    expect(script).toContain("setAttribute('data-mazer-loader', 'instant')");
    expect(html.match(/<script>/g)?.length).toBe(1);
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('id="mazer-boot-splash"'));
    expect(MAZER_LOADER_HANDOFF_ATTRIBUTE).toBe('data-mazer-loader');
  });

  test.each(CASES)('%s', (_label, facts, expected) => {
    const attributes = new Map<string, string>();
    const fakeDocument = {
      referrer: facts.referrer ?? '',
      documentElement: { setAttribute: (name: string, value: string) => { attributes.set(name, value); } }
    };
    new Function('document', 'location', script)(fakeDocument, { search: facts.search ?? '' });
    expect(attributes.get('data-mazer-loader') === 'instant').toBe(expected);
  });

  test('a throwing environment leaves the ordinary cold-open behaviour', () => {
    const throwing = { get referrer(): string { throw new Error('x'); } };
    expect(() => new Function('document', 'location', script)(throwing, { search: '' })).not.toThrow();
  });
});

describe('the splash CSS: instant stage only under the hand-off attribute, 150 ms delay kept otherwise', () => {
  test('ordinary rule keeps the 150 ms delayed fade-in on the stage', () => {
    expect(html).toMatch(/\.mazer-boot-splash-stage \{[^}]*?opacity: 0;\s*animation: mazer-boot-splash-in 200ms ease 150ms both;/);
  });

  test('the hand-off rule shows the stage at once (opacity 1, no delay) and only keeps an animation clock', () => {
    const rule = /html\[data-mazer-loader="instant"\] #mazer-boot-splash \.mazer-boot-splash-stage \{([^}]*)\}/.exec(html)?.[1] ?? '';
    expect(rule).toContain('opacity: 1;');
    expect(rule).toContain(`animation: ${MAZER_BOOT_SPLASH_INSTANT_ANIMATION} 1s linear infinite;`);
    expect(rule).not.toMatch(/\d+ms/);
    expect(html).toContain(`@keyframes ${MAZER_BOOT_SPLASH_INSTANT_ANIMATION} { from { opacity: 1; } to { opacity: 1; } }`);
  });
});

describe('the splash exit after an instant hand-off waits out the minimum hold from the first paint', () => {
  class Splash implements BootSplashElementLike {
    textContent = '';
    style = { opacity: '', pointerEvents: '', transition: '' };
    remove(): void { /* noop */ }
    getBoundingClientRect(): void { /* noop */ }
  }
  const run = (animationName: string, currentTime: number) => {
    const splash = new Splash();
    const stage: BootSplashElementLike = {
      textContent: '',
      remove: () => undefined,
      getAnimations: () => [{ animationName, currentTime }]
    };
    const doc: BootSplashDocumentLike = {
      getElementById: (id) => (id === MAZER_BOOT_SPLASH_ID ? splash : id === MAZER_BOOT_SPLASH_STAGE_ID ? stage : null)
    };
    const scheduled: number[] = [];
    fadeOutMazerBootSplash({ documentRef: doc, reducedMotion: false, schedule: (_cb, delayMs) => { scheduled.push(delayMs); } });
    return { scheduled, splash };
  };

  test('instant loader up for 100 ms: the exit is held for the rest of the hold (no early blink-out)', () => {
    const { scheduled, splash } = run(MAZER_BOOT_SPLASH_INSTANT_ANIMATION, 100);
    expect(scheduled).toEqual([LOADER_MIN_HOLD_MS - 100]);
    expect(splash.style.opacity).toBe('');
  });

  test('instant loader up long enough: fades out at once', () => {
    const { scheduled, splash } = run(MAZER_BOOT_SPLASH_INSTANT_ANIMATION, LOADER_MIN_HOLD_MS + 10);
    expect(splash.style.opacity).toBe('0');
    expect(scheduled).toEqual([MOTION_DURATION_MS.slow]);
  });

  test('the ordinary animation at 100 ms (still inside the 150 ms delay) is unchanged: leaves at once', () => {
    const { scheduled } = run('mazer-boot-splash-in', 100);
    expect(scheduled).toEqual([MOTION_DURATION_MS.slow]);
  });
});

describe('the in-game cover starts instantly under the splash', () => {
  test('MenuScene passes "splash present" as the cover instant flag, so no 150 ms delay in the hand-off', () => {
    const menu = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    expect(menu).toMatch(/this\.appLoader\?\.sync\([\s\S]*?isMazerBootSplashPresent\(\)\s*\)/);
  });
});
