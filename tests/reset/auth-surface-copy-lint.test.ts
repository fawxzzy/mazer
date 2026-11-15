import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  AUTH_SURFACE_LABELS,
  AUTH_SURFACE_MESSAGES,
  AUTH_SURFACE_RETIRED_PHRASES,
  listAuthSurfaceStrings
} from '../../src/brand/authSurfaceCopy';
import { LEGACY_ACCOUNT_STATUS_COPY } from '../../src/legacy-runtime/legacyAccountStatusState';
import { MAZER_INSTALL_GATE_COPY, MAZER_INSTALL_GATE_COPY_FEEDBACK, resolveMazerInstallGateCopy } from '../../src/boot/installGate';

/**
 * Auth Surface v2 (owner-approved 2026-11-15) copy lint. Every sentence and label Mazer shows on its sign-in status
 * screen, loaders, boot splash, boot-error screen and install gate comes from src/brand/authSurfaceCopy.ts, whose
 * message rows are the shared copy matrix verbatim. This fails when a surface grows its own sentence, and when a
 * retired phrase ("Working…", "Log In", "Choose Sign in", a "Code:" line, ...) comes back.
 */

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

/** The source files that draw those surfaces (the copy module itself is the allowed source). */
const SURFACE_FILES = [
  'src/legacy-runtime/legacyAccountStatusState.ts',
  'src/boot/installGate.ts',
  'src/boot/bootErrorScreen.ts',
  'src/boot/surfaceMarkup.ts',
  'src/boot/bootSplash.ts'
] as const;

const stripComments = (source: string): string => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** Quoted literals that read as player copy: start with a capital letter and hold a space or end in . or …. */
const sentenceLiterals = (source: string): string[] => {
  const out: string[] = [];
  for (const match of stripComments(source).matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)) {
    const literal = match[1] ?? match[2] ?? '';
    if (/^[A-Z][a-z]/.test(literal) && (/ /.test(literal) || /[.…]$/.test(literal)) && !/[<>{}=$]/.test(literal)) {
      out.push(literal);
    }
  }
  return out;
};

describe('Auth Surface v2 copy module', () => {
  test('message rows are the shared copy matrix, verbatim', () => {
    expect(AUTH_SURFACE_MESSAGES).toEqual({
      'mazer.cancelled': 'Sign-in did not finish. Tap Sign in to try again.',
      'mazer.timeout': 'Sign-in took too long. Tap Sign in to try again.',
      'mazer.storage': 'This browser is blocking site data. Allow it, then tap Sign in.',
      'signin.unavailable': 'Sign-in is unavailable right now. Try again in a minute.',
      'signin.callback': 'We could not finish signing you in. Sign in again.',
      'signin.session': 'Your session ended. Sign in again to continue.',
      'signin.offline': 'No connection. Check your internet and try again.',
      'page.crash': 'Check your connection and try again.',
      'page.offline': 'You are offline. We will reconnect when you are back.'
    });
  });

  test('labels are sentence case and match the button the player sees', () => {
    expect(AUTH_SURFACE_LABELS.signIn).toBe('Sign in');
    for (const value of listAuthSurfaceStrings()) {
      // No Title Case Words After The First (allowing the names Mazer, Safari, Chrome, Edge, Share, Install, Start, Dock).
      const words = value.replace(/\{[a-z]+\}/g, '').split(/[.,…]\s+/).flatMap((sentence) => sentence.split(/\s+/).slice(1));
      const offenders = words.filter((word) => /^[A-Z][a-z]/.test(word)
        && !/^(Mazer|Safari|Chrome|Edge|Share|Add|Home|Screen|Install|Start|Dock|Open|Sign|Tap|Allow|Copy|Paste|Click|Choose)/.test(word));
      expect(offenders, value).toEqual([]);
    }
    expect(AUTH_SURFACE_LABELS.kicker).toBe('MAZER');
  });

  test('the module holds no retired phrase', () => {
    for (const value of listAuthSurfaceStrings()) {
      for (const phrase of AUTH_SURFACE_RETIRED_PHRASES) {
        expect(value.includes(phrase), `${value} contains ${phrase}`).toBe(false);
      }
    }
  });
});

describe('Auth Surface v2 copy lint (surfaces read only the copy module)', () => {
  const allowed = new Set(listAuthSurfaceStrings());

  test.each(SURFACE_FILES)('%s: every sentence literal is in the copy module', (file) => {
    const strays = sentenceLiterals(read(file)).filter((literal) => !allowed.has(literal));
    expect(strays).toEqual([]);
  });

  test.each([...SURFACE_FILES, 'index.html', 'src/legacy-runtime/legacyPlayerMessageToast.ts'])('%s: no retired phrase', (file) => {
    const source = stripComments(read(file));
    for (const phrase of AUTH_SURFACE_RETIRED_PHRASES) {
      expect(source.includes(phrase), `${file} contains ${phrase}`).toBe(false);
    }
  });

  test('the static splash says the neutral loader label', () => {
    expect(read('index.html')).toContain('mazer-boot-splash-text">Opening Mazer&hellip;</p>');
    expect(AUTH_SURFACE_LABELS.opening).toBe('Opening Mazer…');
  });

  test('the Mazer leaderboard sentence is gone from Mazer source', () => {
    const files = ['src/scenes/MenuScene.ts', 'src/legacy-runtime/legacyPlayerMessage.ts', ...SURFACE_FILES];
    for (const file of files) {
      expect(read(file).toLowerCase()).not.toContain('shows on the mazer leaderboard');
    }
  });
});

describe('Auth Surface v2 copy is wired through', () => {
  test('the status screen, loaders and boot use the module', () => {
    expect(LEGACY_ACCOUNT_STATUS_COPY.retryLabel).toBe(AUTH_SURFACE_LABELS.signIn);
    expect(LEGACY_ACCOUNT_STATUS_COPY.loading).toBe(AUTH_SURFACE_LABELS.opening);
    expect(LEGACY_ACCOUNT_STATUS_COPY.signingIn).toBe(AUTH_SURFACE_LABELS.signingIn);
  });

  // The hand-off failure toast rows (legacyPlayerMessage.ts, integrator Wave 3B) and MAZER_OAUTH_SAFE_ERROR_MESSAGE
  // move onto the matrix in a separate Wave 3B PR; this PR stays inside Wave 5C. While signed out those toasts are
  // suppressed (shouldToastLegacyAuthFeedback), so the status box is the only failure copy a player sees.

  test('every install card line is in the module', () => {
    const allowed = new Set(listAuthSurfaceStrings());
    const cards = [
      ...Object.values(MAZER_INSTALL_GATE_COPY),
      resolveMazerInstallGateCopy('in-app-browser', 'android-in-app'),
      resolveMazerInstallGateCopy('installed-open-app', 'desktop-chromium')
    ];
    for (const card of cards) {
      for (const line of [card.title, card.lead, ...card.steps, ...(card.primaryLabel ? [card.primaryLabel] : [])]) {
        expect(allowed.has(line), line).toBe(true);
      }
    }
    expect(allowed.has(MAZER_INSTALL_GATE_COPY_FEEDBACK.copied)).toBe(true);
    expect(allowed.has(MAZER_INSTALL_GATE_COPY_FEEDBACK.failed)).toBe(true);
  });
});
