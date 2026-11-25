import { describe, expect, test } from 'vitest';
import {
  installExactImageBlit,
  resolveExactImageBlit,
  type ExactBlitImageLike,
  type ExactImageBlitInput
} from '../../src/render/exactImageBlit';

const RES = 3;
const base = (over: Partial<ExactImageBlitInput> = {}): ExactImageBlitInput => ({
  a: 1 / RES, b: 0, c: 0, d: 1 / RES, tx: 10.2, ty: 20.4,
  cameraX: 0, cameraY: 0, scrollX: 0, scrollY: 0, scrollFactorX: 1, scrollFactorY: 1,
  cameraZoom: 1, cameraRotation: 0, resolution: RES, originX: 0, originY: 0,
  ...over
});

describe('resolveExactImageBlit', () => {
  test('a texture shown 1:1 lands on the nearest whole device pixel', () => {
    expect(resolveExactImageBlit(base())).toEqual({ x: 31, y: 61 });
    expect(resolveExactImageBlit(base({ scrollX: 2, scrollY: 1 }))).toEqual({ x: 25, y: 58 });
    expect(resolveExactImageBlit(base({ scrollX: 2, scrollFactorX: 0 }))).toEqual({ x: 31, y: 61 });
    // float32 matrices: a hair off 1/3 still counts.
    expect(resolveExactImageBlit(base({ a: 0.33333334, d: 0.33333334 }))).not.toBeNull();
  });

  test('anything that is not a straight 1:1 copy falls back (null)', () => {
    expect(resolveExactImageBlit(base({ a: 0.4, d: 0.4 }))).toBeNull(); // texture not at the canvas resolution (trail)
    expect(resolveExactImageBlit(base({ a: 1 / RES, d: -1 / RES }))).toBeNull(); // flipped
    expect(resolveExactImageBlit(base({ b: 0.1 }))).toBeNull(); // rotated / skewed
    expect(resolveExactImageBlit(base({ cameraZoom: 1.5 }))).toBeNull();
    expect(resolveExactImageBlit(base({ cameraRotation: 0.2 }))).toBeNull();
    expect(resolveExactImageBlit(base({ originX: 0.5 }))).toBeNull();
    expect(resolveExactImageBlit(base({ resolution: 0 }))).toBeNull();
    expect(resolveExactImageBlit(base({ resolution: Number.NaN }))).toBeNull();
    expect(resolveExactImageBlit(base({ tx: Number.POSITIVE_INFINITY }))).toBeNull();
  });
});

describe('installExactImageBlit', () => {
  const makeCtx = () => {
    const calls: string[] = [];
    const ctx = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      resetTransform: () => calls.push('resetTransform'),
      setTransform: () => calls.push('setTransform'),
      drawImage: (_img: unknown, x: number, y: number) => calls.push(`drawImage ${x},${y}`)
    };
    return { ctx, calls };
  };
  const makeImage = (matrix: { a: number; d: number }) => {
    const source = { id: 'board-texture' };
    let originalCalls = 0;
    const image = {
      alpha: 0.5, blendMode: 0, scrollFactorX: 1, scrollFactorY: 1, originX: 0, originY: 0,
      texture: { getSourceImage: () => source },
      getWorldTransformMatrix: () => ({ a: matrix.a, b: 0, c: 0, d: matrix.d, tx: 4, ty: 5 }),
      renderCanvas: () => { originalCalls += 1; }
    } satisfies ExactBlitImageLike;
    return { image: image as ExactBlitImageLike, originalCalls: () => originalCalls };
  };
  const camera = { x: 0, y: 0, scrollX: 0, scrollY: 0, zoom: 1, rotation: 0, alpha: 0.8, rendered: 0, addToRenderList() { this.rendered += 1; } };

  test('1:1: one copy at a whole device pixel with resetTransform, never Phaser\'s draw', () => {
    const { ctx, calls } = makeCtx();
    const { image, originalCalls } = makeImage({ a: 1 / RES, d: 1 / RES });
    const installed = installExactImageBlit(image, () => RES, () => ({}));
    image.renderCanvas({ currentContext: ctx, blendModes: ['source-over'] }, image, camera);
    expect(calls).toEqual(['save', 'resetTransform', 'drawImage 12,15', 'restore']);
    expect(ctx.globalAlpha).toBeCloseTo(0.4);
    expect(originalCalls()).toBe(0);
    expect(installed.stats).toEqual({ exact: 1, fallback: 0 });
  });

  test('not 1:1: Phaser\'s own draw runs and nothing is copied; uninstall restores the prototype draw', () => {
    const { ctx, calls } = makeCtx();
    const { image, originalCalls } = makeImage({ a: 0.4, d: 0.4 });
    const proto = { renderCanvas: image.renderCanvas };
    const onProto = Object.assign(Object.create(proto), { ...image }) as ExactBlitImageLike;
    delete (onProto as Partial<ExactBlitImageLike>).renderCanvas;
    const installed = installExactImageBlit(onProto, () => RES, () => ({}));
    expect(Object.prototype.hasOwnProperty.call(onProto, 'renderCanvas')).toBe(true);
    onProto.renderCanvas({ currentContext: ctx, blendModes: ['source-over'] }, onProto, camera);
    expect(calls).toEqual([]);
    expect(originalCalls()).toBe(1);
    expect(installed.stats).toEqual({ exact: 0, fallback: 1 });
    installed.uninstall();
    expect(Object.prototype.hasOwnProperty.call(onProto, 'renderCanvas')).toBe(false);
    expect(onProto.renderCanvas).toBe(proto.renderCanvas);
  });

  test('uninstall puts back an own renderCanvas', () => {
    const { image } = makeImage({ a: 1 / RES, d: 1 / RES });
    const original = image.renderCanvas;
    installExactImageBlit(image, () => RES, () => ({})).uninstall();
    expect(image.renderCanvas).toBe(original);
  });
});
