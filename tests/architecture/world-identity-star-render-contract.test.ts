import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * Wave 4E's own narrow renderer-use regression.
 *
 * tests/reset/legacy-menu-backdrop.test.ts already proves the STORED
 * `seed` field itself is stable across the star's own advance/recycle
 * lifecycle -- but that test only exercises the data model. It would still
 * pass unchanged if MenuScene.ts's draw loop stopped reading `star.seed`
 * and went back to recomputing the old, per-frame-unstable
 * `((star.x * 9973) + (star.y * 6151)) % 1` hash the fix replaced, or if
 * the brightest-tier sparkle hue reacquired an animation-time input. This
 * is a source-pin contract in the same style already used throughout
 * tests/architecture/ (see directional-intent-contract.test.ts and
 * friends) to protect exactly that draw-time wiring, not the data model
 * tested elsewhere.
 */
describe('World Identity background-star render contract', () => {
  test('the backdrop star fill reads the stored per-star seed, and its colour reads the scene clock', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    // MAZER-VIS-066: drawBackdrop routes every star through the shaped star list (src/render/backdropStarShapes.ts).
    const shapesSource = readFileSync(resolve(process.cwd(), 'src/render/backdropStarShapes.ts'), 'utf8');

    // The active assignment must read the persisted field, not recompute a hash from the star's own
    // continuously-drifting position (the old per-frame strobe bug).
    expect(shapesSource).toContain('const starSeed = star.seed;');
    expect(shapesSource).not.toContain('((star.x * 9973) + (star.y * 6151)) % 1');
    expect(menuSceneSource).not.toContain('const starSeed = ((star.x * 9973) + (star.y * 6151)) % 1');

    // The 2026-11-10 coloured sparkle tier keyed its hue off the seed through Phaser; it stays gone.
    expect(menuSceneSource).not.toContain('Phaser.Display.Color.HSVToRGB(starSeed');

    // MAZER-VIS-066 (owner, 2026-11-19): real star shapes with the rainbow sweep. The scene passes the scene clock
    // (this.time.now) for the colour in every motion mode and the motion flag separately, so Reduce Motion / Still stop
    // the drift and twinkle but never the colour; the colour-only redraw gate keeps the sweep moving while still.
    expect(menuSceneSource).toContain(
      'fillBackdropStarShapeList(this.backdropStarShapes, this.stars, width, height, this.time.now, backdropMotionEnabled, palette.starAlphaScale);'
    );
    expect(menuSceneSource).toContain('installBackdropStarSpriteRenderer(this.backdropGraphics, this.backdropStarShapes);');
    expect(shapesSource).toContain('resolveBackdropStarHueStep(sceneTimeMs, pixelX, width)');
    expect(shapesSource).not.toContain('resolveBackdropStarHueStep(animationTime');
    expect(menuSceneSource).toContain('stepBackdropColourRedraw(time, this.backdropColourNextDueAtMs)');
  });
});
