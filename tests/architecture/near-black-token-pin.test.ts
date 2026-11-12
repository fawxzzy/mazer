import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * MAZER-UI-013 acceptance 3: "Page, manifest and boot colors share one near-black".
 * The page-level near-black is #02080f (design-tokens `legacy.color.bg.page`). index.html (theme-color meta and the
 * boot splash), the web manifest (theme_color, background_color), the Phaser boot config (backgroundColor) and the
 * app shell in base.css must all use it. The canvas background #03070B (`color.bg.canvas`) is a SEPARATE documented
 * token for the drawn board surface; it must stay a different, registered token and must not leak into page chrome.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const read = (path: string): string => readFileSync(resolve(repoRoot, path), 'utf8');

const tokens = JSON.parse(read('docs/contracts/mazer-ui-rework-design-tokens.v1.json')).tokens as {
  color: Record<string, string>;
  legacy: { color: Record<string, string> };
};
const NEAR_BLACK = tokens.legacy.color['bg.page'].toLowerCase();
const CANVAS = tokens.color['bg.canvas'].toLowerCase();

describe('near-black page token agreement (MAZER-UI-013)', () => {
  it('registers #02080f as the page near-black and #03070b as a distinct canvas token', () => {
    expect(NEAR_BLACK).toBe('#02080f');
    expect(CANVAS).toBe('#03070b');
    expect(NEAR_BLACK).not.toBe(CANVAS);
  });

  it('index.html theme-color meta and boot splash use the page near-black', () => {
    const html = read('index.html');
    expect(html).toMatch(/<meta\s+name="theme-color"\s+content="#02080f"\s*\/?>/i);
    expect(html).toMatch(/html,\s*body\s*\{[^}]*background:\s*#02080f/i);
    expect(html).toMatch(/#mazer-boot-splash\s*\{[^}]*background:\s*#02080f/i);
    expect(html.toLowerCase()).not.toContain(CANVAS);
  });

  it('the web manifest theme and background colours use the page near-black', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest')) as Record<string, string>;
    expect(manifest.theme_color.toLowerCase()).toBe(NEAR_BLACK);
    expect(manifest.background_color.toLowerCase()).toBe(NEAR_BLACK);
  });

  it('the Phaser boot config background uses the page near-black', () => {
    const config = read('src/boot/phaserConfig.ts');
    expect(config).toMatch(/backgroundColor:\s*'#02080f'/i);
  });

  it('base.css paints the document and the app shell with the page near-black', () => {
    const css = read('src/styles/base.css');
    expect(css).toMatch(/html,\s*body\s*\{[^}]*background:\s*#02080f/i);
    expect(css).toMatch(/#app\s*\{[^}]*background:\s*#02080f/i);
    // The canvas token appears only as a CSS-variable fallback, never as a page/shell background.
    expect(css).not.toMatch(/(?<!color-bg-canvas,\s*)\bbackground(?:-color)?:\s*#03070b/i);
  });
});
