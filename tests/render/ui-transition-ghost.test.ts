import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveUiTransitionPlan } from '../../src/render/uiTransition';
import { UiTransitionGhost } from '../../src/render/uiTransitionGhost';

interface FakeImage {
  alpha: number;
  depth: number;
  destroyed: boolean;
  visible: boolean;
  displayWidth: number;
  displayHeight: number;
  x: number;
  y: number;
  interactive: boolean;
  setOrigin(): FakeImage;
  setDepth(value: number): FakeImage;
  setDisplaySize(width: number, height: number): FakeImage;
  setPosition(x: number, y: number): FakeImage;
  setAlpha(value: number): FakeImage;
  setVisible(value: boolean): FakeImage;
  destroy(): void;
}

const createFakeScene = (canvas: { width: number; height: number } | null = { width: 1170, height: 2532 }) => {
  const draws: Array<{ source: unknown; x: number; y: number; dw: number; dh: number }> = [];
  const cleared: number[] = [];
  const textures = new Map<string, { source: { width: number; height: number }; refreshed: number }>();
  const images: FakeImage[] = [];
  const makeImage = (): FakeImage => {
    const image: FakeImage = {
      alpha: 1, depth: 0, destroyed: false, visible: true, displayWidth: 0, displayHeight: 0, x: 0, y: 0, interactive: false,
      setOrigin() { return image; },
      setDepth(value) { image.depth = value; return image; },
      setDisplaySize(width, height) { image.displayWidth = width; image.displayHeight = height; return image; },
      setPosition(x, y) { image.x = x; image.y = y; return image; },
      setAlpha(value) { image.alpha = value; return image; },
      setVisible(value) { image.visible = value; return image; },
      destroy() { image.destroyed = true; }
    };
    images.push(image);
    return image;
  };
  const scene = {
    game: { canvas },
    scale: { width: 390, height: 844 },
    textures: {
      exists: (key: string) => textures.has(key),
      get: (key: string) => {
        const entry = textures.get(key)!;
        return {
          getSourceImage: () => entry.source,
          getContext: () => ({
            clearRect: () => { cleared.push(1); },
            drawImage: (source: unknown, _sx: number, _sy: number, _sw: number, _sh: number, x: number, y: number, dw: number, dh: number) => { draws.push({ source, x, y, dw, dh }); }
          }),
          refresh: () => { entry.refreshed += 1; }
        };
      },
      createCanvas: (key: string, width: number, height: number) => {
        textures.set(key, { source: { width, height }, refreshed: 0 });
        return scene.textures.get(key);
      },
      remove: (key: string) => { textures.delete(key); }
    },
    add: { image: () => makeImage() }
  };
  return { scene, draws, cleared, textures, images };
};

describe('UiTransitionGhost (MAZER-MOTION-002)', () => {
  test('begin copies the canvas once, covers the screen at full opacity and is active', () => {
    const { scene, draws, images, textures } = createFakeScene();
    const ghost = new UiTransitionGhost(scene as never, 'ghost', 5009);
    expect(ghost.active).toBe(false);
    expect(ghost.begin(resolveUiTransitionPlan('overlay-open', false), 1000)).toBe(true);
    expect(ghost.active).toBe(true);
    expect(draws).toHaveLength(1);
    expect(draws[0].source).toBe(scene.game.canvas);
    // 1170x2532 (about 3 million pixels) is over the pixel budget, so the copy is made at a reduced scale.
    const copied = textures.get('ghost')?.source;
    expect(copied!.width * copied!.height).toBeLessThanOrEqual(1_000_000);
    expect(copied!.width / copied!.height).toBeCloseTo(1170 / 2532, 2);
    expect([draws[0].dw, draws[0].dh]).toEqual([copied!.width, copied!.height]);
    const image = images[0];
    expect(image.depth).toBe(5009);
    expect(image.interactive).toBe(false);
    expect(image.alpha).toBe(1);
    expect([image.x, image.y]).toEqual([0, 0]);
    expect([image.displayWidth, image.displayHeight]).toEqual([390, 844]);
  });

  test('update fades the snapshot over the plan length, then hides it and keeps the reused texture', () => {
    const { scene, images, textures } = createFakeScene();
    const ghost = new UiTransitionGhost(scene as never, 'ghost', 1);
    const plan = resolveUiTransitionPlan('overlay-open', false);
    ghost.begin(plan, 1000);
    ghost.update(1000 + (plan.durationMs / 2));
    expect(images[0].alpha).toBeGreaterThan(0);
    expect(images[0].alpha).toBeLessThan(1);
    ghost.update(1000 + plan.durationMs);
    expect(ghost.active).toBe(false);
    expect(images[0].visible).toBe(false);
    expect(images[0].destroyed).toBe(false);
    expect(textures.has('ghost')).toBe(true);
    // Idle updates are free and safe.
    ghost.update(5000);
    expect(ghost.active).toBe(false);
  });

  test('Start drifts outward about the screen centre in full motion and never moves under reduced motion', () => {
    const full = createFakeScene();
    const fullGhost = new UiTransitionGhost(full.scene as never, 'ghost', 1);
    const fullPlan = resolveUiTransitionPlan('start', false);
    fullGhost.begin(fullPlan, 0);
    fullGhost.update(fullPlan.durationMs * 0.6);
    const image = full.images[0];
    expect(image.displayWidth).toBeGreaterThan(390);
    expect(image.x).toBeLessThan(0);
    expect(image.x + (image.displayWidth / 2)).toBeCloseTo(195, 6);
    expect(image.y + (image.displayHeight / 2)).toBeCloseTo(422, 6);

    const reduced = createFakeScene();
    const reducedGhost = new UiTransitionGhost(reduced.scene as never, 'ghost', 1);
    const reducedPlan = resolveUiTransitionPlan('start', true);
    reducedGhost.begin(reducedPlan, 0);
    reducedGhost.update(reducedPlan.durationMs * 0.6);
    expect([reduced.images[0].x, reduced.images[0].y]).toEqual([0, 0]);
    expect([reduced.images[0].displayWidth, reduced.images[0].displayHeight]).toEqual([390, 844]);
    expect(reduced.images[0].alpha).toBeLessThan(1);
  });

  test('a canvas under the pixel budget is copied 1:1 and the texture is reused across transitions', () => {
    const { scene, draws, textures, images } = createFakeScene({ width: 1280, height: 720 });
    const ghost = new UiTransitionGhost(scene as never, 'ghost', 1);
    const plan = resolveUiTransitionPlan('overlay-close', false);
    ghost.begin(plan, 0);
    expect(textures.get('ghost')?.source).toEqual({ width: 1280, height: 720 });
    ghost.update(plan.durationMs);
    const texture = textures.get('ghost');
    ghost.begin(plan, 1000);
    expect(textures.get('ghost')).toBe(texture);
    expect(draws).toHaveLength(2);
    expect(images).toHaveLength(1);
    expect(images[0].visible).toBe(true);
  });

  test('a second begin while fading re-snapshots and reuses the one image', () => {
    const { scene, draws, images } = createFakeScene();
    const ghost = new UiTransitionGhost(scene as never, 'ghost', 1);
    ghost.begin(resolveUiTransitionPlan('overlay-open', false), 0);
    ghost.begin(resolveUiTransitionPlan('overlay-close', false), 50);
    expect(draws).toHaveLength(2);
    expect(images).toHaveLength(1);
    expect(ghost.active).toBe(true);
  });

  test('a device whose average frame is over the 30 fps budget gets no cover, and gets it back once it recovers', () => {
    const { scene, draws } = createFakeScene();
    const ghost = new UiTransitionGhost(scene as never, 'ghost', 1);
    for (let i = 0; i < 60; i += 1) ghost.update(i * 60, 60);
    expect(ghost.begin(resolveUiTransitionPlan('overlay-open', false), 4000)).toBe(false);
    expect(ghost.active).toBe(false);
    expect(draws).toHaveLength(0);
    for (let i = 0; i < 90; i += 1) ghost.update(5000 + (i * 16.7), 16.7);
    expect(ghost.begin(resolveUiTransitionPlan('overlay-open', false), 7000)).toBe(true);
    expect(draws).toHaveLength(1);
  });

  test('begin is a harmless no-op when there is no canvas to copy', () => {
    for (const canvas of [null, { width: 0, height: 0 }]) {
      const { scene, images } = createFakeScene(canvas);
      const ghost = new UiTransitionGhost(scene as never, 'ghost', 1);
      expect(ghost.begin(resolveUiTransitionPlan('start', false), 0)).toBe(false);
      expect(ghost.active).toBe(false);
      expect(images).toHaveLength(0);
    }
  });

  test('release drops everything at once (scene shutdown)', () => {
    const { scene, images, textures } = createFakeScene();
    const ghost = new UiTransitionGhost(scene as never, 'ghost', 1);
    ghost.begin(resolveUiTransitionPlan('start', false), 0);
    ghost.release();
    expect(ghost.active).toBe(false);
    expect(images[0].destroyed).toBe(true);
    expect(textures.size).toBe(0);
  });

  test('the snapshot is never made interactive, so it can not swallow a tap', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/render/uiTransitionGhost.ts'), 'utf8');
    expect(source).not.toMatch(/setInteractive|input\./);
  });
});
