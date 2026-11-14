import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHARED_BACKDROP_HEX, SHARED_BACKDROP_PHASER } from '../../src/render/sharedBackdrop';

/*
 * MAZER-VIS-012: boot, install gate and sign-in share ONE near-black canvas colour (the registered legacy bg.page
 * token). Every surface below is checked against the one shared constant, so a drifting colour fails here. The
 * install gate has no starfield (static HTML) and the sign-in surface is fully opaque, so there is no gate starfield
 * to calm; that is pinned below so it cannot silently grow one.
 */
const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string): string => readFileSync(resolve(here, '..', '..', path), 'utf8');

const gateRule = (): string => {
  const css = read('src/styles/base.css');
  const match = /#mazer-install-gate-overlay\s*\{[^}]*\}/.exec(css);
  expect(match).not.toBeNull();
  return match?.[0] ?? '';
};

describe('shared near-black backdrop (MAZER-VIS-012)', () => {
  it('is the registered page near-black', () => {
    expect(SHARED_BACKDROP_HEX.toLowerCase()).toBe('#02080f');
    expect(SHARED_BACKDROP_PHASER).toBe(0x02080f);
  });

  it('the boot splash paints the shared colour', () => {
    expect(read('index.html')).toMatch(new RegExp(String.raw`#mazer-boot-splash\s*\{[^}]*background:\s*${SHARED_BACKDROP_HEX}`, 'i'));
  });

  it('the install gate paints the shared colour (token with the same fallback), not its own teal', () => {
    const rule = gateRule();
    expect(rule).toContain('var(--mazer-token-legacy-color-bg-page');
    expect(rule.toLowerCase()).toContain(SHARED_BACKDROP_HEX);
    expect(rule.toLowerCase()).not.toContain('#031f20');
  });

  it('the install gate is static: no animation in its rule', () => {
    expect(gateRule()).not.toMatch(/animation/i);
  });

  it('the in-game sign-in surface and the dark menu field are the shared colour', () => {
    const source = read('src/scenes/MenuScene.ts');
    expect(source).toContain('this.backdropGraphics.fillStyle(this.settings.darkMode ? SHARED_BACKDROP_PHASER : palette.fieldColor, 1);');
    // The auth overlay is fully opaque, so what a player sees on sign-in is this fill, not the field or the stars.
    expect(source).toContain("this.overlayGraphics.fillStyle(this.overlay === 'auth' ? SHARED_BACKDROP_PHASER : 0x02040a,");
    expect(source).not.toContain('this.backdropGraphics.fillStyle(cyberArcadeMaterial.substrate.field, 1);');
  });

  it('the Phaser boot config background is the shared colour', () => {
    expect(read('src/boot/phaserConfig.ts')).toMatch(new RegExp(String.raw`backgroundColor:\s*'${SHARED_BACKDROP_HEX}'`, 'i'));
  });
});
