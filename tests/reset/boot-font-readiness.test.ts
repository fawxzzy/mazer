import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  MAZER_FONT_READY_TIMEOUT_MS,
  buildMazerUiFontLoadDescriptors,
  waitForMazerUiFonts
} from '../../src/boot/fontReadiness';

const FONT_FILE = 'public/fonts/space-grotesk/space-grotesk-latin-wght-normal.woff2';
const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('bounded UI font readiness', () => {
  test('caps the wait at 1.5 s and loads every weight the game draws', () => {
    expect(MAZER_FONT_READY_TIMEOUT_MS).toBeLessThanOrEqual(1_500);
    expect(buildMazerUiFontLoadDescriptors()).toEqual([
      '400 16px "Space Grotesk"',
      '500 16px "Space Grotesk"',
      '600 16px "Space Grotesk"',
      '700 16px "Space Grotesk"'
    ]);
  });

  test('resolves loaded once every descriptor loads and clears the timer', async () => {
    const requested: string[] = [];
    const cleared: unknown[] = [];
    const result = await waitForMazerUiFonts({
      fonts: { load: async (descriptor) => { requested.push(descriptor); return []; } },
      setTimeoutFn: () => 'timer',
      clearTimeoutFn: (handle) => { cleared.push(handle); }
    });
    expect(result).toBe('loaded');
    expect(requested).toEqual(buildMazerUiFontLoadDescriptors());
    expect(cleared).toEqual(['timer']);
  });

  test('gives up at the timeout instead of hanging on a font that never loads', async () => {
    let fire: () => void = () => undefined;
    let requestedMs = -1;
    const pending = waitForMazerUiFonts({
      fonts: { load: () => new Promise(() => undefined) },
      setTimeoutFn: (callback, ms) => { fire = callback; requestedMs = ms; return 't'; },
      clearTimeoutFn: () => undefined
    });
    fire();
    await expect(pending).resolves.toBe('timeout');
    expect(requestedMs).toBe(MAZER_FONT_READY_TIMEOUT_MS);
  });

  test('never throws: a failed load or a missing FontFaceSet resolves to a fallback result', async () => {
    await expect(waitForMazerUiFonts({
      fonts: { load: async () => { throw new Error('network'); } },
      setTimeoutFn: () => 't',
      clearTimeoutFn: () => undefined
    })).resolves.toBe('error');
    await expect(waitForMazerUiFonts({ fonts: null })).resolves.toBe('unsupported');
  });
});

describe('Space Grotesk delivery wiring', () => {
  test('ships the woff2 with its license and provenance within the byte budget', () => {
    expect(existsSync(resolve(process.cwd(), FONT_FILE))).toBe(true);
    expect(statSync(resolve(process.cwd(), FONT_FILE)).size).toBeLessThan(120 * 1024);
    expect(read('public/fonts/space-grotesk/LICENSE.txt')).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(read('public/fonts/space-grotesk/README.md')).toContain('sha256');
  });

  test('declares the face, preloads it, precaches it and awaits it before Phaser creates text', () => {
    const css = read('src/styles/base.css');
    expect(css).toContain('@font-face');
    expect(css).toContain('font-family: "Space Grotesk"');
    expect(css).toContain(`/${FONT_FILE.replace('public/', '')}`);
    expect(read('index.html')).toMatch(/<link rel="preload" href="\/fonts\/space-grotesk\/[^"]+\.woff2" as="font" type="font\/woff2" crossorigin \/>/);
    expect(read('vite.config.ts')).toContain(FONT_FILE.replace('public/', ''));
    const main = read('src/boot/main.ts');
    expect(main.indexOf('await uiFontReady;')).toBeGreaterThan(-1);
    expect(main.indexOf('await uiFontReady;')).toBeLessThan(main.indexOf('new Phaser.Game('));
  });

  test('draws the header identity label with the token UI face, not the auth fallback stack', () => {
    const menu = read('src/scenes/MenuScene.ts');
    const start = menu.indexOf('private createLegacyHeaderIdentityLabel()');
    const block = menu.slice(start, start + 900);
    expect(block).toContain('fontFamily: LEGACY_UI_FONT_FAMILY');
    expect(block).not.toContain('LEGACY_AUTH_UI_FONT_FAMILY');
  });
});
