import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  BOARD_LAYER_CACHE_STABLE_FRAMES,
  installBoardLayerFrameCache,
  resolveBoardLayerCacheEnabled,
  type BoardLayerCacheImageLike
} from '../../src/render/boardLayerFrameCache';

interface FakeCtx {
  canvas: { width: number; height: number };
  calls: string[];
  globalAlpha: number;
  globalCompositeOperation: string;
  save(): void;
  restore(): void;
  resetTransform(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: unknown, x: number, y: number): void;
}

const makeCtx = (name: string, width = 100, height = 200): FakeCtx => {
  const calls: string[] = [];
  return {
    canvas: { width, height },
    calls,
    globalAlpha: 0.3,
    globalCompositeOperation: 'lighter',
    save: () => calls.push(`${name}:save`),
    restore: () => calls.push(`${name}:restore`),
    resetTransform: () => calls.push(`${name}:resetTransform`),
    clearRect: (x, y, w, h) => calls.push(`${name}:clear ${x},${y},${w},${h}`),
    drawImage: (_i, x, y) => calls.push(`${name}:drawImage ${x},${y}`)
  };
};

const setup = (over: Partial<BoardLayerCacheImageLike> = {}) => {
  const game = makeCtx('game');
  const layer = makeCtx('layer');
  const canvasListeners = new Map<string, Set<() => void>>();
  const layerCanvas = Object.assign(layer.canvas, {
    getContext: () => layer,
    addEventListener: (type: string, fn: () => void) => {
      if (!canvasListeners.has(type)) canvasListeners.set(type, new Set());
      canvasListeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => { canvasListeners.get(type)?.delete(fn); }
  });
  const docListeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible',
    addEventListener: (_t: 'visibilitychange', fn: () => void) => { docListeners.add(fn); },
    removeEventListener: (_t: 'visibilitychange', fn: () => void) => { docListeners.delete(fn); }
  };
  const fire = (type: string) => { for (const fn of [...(canvasListeners.get(type) ?? [])]) fn(); };
  const fireVisibility = () => { for (const fn of [...docListeners]) fn(); };
  const listenerCount = () => docListeners.size + [...canvasListeners.values()].reduce((n, set) => n + set.size, 0);
  const renderer = { currentContext: game as unknown };
  let phaserDraws = 0;
  const drawnOn: unknown[] = [];
  const handlers: Record<string, () => void> = {};
  const image: BoardLayerCacheImageLike = {
    x: 8, y: 11, scaleX: 1 / 3, scaleY: 1 / 3, rotation: 0, originX: 0, originY: 0, flipX: false, flipY: false,
    alpha: 1, blendMode: 0, scrollFactorX: 1, scrollFactorY: 1,
    frame: { cutWidth: 900, cutHeight: 2000, source: { resolution: 1 } },
    renderCanvas: (r) => { phaserDraws += 1; drawnOn.push((r as typeof renderer).currentContext); },
    once: (event, listener) => { handlers[event] = listener; },
    ...over
  };
  let version = 1;
  const patched: number[] = [];
  const handle = installBoardLayerFrameCache(image, {
    readVersion: () => version,
    readResolution: () => 3,
    patchResolution: (_c, res) => { patched.push(res); },
    createCanvas: () => layerCanvas as never,
    visibilityTarget: doc
  });
  const camera = {
    alpha: 1, scrollX: 0, scrollY: 0, roundPixels: true, renderRoundPixels: true, addToRenderList: () => undefined,
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  };
  const parent = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  const frame = () => image.renderCanvas(renderer, image, camera, parent);
  return {
    image, handle, game, layer, frame, camera, parent, drawnOn, patched, handlers, doc, fire, fireVisibility, listenerCount,
    phaserDraws: () => phaserDraws,
    bump: () => { version += 1; }
  };
};

describe('resolveBoardLayerCacheEnabled', () => {
  test('on unless ?boardLayerCache is 0, off or false', () => {
    expect(resolveBoardLayerCacheEnabled('')).toBe(true);
    expect(resolveBoardLayerCacheEnabled(null)).toBe(true);
    expect(resolveBoardLayerCacheEnabled('?boardLayerCache=1')).toBe(true);
    expect(resolveBoardLayerCacheEnabled('?boardLayerCache=0')).toBe(false);
    expect(resolveBoardLayerCacheEnabled('?x=1&boardLayerCache=off')).toBe(false);
    expect(resolveBoardLayerCacheEnabled('?boardLayerCache=false')).toBe(false);
  });
});

describe('installBoardLayerFrameCache', () => {
  test('a changing picture is drawn by Phaser every frame; nothing is filled or copied', () => {
    const t = setup();
    for (let i = 0; i < 6; i += 1) {
      t.bump();
      t.frame();
    }
    expect(t.phaserDraws()).toBe(6);
    expect(t.handle.stats).toEqual({ hits: 0, fills: 0, passes: 6 });
    expect(t.game.calls).toEqual([]);
    expect(t.layer.calls).toEqual([]);
  });

  test('once the picture holds still: one fill through Phaser onto the layer, then 1:1 copies at device (0, 0)', () => {
    const t = setup();
    const frames = BOARD_LAYER_CACHE_STABLE_FRAMES + 1;
    for (let i = 0; i < frames; i += 1) t.frame(); // first frame sets the key, then STABLE_FRAMES matching frames
    expect(t.handle.stats.fills).toBe(1);
    expect(t.handle.stats.hits).toBe(1);
    // the fill drew with the layer as the renderer's context, and the game context was put back
    expect(t.drawnOn[t.drawnOn.length - 1]).toBe(t.layer);
    expect(t.patched).toEqual([3]);
    expect(t.layer.calls).toEqual(['layer:resetTransform', 'layer:clear 0,0,100,200']);
    expect(t.game.calls).toEqual(['game:save', 'game:resetTransform', 'game:drawImage 0,0', 'game:restore']);
    const drawsBefore = t.phaserDraws();
    for (let i = 0; i < 5; i += 1) t.frame();
    expect(t.phaserDraws()).toBe(drawsBefore); // Phaser's draw is skipped on a hit
    expect(t.handle.stats).toMatchObject({ fills: 1, hits: 6 });
  });

  test('every input of the draw is in the key: any change draws through Phaser again, then refills once still', () => {
    const settle = (t: ReturnType<typeof setup>) => { for (let i = 0; i < 6; i += 1) t.frame(); };
    const mutations: Array<[string, (t: ReturnType<typeof setup>) => void]> = [
      ['texture version', (t) => t.bump()],
      ['image x', (t) => { t.image.x += 1; }],
      ['image scale', (t) => { t.image.scaleX = 0.34; }],
      ['image alpha', (t) => { t.image.alpha = 0.99; }],
      ['camera alpha', (t) => { t.camera.alpha = 0.5; }],
      ['camera scroll', (t) => { t.camera.scrollY = 2; }],
      ['camera matrix', (t) => { t.camera.matrix.e = 1; }],
      ['parent (container zoom) matrix', (t) => { t.parent.a = 1.02; }],
      ['canvas width (resize)', (t) => { t.game.canvas.width += 3; }],
      ['frame size', (t) => { t.image.frame.cutWidth += 1; }]
    ];
    for (const [name, mutate] of mutations) {
      const t = setup();
      settle(t);
      const fills = t.handle.stats.fills;
      const drawsBefore = t.phaserDraws();
      mutate(t);
      t.frame();
      expect(t.phaserDraws(), `${name}: first changed frame goes through Phaser`).toBe(drawsBefore + 1);
      expect(t.handle.stats.fills, `${name}: no refill yet`).toBe(fills);
      settle(t);
      expect(t.handle.stats.fills, `${name}: refilled once it holds still`).toBe(fills + 1);
    }
  });

  test('a resized game canvas resizes the layer; a new resolution re-patches it', () => {
    const t = setup();
    for (let i = 0; i < 4; i += 1) t.frame();
    t.game.canvas.width = 120;
    t.game.canvas.height = 240;
    for (let i = 0; i < 4; i += 1) t.frame();
    expect(t.layer.canvas).toMatchObject({ width: 120, height: 240 });
    expect(t.patched.length).toBe(2); // size change re-patches (a resized canvas drops the context state)
  });

  test('not cacheable: other blend, crop, mask or zero alpha always go through Phaser and never fill', () => {
    for (const over of [{ blendMode: 1 }, { isCropped: true }, { mask: {} }, { alpha: 0 }] as Array<Partial<BoardLayerCacheImageLike>>) {
      const t = setup(over);
      for (let i = 0; i < 8; i += 1) t.frame();
      expect(t.handle.stats).toEqual({ hits: 0, fills: 0, passes: 8 });
    }
  });

  test('setEnabled(false) hands the draw back to Phaser at once; true lets it refill; uninstall frees and restores', () => {
    const t = setup();
    const own = t.image.renderCanvas;
    for (let i = 0; i < 6; i += 1) t.frame();
    expect(t.handle.stats.hits).toBeGreaterThan(0);
    const hits = t.handle.stats.hits;
    t.handle.setEnabled(false);
    const drawsBefore = t.phaserDraws();
    t.frame();
    t.frame();
    expect(t.phaserDraws()).toBe(drawsBefore + 2);
    expect(t.handle.stats.hits).toBe(hits);
    t.handle.setEnabled(true);
    for (let i = 0; i < 6; i += 1) t.frame();
    expect(t.handle.stats.hits).toBeGreaterThan(hits);
    t.handle.uninstall();
    expect(t.layer.canvas).toMatchObject({ width: 0, height: 0 });
    expect(t.image.renderCanvas).not.toBe(own);
    expect(Object.prototype.hasOwnProperty.call(t.image, 'renderCanvas')).toBe(true);
  });

  test('destroying the image frees the layer', () => {
    const t = setup();
    for (let i = 0; i < 4; i += 1) t.frame();
    t.handlers.destroy?.();
    expect(t.layer.canvas).toMatchObject({ width: 0, height: 0 });
  });

  describe('the browser dropping the layer pixels (the key cannot see it)', () => {
    const settle = (t: ReturnType<typeof setup>) => { for (let i = 0; i < 6; i += 1) t.frame(); };
    const expectOneRefill = (t: ReturnType<typeof setup>, mutateBefore?: () => void) => {
      const { fills, hits } = t.handle.stats;
      const drawsBefore = t.phaserDraws();
      mutateBefore?.();
      t.frame();
      expect(t.phaserDraws(), 'first frame after the loss goes through Phaser, never a copy of the stale layer').toBe(drawsBefore + 1);
      expect(t.handle.stats.hits).toBe(hits);
      settle(t);
      expect(t.handle.stats.fills, 'one refill once the picture holds still').toBe(fills + 1);
      expect(t.handle.stats.hits).toBeGreaterThan(hits);
    };

    test('layer canvas contextlost forces a refill', () => {
      const t = setup();
      settle(t);
      expectOneRefill(t, () => t.fire('contextlost'));
    });

    test('layer canvas contextrestored forces a refill and re-patches the resolution', () => {
      const t = setup();
      settle(t);
      const patches = t.patched.length;
      expectOneRefill(t, () => t.fire('contextrestored'));
      expect(t.patched.length).toBe(patches + 1);
    });

    test('document visibilitychange to visible forces a refill; to hidden does not', () => {
      const t = setup();
      settle(t);
      const { fills, hits } = t.handle.stats;
      t.doc.visibilityState = 'hidden';
      t.fireVisibility();
      t.frame();
      expect(t.handle.stats).toMatchObject({ fills, hits: hits + 1 }); // still a plain copy
      t.doc.visibilityState = 'visible';
      expectOneRefill(t, () => t.fireVisibility());
    });

    test('a lost context is never trusted: no valid layer while isContextLost() is true', () => {
      const t = setup();
      let lost = true;
      (t.layer as unknown as { isContextLost: () => boolean }).isContextLost = () => lost;
      settle(t);
      expect(t.handle.stats).toMatchObject({ fills: 0, hits: 0 });
      lost = false;
      settle(t);
      expect(t.handle.stats.fills).toBe(1);
    });

    test('release (destroy or uninstall) removes every listener', () => {
      for (const end of ['destroy', 'uninstall'] as const) {
        const t = setup();
        settle(t);
        expect(t.listenerCount()).toBe(3);
        if (end === 'destroy') t.handlers.destroy?.();
        else t.handle.uninstall();
        expect(t.listenerCount(), end).toBe(0);
      }
    });

    test('kill switch semantics are unchanged: disabled cache never listens or copies', () => {
      const t = setup();
      t.handle.setEnabled(false);
      for (let i = 0; i < 6; i += 1) t.frame();
      expect(t.listenerCount()).toBe(0);
      expect(t.handle.stats.hits).toBe(0);
    });
  });

  test('the key assumes the board image at origin (0, 0) with no flip; any change to either is a key change', () => {
    // The layer is copied back at device (0, 0), 1:1. That is only the same picture while the image sits at origin
    // (0, 0) unflipped (boardTileLayer.ts: setOrigin(0, 0)). A future setOrigin / setFlip must keep updating the key.
    const settle = (t: ReturnType<typeof setup>) => { for (let i = 0; i < 6; i += 1) t.frame(); };
    const t0 = setup();
    expect(t0.image).toMatchObject({ originX: 0, originY: 0, flipX: false, flipY: false });
    const mutations: Array<[string, (t: ReturnType<typeof setup>) => void]> = [
      ['originX', (t) => { t.image.originX = 0.5; }],
      ['originY', (t) => { t.image.originY = 0.5; }],
      ['flipX', (t) => { t.image.flipX = true; }],
      ['flipY', (t) => { t.image.flipY = true; }]
    ];
    for (const [name, mutate] of mutations) {
      const t = setup();
      settle(t);
      const drawsBefore = t.phaserDraws();
      mutate(t);
      t.frame();
      expect(t.phaserDraws(), `${name} change goes through Phaser`).toBe(drawsBefore + 1);
    }
    const layer = readFileSync(join(__dirname, '..', '..', 'src', 'render', 'boardTileLayer.ts'), 'utf8');
    expect(layer).toContain('.setOrigin(0, 0)');
    expect(layer).not.toContain('setFlip');
    expect(layer).not.toContain('.flipX =');
    expect(layer).not.toContain('.flipY =');
  });

  test('a long still run is one fill, then copies only', () => {
    const t = setup();
    for (let i = 0; i < 200; i += 1) t.frame();
    expect(t.handle.stats.fills).toBe(1);
    expect(t.handle.stats.hits).toBe(198);
  });
});

describe('wiring', () => {
  test('the board layer installs the cache on its own image (MenuScene is untouched) and keeps the 1:1 exact copy page-only', () => {
    const root = join(__dirname, '..', '..');
    const layer = readFileSync(join(root, 'src', 'render', 'boardTileLayer.ts'), 'utf8');
    expect(layer).toContain('installBoardLayerFrameCache(this.image');
    expect(layer).toContain('resolveBoardLayerCacheEnabled(window.location.search)');
    expect(layer).toContain('this.textureVersion += 1');
    const cache = readFileSync(join(root, 'src', 'render', 'boardLayerFrameCache.ts'), 'utf8');
    expect(cache).not.toMatch(/exactImageBlit/);
    expect(cache).not.toMatch(/from 'phaser'/);
  });
});
