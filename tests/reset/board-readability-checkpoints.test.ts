import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveLegacyIridescentPlayerCoreColor } from '../../src/legacy-runtime/legacyIridescentMaterial';
import { BOARD_CHIP_FILL, boardMaterial } from '../../src/render/boardTileStyle';
import { getContrastRatio, getPaletteReadabilityReport, getRelativeLuminance, palette } from '../../src/render/palette';

/**
 * Readability checkpoints that must not regress.
 *
 * History: on the shipping `palette`, floor-vs-route 1.39 (min 2.85), floor-vs-player 2.05 (min 2.85),
 * floor-vs-start 1.49 (min 1.85) and start-vs-player 1.38 (min 1.52) failed. Root cause: the palette model's
 * floor (0xb2b2b2, luminance 0.445) sat below the 0.52 cutoff that picks the repair direction, so every role
 * colour was pushed LIGHT, and white cannot reach 2.85:1 against that floor (it tops out near 2.1:1). The
 * floor is now 0xc8c8c8 (luminance 0.578), so the repair goes dark and every checkpoint clears.
 *
 * Separately, the SHIPPED Chip board does not draw on that model floor at all: it draws on BOARD_CHIP_FILL.
 * The second block pins the real colours against the real floor with the WCAG non-text threshold of 3:1.
 */
describe('palette readability report (shipping palette)', () => {
  const report = getPaletteReadabilityReport(palette);
  const byKey = new Map(report.checkpoints.map((checkpoint) => [checkpoint.key, checkpoint]));

  test('the model floor is on the dark-repair side of the luminance cutoff', () => {
    expect(getRelativeLuminance(palette.board.floor)).toBeGreaterThanOrEqual(0.52);
  });

  test.each([
    ['floor-vs-route', 2.85],
    ['floor-vs-player', 2.85],
    ['floor-vs-start', 1.85],
    ['start-vs-player', 1.52]
  ])('%s clears its repo threshold (%f)', (key, minimum) => {
    const checkpoint = byKey.get(key);
    expect(checkpoint, key).toBeDefined();
    expect(checkpoint!.minimum).toBeGreaterThanOrEqual(minimum);
    expect(checkpoint!.ratio, key).toBeGreaterThanOrEqual(minimum);
    expect(checkpoint!.passes, key).toBe(true);
  });

  test('no checkpoint fails', () => {
    expect(report.failures.map((failure) => `${failure.key} ${failure.ratio.toFixed(2)}<${failure.minimum}`)).toEqual([]);
  });
});

describe('shipped Chip board: real role colours against the real chip floor (non-text, >= 3:1)', () => {
  const playerCore = resolveLegacyIridescentPlayerCoreColor(0);

  test.each([
    ['player core', playerCore],
    ['player ring (locator)', boardMaterial.player],
    ['player ping (locator)', boardMaterial.playerEdge],
    ['start marker', boardMaterial.start],
    ['trail reference (cyan)', boardMaterial.trailReference],
    ['lit rim', boardMaterial.rim]
  ])('%s vs chip fill', (_name, color) => {
    expect(getContrastRatio(color, BOARD_CHIP_FILL)).toBeGreaterThanOrEqual(3);
  });

  test('the player core keeps >= 3:1 against its dark keyline, so it separates from the trail through its tile', () => {
    expect(getContrastRatio(playerCore, boardMaterial.void)).toBeGreaterThanOrEqual(3);
  });

  test('the chip itself separates from the board background (the void)', () => {
    expect(getContrastRatio(BOARD_CHIP_FILL, boardMaterial.void)).toBeGreaterThanOrEqual(3);
  });
});

describe('player locator wiring in MenuScene', () => {
  const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n?/g, '\n');

  test('the locator is drawn before the core fill and only in the play branch', () => {
    const start = scene.indexOf('private fillLegacyPlayerMarkerTile(');
    const body = scene.slice(start, scene.indexOf('private drawPlayerGlowCanvas(', start));
    const locator = body.indexOf('drawPlayerLocator(this.boardDynamicGraphics');
    const coreFill = body.indexOf('this.boardDynamicGraphics.fillStyle(playerCoreColor, alpha);');
    const playBranch = body.indexOf('if (showLocatorTicks) {');
    expect(playBranch).toBeGreaterThan(-1);
    expect(locator).toBeGreaterThan(playBranch);
    expect(coreFill).toBeGreaterThan(locator);
  });

  test('the ping only forces dynamic redraws through needsRedraw, and reduced motion is passed through', () => {
    expect(scene).toContain('this.playerLocatorState.needsRedraw()');
    expect(scene).toContain('this.playerLocatorState.update(time, live,');
    expect(scene).toMatch(/pingStartMs: this\.playerLocatorState\.activePingStartMs,\n\s+reducedMotion: this\.prefersLegacyReducedMotion\(\)/);
  });
});
