/**
 * The trail cost options page (trail-perf-options.html, MAZER-PERF-017 follow-up) must not change the game: the page is
 * not a build input, nothing the game ships imports its code, and the draw seam it uses is empty unless the page fills it.
 * Since the owner's C + A pick (2026-11-24) the game draws through the cached painter (starDustTrailCache.ts); the full
 * repaint stays only as the reference and the page's "Before" row.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { StarDustDrawOptions } from '../../src/render/starDustTrailCanvas';
import { drawStarDustTrailToCanvasContext } from '../../src/render/starDustTrailCache';
import {
  getStarDustTrailRenderOverride,
  setStarDustTrailRenderOverride
} from '../../src/render/starDustRenderOverride';

const ROOT = join(__dirname, '..', '..');
const PAGE_ONLY = [join('src', 'render', 'trailPerf') + sep, join('src', 'render', 'starDustRenderOverride.ts')];

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

afterEach(() => setStarDustTrailRenderOverride(null));

describe('trail cost options page stays out of the game', () => {
  test('the page is not a vite build input', () => {
    const vite = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(vite).not.toMatch(/trail-perf-options/);
    expect(readFileSync(join(ROOT, 'trail-perf-options.html'), 'utf8')).toContain('/src/render/trailPerf/trailPerfOptionsMain.ts');
  });

  test('no game source imports the page code or fills the seam', () => {
    const offenders = walk(join(ROOT, 'src'))
      .filter((path) => /\.(ts|tsx|js|mjs)$/.test(path))
      .map((path) => relative(ROOT, path))
      .filter((rel) => !PAGE_ONLY.some((own) => rel === own || rel.startsWith(own)))
      .filter((rel) => {
        const text = readFileSync(join(ROOT, rel), 'utf8');
        return /trailPerf\//.test(text) || /setStarDustTrailRenderOverride/.test(text);
      });
    expect(offenders).toEqual([]);
  });

  test('the scene draws the trail through the cached painter; the full repaint is not called by game code', () => {
    const scene = readFileSync(join(ROOT, 'src', 'scenes', 'MenuScene.ts'), 'utf8');
    expect(scene).toMatch(/import \{[^}]*\bdrawStarDustTrailToCanvasContext\b[^}]*\} from '\.\.\/render\/starDustTrailCache';/);
    expect(scene).toMatch(/releaseStarDustTrailCache\(\)/);
    const callers = walk(join(ROOT, 'src'))
      .filter((path) => /\.(ts|tsx|js|mjs)$/.test(path))
      .map((path) => relative(ROOT, path))
      .filter((rel) => !PAGE_ONLY.some((own) => rel === own || rel.startsWith(own)))
      .filter((rel) => rel !== join('src', 'render', 'starDustTrailCanvas.ts'))
      .filter((rel) => /drawStarDustTrailFullToCanvasContext/.test(readFileSync(join(ROOT, rel), 'utf8')));
    expect(callers).toEqual([]);
  });

  test('the seam is empty by default and the shipped draw runs; a filled seam is used and can be emptied', () => {
    expect(getStarDustTrailRenderOverride()).toBeNull();
    const ctx = new Proxy({}, {
      get: (_t, name) => (name === 'canvas' ? { width: 10, height: 10 } : () => undefined),
      set: () => true
    }) as unknown as CanvasRenderingContext2D;
    const options: StarDustDrawOptions = {
      originX: 0, originY: 0, tileSize: 16, coreWidth: 4, glowWidth: 10, glowAlphaRatio: 0.5, glowBlurPx: 0,
      keylineColor: 0, keylineAlpha: 1, timeMs: 0, animated: true, originAdvancePx: 0
    };
    const segment = { previous: { x: 8, y: 8, distance: 0 }, current: { x: 40, y: 8, distance: 32 }, glowColor: 0xffffff, coreColor: 0xffffff, alpha: 1 };
    let calls = 0;
    setStarDustTrailRenderOverride(() => { calls += 1; return -7; });
    expect(drawStarDustTrailToCanvasContext(ctx, [segment], options)).toBe(-7);
    expect(calls).toBe(1);
    setStarDustTrailRenderOverride(null);
    expect(drawStarDustTrailToCanvasContext(ctx, [segment], options)).toBeGreaterThanOrEqual(0);
    expect(calls).toBe(1);
  });
});
