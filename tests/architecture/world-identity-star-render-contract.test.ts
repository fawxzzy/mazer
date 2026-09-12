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
  test('drawBackdrop reads the stored per-star seed and keeps the bright-star hue stable', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    // The active assignment must read the persisted field, not recompute a
    // hash from the star's own continuously-drifting position. This does
    // NOT check the whole file is free of the rejected expression's text --
    // the fix's own explanatory comment quotes it verbatim as documentation
    // of what was wrong -- it checks the specific assignment line itself.
    expect(menuSceneSource).toContain('const starSeed = star.seed;');
    expect(menuSceneSource).not.toContain('const starSeed = ((star.x * 9973) + (star.y * 6151)) % 1');

    // The brightest-tier sparkle hue must stay a stable per-star hue (seed
    // alone). The rejected form rotated it by scene time on top of the seed,
    // which is exactly the "strobe" behavior the fix removed; this check is
    // scoped to this one call site's exact old expression (`+ starSeed`) so
    // it cannot false-positive on the title-wordmark/goal-star-ring sparkle
    // call sites, which deliberately keep their own separate, unrelated
    // animation-time-driven hues elsewhere in this same file.
    expect(menuSceneSource).toContain('Phaser.Display.Color.HSVToRGB(starSeed, 0.8, 1).color');
    expect(menuSceneSource).not.toContain('HSVToRGB((animationTime / LEGACY_GOAL_STAR_RING_SPIN_PERIOD_MS) + starSeed');
  });
});
