import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, test, vi } from 'vitest';

// BootScene.ts does `import Phaser from 'phaser'` at module scope, and the
// real Phaser package's own init code touches `window` immediately -- this
// suite runs in vitest's default Node environment (not jsdom), so importing
// the real package throws. Same lightweight stub-and-dynamic-import pattern
// tests/reset/boot-presentation.test.ts already uses for this exact file.
vi.mock('phaser', () => ({
  default: {
    Scene: class {}
  }
}));

let MAZER_FLOOR_TILE_INTERIOR_CROP: typeof import('../../src/scenes/BootScene').MAZER_FLOOR_TILE_INTERIOR_CROP;
let MAZER_FLOOR_TILE_INTERIOR_TEXTURE_KEY: typeof import('../../src/scenes/BootScene').MAZER_FLOOR_TILE_INTERIOR_TEXTURE_KEY;
let isMazerFloorTileInteriorTextureAvailable: typeof import('../../src/scenes/BootScene').isMazerFloorTileInteriorTextureAvailable;

beforeAll(async () => {
  ({
    MAZER_FLOOR_TILE_INTERIOR_CROP,
    MAZER_FLOOR_TILE_INTERIOR_TEXTURE_KEY,
    isMazerFloorTileInteriorTextureAvailable
  } = await import('../../src/scenes/BootScene'));
});

// BootScene's floor-tile interior texture is generated from a real Canvas
// 2D context against a real Phaser TextureManager at boot -- there is no
// existing test harness in this repo for driving that (see
// tests/reset/boot-presentation.test.ts's own note that BootScene/MenuScene
// are only imported to confirm phaserConfig wiring, never instantiated with
// a real scene runtime). Rather than build a fragile ad hoc Phaser/canvas
// mock under time pressure, this file tests what's genuinely testable in
// isolation (the crop bounds constant, the exported availability getter's
// real default-state behavior) and pins the source-level safety
// invariants -- the diagnostic-on-failure and never-fall-back-to-the-raw-
// or-missing-texture guarantees -- via this codebase's own established
// pattern for hard-to-harness Scene internals (see
// tests/scenes/menu-render-frame.test.ts's many literal-source assertions).

describe('BootScene floor-tile interior texture', () => {
  test('crop bounds are the measured safe-interior region, comfortably inside both the bezel border and outer glow', () => {
    // See BootScene.ts's own header comment: outer glow starts below
    // x=228/above x=1024, the bright bezel spike is at x=230-238 and
    // x=1018-1022, the source is 1254x1254. [260,260]-[990,990] must clear
    // both bands on every side with real margin.
    expect(MAZER_FLOOR_TILE_INTERIOR_CROP.x).toBeGreaterThan(238);
    expect(MAZER_FLOOR_TILE_INTERIOR_CROP.y).toBeGreaterThan(238);
    expect(MAZER_FLOOR_TILE_INTERIOR_CROP.x + MAZER_FLOOR_TILE_INTERIOR_CROP.width).toBeLessThan(1018);
    expect(MAZER_FLOOR_TILE_INTERIOR_CROP.y + MAZER_FLOOR_TILE_INTERIOR_CROP.height).toBeLessThan(1018);
    expect(MAZER_FLOOR_TILE_INTERIOR_CROP.width).toBe(MAZER_FLOOR_TILE_INTERIOR_CROP.height);
  });

  test('the derived texture key is a stable, non-empty identifier distinct from the raw bordered source key', () => {
    expect(MAZER_FLOOR_TILE_INTERIOR_TEXTURE_KEY.length).toBeGreaterThan(0);
    expect(MAZER_FLOOR_TILE_INTERIOR_TEXTURE_KEY).not.toBe('mazerFloorTile');
  });

  test('isMazerFloorTileInteriorTextureAvailable() is false until BootScene actually generates the texture (never optimistic)', () => {
    // A fresh module import (no BootScene instance has run create() in this
    // process) must report unavailable -- a consumer that skipped the
    // availability check and assumed success by default would be exactly
    // the bug this correction closes.
    expect(isMazerFloorTileInteriorTextureAvailable()).toBe(false);
  });
});

const normalizeSourceLineEndings = (source: string): string => source.replace(/\r\n?/g, '\n');

describe('BootScene floor-tile texture generation failure safety (source-level invariants)', () => {
  const bootSceneSource = normalizeSourceLineEndings(
    readFileSync(resolve(process.cwd(), 'src/scenes/BootScene.ts'), 'utf8')
  );

  test('never marks the texture available except on the real success path', () => {
    // Exactly one assignment to true, and it must be gated behind an actual
    // post-addCanvas existence check inside the try block -- not before the
    // crop/context work, and not in a catch/early-return branch. addCanvas
    // has no documented failure return, so trusting it unconditionally
    // would make the flag a hope rather than a fact.
    const trueAssignments = bootSceneSource.match(/mazerFloorTileInteriorTextureAvailable = true;/g) ?? [];
    expect(trueAssignments).toHaveLength(1);
    expect(bootSceneSource).toContain(
      'this.textures.addCanvas(MAZER_FLOOR_TILE_INTERIOR_TEXTURE_KEY, canvas);'
      + '\n      // Confirm the derived texture actually registered before trusting it --'
      + '\n      // addCanvas has no documented failure return, but checking here (not'
      + '\n      // just assuming the preceding call succeeded) is what makes this'
      + '\n      // flag an honest reflection of the real texture\'s presence.'
      + '\n      if (this.textures.exists(MAZER_FLOOR_TILE_INTERIOR_TEXTURE_KEY)) {'
      + '\n        mazerFloorTileInteriorTextureAvailable = true;'
    );
  });

  test('resets the availability flag to false at the start of every generation attempt, not just at module load', () => {
    // A later regeneration attempt (scene restart, hot-reload) that fails
    // must not leave the flag stuck true from an earlier, successful
    // lifecycle -- so the function itself must reset it first, not rely
    // solely on the module-level field's own initial value. Exactly two
    // occurrences of the bare assignment text expected: the field's own
    // `let ... = false;` declaration, and this in-function reset.
    const allFalseAssignments = bootSceneSource.match(/mazerFloorTileInteriorTextureAvailable = false;/g) ?? [];
    expect(allFalseAssignments).toHaveLength(2);
    expect(bootSceneSource).toContain('let mazerFloorTileInteriorTextureAvailable = false;');

    const fnStart = bootSceneSource.indexOf('private generateMazerFloorTileInteriorTexture(): void {');
    const resetIndex = bootSceneSource.indexOf('mazerFloorTileInteriorTextureAvailable = false;', fnStart);
    const firstGuardIndex = bootSceneSource.indexOf('if (!this.textures.exists(MAZER_FLOOR_TILE_TEXTURE_KEY))', fnStart);
    expect(fnStart).toBeGreaterThan(-1);
    expect(resetIndex).toBeGreaterThan(fnStart);
    expect(resetIndex).toBeLessThan(firstGuardIndex);
  });

  test('logs a diagnostic instead of throwing when the source texture is missing', () => {
    expect(bootSceneSource).toContain("if (!this.textures.exists(MAZER_FLOOR_TILE_TEXTURE_KEY)) {\n      console.warn(");
  });

  test('logs a diagnostic instead of throwing when Canvas 2D is unavailable', () => {
    expect(bootSceneSource).toContain('if (!ctx) {\n        console.warn(');
  });

  test('logs a diagnostic instead of throwing when generation itself fails', () => {
    expect(bootSceneSource).toContain('} catch (error) {\n      console.warn(');
  });

  test('never removes the never-fatal-to-boot try/catch around generation', () => {
    expect(bootSceneSource).toContain('private generateMazerFloorTileInteriorTexture(): void {');
  });
});

// Chip wiring (2026-11-06): the board no longer uses the floor-tile texture. MenuScene stopped creating
// the TileSprite (and its GeometryMask) when the baked Chip board replaced the pale-mint tile, so the two
// fallback-safety assertions that pinned `floorTileTextureKey` and `boardFloorTileSprite.setVisible(false)`
// are replaced by the invariant that nothing in MenuScene can request the textures at all. BootScene's
// generator tests above are unchanged: it still bakes the derived texture (BootScene is not edited by the
// Chip wiring lane); removing that dead generation is a separate BootScene-owner change.
describe('MenuScene no longer requests the floor-tile textures (Chip board)', () => {
  const menuSceneSource = normalizeSourceLineEndings(
    readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8')
  );

  test('never constructs the floor TileSprite or its mask, and never imports the floor/bleed texture keys', () => {
    expect(menuSceneSource).not.toContain('floorTileTextureKey');
    expect(menuSceneSource).not.toContain('tileSprite(');
    expect(menuSceneSource).not.toContain('MAZER_FLOOR_TILE_INTERIOR_TEXTURE_KEY');
    expect(menuSceneSource).not.toContain('MAZER_FLOOR_TILE_TEXTURE_KEY');
    expect(menuSceneSource).not.toContain('MAZER_BLEED_PATH_TEXTURE_KEY');
  });

  test('draws the board through the baked tile layer instead', () => {
    expect(menuSceneSource).toContain('new BoardTileLayer(this, this.boardTileLayerTextureKey)');
  });
});
