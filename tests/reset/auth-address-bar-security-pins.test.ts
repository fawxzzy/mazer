/**
 * Security regression pins asked for by the Auth Surface v2 security review (FawxzzyWeb PR 181 left these as
 * Mazer-side follow-ups): the one-time OAuth callback material (code, state, error, error_description) never stays in
 * the address bar, the page never sends a Referer that could carry it, and the page's CSP posture does not change
 * as a side effect of auth work.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { captureAndScrubMazerOAuthCallback } from '../../src/legacy-runtime/legacyAccountPortal';

const STATE = 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789';
const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const locationFor = (href: string) => {
  const url = new URL(href);
  return { hash: url.hash, origin: url.origin, pathname: url.pathname, search: url.search };
};

const scrubbedUrl = (href: string): string => {
  const history = { replaceState: vi.fn() };
  captureAndScrubMazerOAuthCallback(locationFor(href), history);
  expect(history.replaceState).toHaveBeenCalledTimes(1);
  return String(history.replaceState.mock.calls[0][2]);
};

describe('OAuth callback scrub (address bar)', () => {
  test('a valid success callback leaves a bare path: no code, no state', () => {
    const history = { replaceState: vi.fn() };
    const captured = captureAndScrubMazerOAuthCallback(
      locationFor(`https://mazer.fawxzzy.com/?code=one-time-code&state=${STATE}`),
      history
    );
    expect(captured).toMatchObject({ code: 'one-time-code', malformed: false, requested: true, state: STATE });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  test.each([
    `https://mazer.fawxzzy.com/?code=one-time-code&state=${STATE}&runtimeDiagnostics=1`,
    `https://mazer.fawxzzy.com/?error=access_denied&error_description=raw%20provider%20text&state=${STATE}`,
    `https://mazer.fawxzzy.com/?code=a&code=b&state=${STATE}`,
    `https://mazer.fawxzzy.com/?code=one-time-code&state=${STATE}&state=${STATE}`,
    `https://mazer.fawxzzy.com/?code=one-time-code#state=${STATE}&code=fragment-code`
  ])('no callback key survives in the replaced URL: %s', (href) => {
    const next = scrubbedUrl(href);
    const url = new URL(next, 'https://mazer.fawxzzy.com');
    for (const key of ['code', 'state', 'error', 'error_description']) {
      expect(url.searchParams.has(key), `${key} in ${next}`).toBe(false);
    }
    expect(next).not.toContain('one-time-code');
    expect(next).not.toContain('fragment-code');
    expect(next).not.toContain(STATE);
    expect(next).not.toContain('raw');
    expect(next).not.toContain('#');
  });

  test('unrelated query keys survive the scrub', () => {
    expect(scrubbedUrl(`https://mazer.fawxzzy.com/?runtimeDiagnostics=1&code=x&state=${STATE}`)).toBe('/?runtimeDiagnostics=1');
  });

  test('boot scrubs before anything awaits (no network, gate or font wait sees the code)', () => {
    const main = read('src/boot/main.ts');
    const boot = main.slice(main.indexOf('const boot = async'));
    const scrub = boot.indexOf('captureAndScrubMazerOAuthCallback(window.location, window.history)');
    expect(scrub).toBeGreaterThan(-1);
    expect(scrub).toBeLessThan(boot.indexOf('await '));
    expect(scrub).toBeLessThan(boot.indexOf("markMazerBootStatus('boot-start')"));
  });
});

describe('index.html referrer and CSP posture', () => {
  const html = read('index.html');

  test('keeps <meta name="referrer" content="no-referrer"> in the head, once', () => {
    const head = html.slice(0, html.indexOf('</head>'));
    const matches = head.match(/<meta\s+name="referrer"[^>]*>/g) ?? [];
    expect(matches).toEqual(['<meta name="referrer" content="no-referrer" />']);
    // Before any script or stylesheet that could issue a request.
    const referrer = head.indexOf('<meta name="referrer"');
    for (const marker of ['<script', '<link rel="stylesheet"', '<link rel="preload"']) {
      const at = head.indexOf(marker);
      if (at !== -1) {
        expect(referrer, marker).toBeLessThan(at);
      }
    }
  });

  // Mazer declares no Content-Security-Policy today (no meta in index.html, no headers block in vercel.json; the
  // live response carried none on 2026-11-15). This pin keeps that posture from changing as a side effect: adding a
  // CSP is a deliberate security change that must update this test in the same PR.
  test('the CSP posture is unchanged: no CSP meta and no response headers block', () => {
    expect(html.toLowerCase()).not.toContain('content-security-policy');
    const vercel = JSON.parse(read('vercel.json')) as Record<string, unknown>;
    expect(vercel.headers).toBeUndefined();
    expect(Object.keys(vercel).sort()).toEqual(['$schema', 'git', 'redirects', 'rewrites']);
  });
});
