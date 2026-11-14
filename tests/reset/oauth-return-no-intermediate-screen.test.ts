import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  MAZER_BOOT_SPLASH_NEUTRAL_MESSAGE,
  MAZER_BOOT_SPLASH_SIGN_IN_MESSAGE,
  resolveMazerBootSplashMessage
} from '../../src/boot/bootSplash';
import { LEGACY_GUIDE_ROWS } from '../../src/legacy-runtime/legacyGuideContent';
import { LEGACY_ACCOUNT_STATUS_COPY } from '../../src/legacy-runtime/legacyAccountStatusState';

/**
 * MAZER-ACCT-042 (owner, 2026-11-13): "im still seeing a one moment, still pending screen when signing in just before
 * i see the loading screen."
 *
 * Finding: that screen is NOT in Mazer. "One moment." (eyebrow "Pending") is the account host's OAuth authorize page
 * (FawxzzyWeb `src/components/account/mazer-oauth-authorization.tsx`, `SystemState variant="pending"`), shown between
 * the host sign-in and the redirect back to Mazer. This file pins the Mazer half of the owner's sequence
 * (host sign-in -> back in Mazer -> the one loader -> menu, no intermediate text screen):
 *  - no player-visible Mazer string says "One moment" or "pending" (the only "still pending" text in the repo is the
 *    technical password-update message, which is not part of sign-in);
 *  - every boot stage that can run during the return (callback exchange included) shows only the loader label
 *    `Loading…` or `Signing you in…`, never a status sentence;
 *  - the scene never draws the callback-pending Welcome variant (`hasCallbackInProgress` stays false), so there is no
 *    Mazer screen between the HTML splash and the in-game loader cover.
 */

const root = process.cwd();
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8').replace(/\r\n?/g, '\n');

// Code comments are not player-visible text.
const isCommentLine = (line: string): boolean => /^\s*(\/\/|\*|\/\*)/.test(line);

const listFiles = (dir: string, extension: string): string[] => readdirSync(resolve(root, dir)).flatMap((name) => {
  const relative = `${dir}/${name}`;
  return statSync(resolve(root, relative)).isDirectory()
    ? listFiles(relative, extension)
    : relative.endsWith(extension) ? [relative] : [];
});

describe('the host-return sequence has no intermediate Mazer text screen (MAZER-ACCT-042)', () => {
  test('no Mazer source or the HTML shell says "One moment"', () => {
    const offenders = [...listFiles('src', '.ts'), 'index.html']
      .filter((file) => read(file).split('\n').some((line) => !isCommentLine(line) && /one moment/i.test(line)));
    expect(offenders).toEqual([]);
  });

  test('"still pending" appears nowhere in player-visible Mazer text (the old password-update message left with MAZER-ACCT-043)', () => {
    const hits = [...listFiles('src', '.ts'), 'index.html']
      .flatMap((file) => read(file).split('\n').map((line) => ({ file, line })))
      .filter(({ line }) => !isCommentLine(line) && /still pending/i.test(line));
    expect(hits).toEqual([]);
  });

  test('the player-message inventory (test pins and doc) lists no "One moment" or "still pending" row', () => {
    for (const file of ['tests/reset/legacy-player-message-inventory.test.ts', 'docs/ops/MAZER-PLAYER-MESSAGE-INVENTORY-2026-11-05.md']) {
      const text = read(file);
      expect(/one moment/i.test(text), file).toBe(false);
      const pendingRows = text.split('\n').filter((line) => /still pending/i.test(line) && !/removed|left with|MAZER-ACCT-043/i.test(line));
      expect(pendingRows, file).toEqual([]);
    }
  });

  test('the in-app Guide has no such text', () => {
    const guide = JSON.stringify(LEGACY_GUIDE_ROWS);
    expect(/one moment|pending/i.test(guide)).toBe(false);
  });

  test('every boot stage shows only the loader label: Loading… or (during a real callback exchange) Signing you in…', () => {
    const stages = /export type MazerBootStage =([\s\S]*?);/.exec(read('src/boot/bootStatus.ts'))?.[1]
      ?.match(/'([a-z-]+)'/g)?.map((quoted) => quoted.slice(1, -1)) ?? [];
    expect(stages).toContain('oauth-exchange');
    expect(stages.length).toBeGreaterThanOrEqual(10);
    for (const stage of stages) {
      expect([MAZER_BOOT_SPLASH_NEUTRAL_MESSAGE, MAZER_BOOT_SPLASH_SIGN_IN_MESSAGE], stage)
        .toContain(resolveMazerBootSplashMessage(stage));
    }
    expect(resolveMazerBootSplashMessage('oauth-exchange')).toBe('Signing you in…');
    expect(MAZER_BOOT_SPLASH_NEUTRAL_MESSAGE).toBe('Loading…');
    // The HTML splash starts on the neutral label, so the first frame of a callback load already reads as the loader.
    expect(read('index.html')).toContain('Loading&hellip;</p>');
  });

  test('the scene has no callback-pending Welcome variant any more (MAZER-ACCT-043): the loader cover is the only pending state', () => {
    const menu = read('src/scenes/MenuScene.ts');
    expect(menu).not.toContain('hasCallbackInProgress');
    expect(menu).not.toContain('legacyAuthScreenView');
    // The cover starts opaque under the HTML splash (no gap) and is the shared app loader.
    expect(menu).toContain('isMazerBootSplashPresent()');
    expect(menu).toContain('this.appLoader = new AppLoaderOverlay(');
  });

  test('the account status copy holds only the two loader labels as progress text (no pending sentence)', () => {
    expect(LEGACY_ACCOUNT_STATUS_COPY.signingIn).toBe('Signing you in…');
    expect(LEGACY_ACCOUNT_STATUS_COPY.loading).toBe('Loading…');
    expect(/one moment|pending/i.test(JSON.stringify(LEGACY_ACCOUNT_STATUS_COPY))).toBe(false);
  });

  test('main.ts consumes the callback behind the splash, before Phaser exists, so the return never paints a Mazer screen first', () => {
    const main = read('src/boot/main.ts');
    expect(main.indexOf('await consumeMazerOAuthCallback(')).toBeGreaterThan(-1);
    expect(main.indexOf('await consumeMazerOAuthCallback(')).toBeLessThan(main.indexOf('game = new Phaser.Game('));
    expect(main.indexOf("markMazerBootStatus('oauth-exchange')")).toBeLessThan(main.indexOf('await consumeMazerOAuthCallback('));
    // The splash is only removed by the menu scene (or the install gate / an error), never by the exchange itself.
    expect(join('src', 'boot', 'main.ts')).toBeTruthy();
    expect(/markMazerBootStatus\('splash-removed'\)/.test(main.slice(main.indexOf('await consumeMazerOAuthCallback('), main.indexOf('game = new Phaser.Game(')))).toBe(false);
  });
});
