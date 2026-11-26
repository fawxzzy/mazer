import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createRecordingCanvas, installRecordingDocument, type RecordingCanvas } from './support/recordingCanvas';
import {
  MAZER_TRAIL_BACKING_MAX_PIXELS,
  MAZER_TRAIL_BACKING_MIN_RESOLUTION,
  resolveCappedBackingResolution
} from '../../src/render/canvasBackingBudget';
import { resolveBoardWallFillRect } from '../../src/render/boardWallFill';
import {
  shouldRebuildTrail,
  type TrailDrawRecord,
  type TrailDrawStamp
} from '../../src/render/trailRedrawGate';
import { resolveTrailColourRedrawIntervalMs, stepTrailColourRedraw } from '../../src/render/trailColourRedraw';
import { sampleIridescentTrail } from '../../src/render/trailPalette';
import { BackdropStarShapeList, fillBackdropStarShapeList } from '../../src/render/backdropStarShapes';
import { createLegacyMenuBackdropStars, LEGACY_MENU_STAR_COUNT } from '../../src/legacy-runtime/legacyMenuBackdrop';
import type { TrailLayerSegment, TrailLayersOptions } from '../../src/render/trailLayersCanvas';
import type { StarDustDrawOptions, StarDustSegment } from '../../src/render/starDustTrailCanvas';

vi.mock('phaser', () => ({ default: { Renderer: { Canvas: { SetTransform: () => true } } } }));

/*
 * MAZER-PERF-016 phase 1: the frame-budget guard.
 *
 * WHAT IT MEASURES. Smoothness regressions in this game have come from the same few places: the trail canvas rebuild
 * (strokes, blur, canvas size), the backdrop star field (draw calls per frame), the board wall fill (one rect or
 * thousands), and how OFTEN those are redone (the rebuild cadence). Wall-clock time is the real measure but it is far too
 * noisy for CI (identical runs differ by 3x on a busy runner), so this file pins what the time is made of, in units that
 * are identical on every machine:
 *   1. canvas operation counts for one trail rebuild (neon tube and star dust) on a long route at 3x, recorded through a
 *      stand-in 2D context (tests/architecture/support/recordingCanvas.ts);
 *   2. canvas operation counts for one star-field frame, and allocation stability of the star list;
 *   3. the rebuild cadence (rebuilds per second at 60 and 120 Hz, gliding or idle, cheap or slow) from the real gate
 *      functions, simulated on a fake clock;
 *   4. the trail canvas's backing-store pixel budget on the phone profiles we support.
 *
 * THE BUDGETS carry about 25 percent margin over today's measured value (the measured value is in each comment). A budget
 * that fails is not necessarily a bug: it says "this change made a frame do more work". Either find the cheaper way, or
 * raise the budget in the same PR with the number it now costs and a sentence on why the picture needs it. That is the
 * ratchet. Budgets are never raised to make a red build green without that sentence (docs/playbook-notes/
 * 2026-11-23-mazer-perf-016-frame-budget-guard.md).
 *
 * WHAT IT DOES NOT MEASURE: real frame time on a phone (use scripts/analysis/profile-level-frame-cost.mjs under throttle,
 * and a phone), GPU compositing, JS bundle size (tests/architecture/boot-payload-budget.test.ts owns that).
 */

const tile = 14;
const columns = 12;
const rows = 50;

/** A deterministic serpentine route across a 12 x 50 board, four resampled points per tile (a long level-300 style route). */
const buildRoute = (): Array<{ x: number; y: number; distance: number }> => {
  const points: Array<{ x: number; y: number; distance: number }> = [];
  let distance = 0;
  const push = (x: number, y: number): void => {
    const last = points[points.length - 1];
    if (last) {
      distance += Math.hypot(x - last.x, y - last.y);
    }
    points.push({ x, y, distance });
  };
  for (let row = 0; row < rows; row += 2) {
    const leftToRight = (row / 2) % 2 === 0;
    for (let i = 0; i < columns; i += 1) {
      const c = leftToRight ? i : columns - 1 - i;
      for (let s = 0; s < 4; s += 1) {
        push((c + 0.5 + (leftToRight ? s / 4 : -s / 4)) * tile, (row + 0.5) * tile);
      }
    }
    push(((leftToRight ? columns - 1 : 0) + 0.5) * tile, (row + 1.5) * tile);
  }
  return points;
};

const buildSegments = (): TrailLayerSegment[] & StarDustSegment[] => {
  const route = buildRoute();
  const segments: TrailLayerSegment[] = [];
  for (let i = 1; i < route.length; i += 1) {
    const mid = (route[i - 1]!.distance + route[i]!.distance) / 2;
    const sample = sampleIridescentTrail(mid / tile, 1000, false);
    segments.push({
      previous: route[i - 1]!,
      current: route[i]!,
      glowColor: sample.glow,
      coreColor: sample.core,
      alpha: 0.9,
      underlayAlpha: 1
    });
  }
  return segments as TrailLayerSegment[] & StarDustSegment[];
};

const RESOLUTION = 3;
const GLOW_BLUR_PX = 12 * RESOLUTION;
const targetCanvas = (): RecordingCanvas => createRecordingCanvas(columns * tile * RESOLUTION, (rows + 2) * tile * RESOLUTION, RESOLUTION);

let uninstall: (() => void) | null = null;
afterEach(() => {
  uninstall?.();
  uninstall = null;
  vi.resetModules();
});

/** Fresh module copy (the trail bloom keeps one scratch canvas per module) with a recording `document`. */
const freshDocument = (): { created: RecordingCanvas[] } => {
  vi.resetModules();
  const installed = installRecordingDocument();
  uninstall = installed.uninstall;
  return installed;
};

describe('trail rebuild: canvas work per rebuild (long route, 3x phone)', () => {
  const options: TrailLayersOptions = {
    originX: 0,
    originY: 0,
    coreWidth: 5,
    glowWidth: 12,
    underlayWidth: 7,
    glowAlphaRatio: 0.5,
    glowBlurPx: GLOW_BLUR_PX,
    underlayColor: 0x12101f,
    underlayAlpha: 0.5
  };

  test('neon tube: bounded strokes, blur on a downscaled scratch canvas, one clipped upscale', async () => {
    const doc = freshDocument();
    const { drawTrailLayersToCanvasContext } = await import('../../src/render/trailLayersCanvas');
    const { chunkTrailSegments } = await import('../../src/render/navigationCoreTrailCanvas');
    const segments = buildSegments();
    const chunks = chunkTrailSegments(segments).length;
    const target = targetCanvas();
    drawTrailLayersToCanvasContext(target.ctx, segments, options);

    // Measured today: 1224 segments, 1207 chunks. Main canvas: 1208 strokes (core per chunk + one underlay), 1 drawImage
    // (the bloom upscale), 0 shadowBlur writes. Scratch canvas: 1207 bloom strokes, blur 9 px, 1/16 of the target's pixels.
    expect(chunks).toBeGreaterThan(0);
    expect(chunks).toBeLessThanOrEqual(segments.length);
    expect(doc.created).toHaveLength(1);
    const scratch = doc.created[0]!;

    // One stroke per chunk per layer: bloom (scratch) + underlay (one colour) + core. A fourth per-chunk layer fails here.
    const underlayStrokes = 8;
    expect(target.count('stroke')).toBeLessThanOrEqual(chunks + underlayStrokes);
    expect(scratch.count('stroke')).toBeLessThanOrEqual(chunks);
    expect(target.count('stroke') + scratch.count('stroke')).toBeLessThanOrEqual((2 * chunks) + underlayStrokes);
    // Path vertices: each segment is submitted at most once per layer plus the chunk's moveTo (bloom, underlay, core).
    expect(target.stats.vertices + scratch.stats.vertices).toBeLessThanOrEqual((3 * segments.length) + (3 * chunks) + 16);
    // The full-size canvas never blurs in place and is composited onto once by the bloom.
    expect(target.stats.maxShadowBlur).toBe(0);
    expect(target.count('shadowBlur')).toBe(0);
    expect(target.count('drawImage')).toBe(1);
    expect(target.count('fill')).toBe(0);
    // The blur runs on a scratch canvas of at most 1/9 of the target's pixels (today 1/16), at most a third of the radius.
    expect(scratch.stats.maxShadowBlur).toBeLessThanOrEqual(GLOW_BLUR_PX / 3);
    expect(scratch.stats.touchedPixels).toBeLessThanOrEqual((target.canvas.width * target.canvas.height) / 9);
    // The scratch is cleared once per rebuild, the target is not cleared by the drawing function at all.
    expect(scratch.count('clearRect')).toBe(1);
    expect(target.count('clearRect')).toBe(0);
    // The upscale is clipped to where bloom can have pixels (never an unclipped whole-canvas blit when the route is sparse).
    expect(target.count('clip')).toBeLessThanOrEqual(1);
    // Balanced state stack (a leaked save() compounds every frame).
    expect(target.count('save')).toBe(target.count('restore'));
  });

  test('neon tube: no document means an in-place blur, still one stroke per chunk per layer', async () => {
    vi.resetModules();
    const { drawTrailLayersToCanvasContext } = await import('../../src/render/trailLayersCanvas');
    const { chunkTrailSegments } = await import('../../src/render/navigationCoreTrailCanvas');
    const segments = buildSegments();
    const chunks = chunkTrailSegments(segments).length;
    const target = targetCanvas();
    drawTrailLayersToCanvasContext(target.ctx, segments, options);
    // Measured today: 2415 strokes = bloom 1207 + underlay 1 + core 1207; blur set once, colour per chunk.
    expect(target.count('stroke')).toBeLessThanOrEqual((2 * chunks) + 8);
    expect(target.count('shadowBlur')).toBeLessThanOrEqual(4);
    expect(target.stats.maxShadowBlur).toBeLessThanOrEqual(GLOW_BLUR_PX);
    expect(target.count('drawImage')).toBe(0);
  });

  test('star dust: bounded strokes and fills, keylines in one path', async () => {
    const doc = freshDocument();
    const { drawStarDustTrailFullToCanvasContext } = await import('../../src/render/starDustTrailCanvas');
    const { chunkTrailSegments } = await import('../../src/render/navigationCoreTrailCanvas');
    const segments = buildSegments();
    const chunks = chunkTrailSegments(segments).length;
    const target = targetCanvas();
    const dust: StarDustDrawOptions = {
      originX: 0,
      originY: 0,
      tileSize: tile,
      coreWidth: 5,
      glowWidth: 12,
      glowAlphaRatio: 0.5,
      glowBlurPx: GLOW_BLUR_PX,
      keylineColor: 0xffffff,
      keylineAlpha: 1,
      timeMs: 1000,
      animated: true,
      originAdvancePx: 0
    };
    const sparkles = drawStarDustTrailFullToCanvasContext(target.ctx, segments, dust);
    const scratch = doc.created[0];
    const strokes = target.count('stroke') + (scratch?.count('stroke') ?? 0);
    const fills = target.count('fill');
    // Strokes: bloom per chunk + thread per chunk + ONE keyline stroke for every sparkle. Fills: one per sparkle.
    expect(strokes).toBeLessThanOrEqual((2 * chunks) + 8);
    expect(fills).toBe(sparkles);
    expect(target.count('shadowBlur')).toBe(0);
    expect(target.count('drawImage')).toBeLessThanOrEqual(1);
    // Sparkle count is bounded by the route length, not by how many frames have run (see STAR_DUST_TRAIL).
    expect(sparkles).toBeLessThanOrEqual(segments.length);
    expect(target.count('save')).toBe(target.count('restore'));
  });

  test('star dust, cached painter (withdrawn from the game 2026-11-25, still on the trail-cost options page): a walking frame repaints only the head', async () => {
    const doc = freshDocument();
    const { createStarDustTrailCache, STAR_DUST_TRAIL_CACHE } = await import('../../src/render/starDustTrailCache');
    const segments = buildSegments();
    const dust: StarDustDrawOptions = {
      originX: 0, originY: 0, tileSize: tile, coreWidth: 5, glowWidth: 12, glowAlphaRatio: 0.5, glowBlurPx: GLOW_BLUR_PX,
      keylineColor: 0xffffff, keylineAlpha: 1, timeMs: 1000, animated: true, originAdvancePx: 0
    };
    const cache = createStarDustTrailCache();
    cache(targetCanvas().ctx, segments, dust); // builds the cached layer
    const offscreenStrokes = (): number => doc.created.reduce((sum, c) => sum + c.count('stroke'), 0);
    const strokesBefore = offscreenStrokes();
    const createdBefore = doc.created.length;
    const frame = targetCanvas();
    const sparkles = cache(frame.ctx, segments, { ...dust, timeMs: 1100 });
    expect(cache.stats).toMatchObject({ bodyRebuilds: 1, headPaints: 2 });
    // The walking frame makes no canvas; its blurred strokes go to the (reused) downscaled bloom scratch.
    expect(doc.created.length).toBe(createdBefore);
    const scratchStrokes = offscreenStrokes() - strokesBefore;
    // Measured: 8-16 tiles of head = 25-50 live sparkles; coarse bloom + thread one piece per tile (~16 + 16 strokes) +
    // one keyline stroke; fills = live sparkles + the cached ones under the head's glow (~10). A full paint at this
    // length is ~2,400 strokes and ~450 fills (the test above).
    const maxHeadTiles = STAR_DUST_TRAIL_CACHE.headTiles + STAR_DUST_TRAIL_CACHE.rebuildAfterTiles;
    expect(sparkles).toBeLessThanOrEqual(Math.ceil(maxHeadTiles / 0.34) + 2);
    expect(frame.count('stroke') + scratchStrokes).toBeLessThanOrEqual((2 * (maxHeadTiles + 2)) + 4);
    expect(frame.count('fill')).toBeLessThanOrEqual(sparkles + 40);
    // One blit of the cached layer at a whole device pixel (no resampling) plus the head bloom's upscale.
    expect(frame.count('drawImage')).toBeLessThanOrEqual(2);
    expect(createdBefore).toBeLessThanOrEqual(3); // cached layer + the two bloom scratches (full and coarse)
    expect(frame.count('save')).toBe(frame.count('restore'));
  });
});

describe('star field: canvas work per frame', () => {
  const makeAtlasCanvas = (): RecordingCanvas => createRecordingCanvas(0, 0);

  test('one drawImage per visible star, no per-star path, state or transform work', async () => {
    vi.resetModules();
    const { bakeBackdropStarAtlas, paintBackdropStarShapeList } = await import('../../src/render/backdropStarSprites');
    const atlasCanvas = makeAtlasCanvas();
    const atlas = bakeBackdropStarAtlas(() => atlasCanvas.canvas as never);
    expect(atlas).not.toBeNull();

    let seed = 7;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const stars = createLegacyMenuBackdropStars(random);
    expect(stars).toHaveLength(LEGACY_MENU_STAR_COUNT);
    const list = new BackdropStarShapeList();
    fillBackdropStarShapeList(list, stars, 393, 852, 5000, true, 1);

    const frame = createRecordingCanvas(393 * 3, 852 * 3, 3);
    paintBackdropStarShapeList(frame.ctx as never, list, atlas!);

    // Measured today (240 stars, 393x852 at 3x): one drawImage per listed star, one resetTransform, no path calls.
    expect(list.count).toBeGreaterThan(0);
    expect(list.count).toBeLessThanOrEqual(LEGACY_MENU_STAR_COUNT);
    expect(frame.count('drawImage')).toBe(list.count);
    expect(frame.count('resetTransform')).toBeLessThanOrEqual(1);
    for (const name of ['beginPath', 'arc', 'fill', 'stroke', 'save', 'restore', 'fillRect', 'clearRect', 'clip']) {
      expect(frame.count(name), name).toBe(0);
    }
    // globalAlpha is written once per star and once to restore; never shadowBlur or style strings.
    expect(frame.stats.writes.globalAlpha ?? 0).toBeLessThanOrEqual(list.count + 1);
    expect(frame.stats.writes.shadowBlur ?? 0).toBe(0);
    expect(frame.stats.writes.fillStyle ?? 0).toBe(0);
    // Sprites are small: a star blit averages about 190 device px today (13 x 13) (the blit area is the star field's fill cost).
    expect(frame.stats.touchedPixels / Math.max(1, list.count)).toBeLessThanOrEqual(240);
  });

  test('the atlas is baked once: the sprite sheet stays one small canvas', async () => {
    vi.resetModules();
    const { bakeBackdropStarAtlas, resolveBackdropStarAtlasLayout } = await import('../../src/render/backdropStarSprites');
    const layout = resolveBackdropStarAtlasLayout();
    expect(layout.width * layout.height).toBeLessThanOrEqual(1024 * 1024);
    const canvas = createRecordingCanvas(0, 0);
    bakeBackdropStarAtlas(() => canvas.canvas as never);
    const bakeCalls = canvas.stats.calls;
    // Measured today: 768 glyph fills + 600 fillRects (1368). Baked once at boot, never per frame; this pins the bake's size so it cannot quietly grow into a per-frame cost.
    expect((bakeCalls.fill ?? 0) + (bakeCalls.fillRect ?? 0)).toBeLessThanOrEqual(1700);
  });

  test('the star list reuses its storage frame to frame (no per-frame allocation)', () => {
    const stars = createLegacyMenuBackdropStars(() => 0.5);
    const list = new BackdropStarShapeList();
    fillBackdropStarShapeList(list, stars, 393, 852, 0, true, 1);
    const storage = list.view().data;
    const countAtStart = list.count;
    for (let frame = 1; frame <= 120; frame += 1) {
      fillBackdropStarShapeList(list, stars, 393, 852, frame * 16.7, true, 1);
      expect(list.view().data).toBe(storage);
    }
    expect(list.count).toBeGreaterThan(0);
    expect(countAtStart).toBeGreaterThan(0);
    // 240 stars fit the initial storage with room to spare, so the list never grows at the shipped star count.
    expect(storage.length).toBeGreaterThanOrEqual(LEGACY_MENU_STAR_COUNT * list.view().stride);
  });
});

describe('board wall fill: one rect, not one per cell', () => {
  test('a 25 x 55 board at its shipped tile sizes resolves to a single rect', () => {
    for (const tileSize of [8, 12, 14.5, 17]) {
      const rect = resolveBoardWallFillRect(20.4, 100.6, tileSize, 25, 55);
      expect(rect).not.toBeNull();
      expect(rect!.width).toBeGreaterThan(0);
      expect(rect!.height).toBeGreaterThan(0);
    }
    // Below one pixel per cell the single rect is not valid: only then may the per-cell loop run.
    expect(resolveBoardWallFillRect(0, 0, 0.5, 25, 55)).toBeNull();
  });

  test('drawStaticBoard keeps taking the single-rect path (source ratchet)', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(source).toContain('resolveBoardWallFillRect(');
  });
});

describe('trail rebuild cadence: rebuilds per second from the real gate', () => {
  const stamp = (overrides: Partial<TrailDrawStamp> = {}): TrailDrawStamp => ({
    routeRevision: 1,
    previousTileKey: '3,4',
    headX: 3.5,
    headY: 4.5,
    originX: 10,
    originY: 20,
    tileSize: 14,
    alphaMultiplier: 1,
    styleKey: 'a',
    ...overrides
  });

  /**
   * Simulate `seconds` of frames at `hz` on a fake clock. `moveHead` makes the head move every frame (a glide).
   * `costMs` is what each rebuild costs (it feeds the next gap). Returns the number of rebuilds.
   */
  const simulate = (hz: number, seconds: number, options: { moveHead: boolean; costMs: number; timeDriven: boolean }): number => {
    let record: TrailDrawRecord | null = null;
    let rebuilds = 0;
    const frameMs = 1000 / hz;
    const frames = Math.round(hz * seconds);
    for (let frame = 0; frame < frames; frame += 1) {
      const now = frame * frameMs;
      const next = stamp(options.moveHead ? { headX: 3.5 + (frame * 0.01) } : {});
      if (shouldRebuildTrail(record, next, now, options.timeDriven)) {
        rebuilds += 1;
        record = { stamp: next, drawnAtMs: now, totalLength: 100, costMs: options.costMs };
      }
    }
    return rebuilds;
  };

  test.each([60, 90, 120, 144])('colour drift while idle rebuilds at most about 30 times a second at %i Hz', (hz) => {
    // Measured today: 30 a second at 60 and 120 Hz (the 33 ms floor).
    const perSecond = simulate(hz, 4, { moveHead: false, costMs: 5, timeDriven: true }) / 4;
    expect(perSecond).toBeLessThanOrEqual(31) // literal on purpose: the 33 ms floor is the budget, not the constant;
    expect(perSecond).toBeGreaterThanOrEqual(10);
  });

  test.each([60, 120, 144])('a glide (head moves every frame) is capped at the same rate at %i Hz', (hz) => {
    const perSecond = simulate(hz, 4, { moveHead: true, costMs: 5, timeDriven: true }) / 4;
    expect(perSecond).toBeLessThanOrEqual(31);
  });

  test('a slow rebuild backs the cadence off (the trail never takes more than about half the main thread)', () => {
    for (const costMs of [20, 40, 80, 200, 400]) {
      const perSecond = simulate(60, 6, { moveHead: false, costMs, timeDriven: true }) / 6;
      // Gap is two rebuild costs (capped at 250 ms): busy share = cost / gap <= 1/2 once the gap is above the floor.
      const gap = Math.min(250, Math.max(33, costMs * 2));
      expect(perSecond, `cost ${costMs} ms`).toBeLessThanOrEqual((1000 / gap) + 1);
    }
  });

  test('a static trail (no colour drift, no change) never rebuilds after the first draw', () => {
    expect(simulate(120, 5, { moveHead: false, costMs: 5, timeDriven: false })).toBe(1);
  });

  test('a real change (route, style, fade) still rebuilds at once, never a stale route', () => {
    const base = stamp();
    const record: TrailDrawRecord = { stamp: base, drawnAtMs: 1000, totalLength: 100, costMs: 5 };
    for (const change of [{ routeRevision: 2 }, { previousTileKey: '9,9' }, { styleKey: 'b' }, { alphaMultiplier: 0.5 }, { tileSize: 15 }]) {
      expect(shouldRebuildTrail(record, stamp(change), 1001, true)).toBe(true);
    }
  });

  test.each([60, 120])('the colour clock redraws at its interval at %i Hz, full and reduced motion', (hz) => {
    for (const reduced of [false, true]) {
      const intervalMs = resolveTrailColourRedrawIntervalMs(reduced);
      let nextDue = 0;
      let redraws = 0;
      const frames = hz * 4;
      for (let frame = 0; frame < frames; frame += 1) {
        const step = stepTrailColourRedraw(frame * (1000 / hz), nextDue, reduced);
        nextDue = step.nextDueAtMs;
        if (step.due) {
          redraws += 1;
        }
      }
      expect(redraws / 4, `reduced ${String(reduced)}`).toBeLessThanOrEqual(reduced ? 23 : 31); // literal budgets: 33 ms and 45 ms intervals, today 30 and 22 a second
      expect(intervalMs).toBeGreaterThanOrEqual(reduced ? 45 : 33);
    }
    // The nominal rates: full motion about 30 Hz, reduced about 22 Hz (reduced is never the busier one).
    expect(resolveTrailColourRedrawIntervalMs(true)).toBeGreaterThanOrEqual(resolveTrailColourRedrawIntervalMs(false));
  });
});

describe('trail backing store (MAZER-PERF-006)', () => {
  /** Device profiles: css viewport and device pixel ratio. */
  const profiles = [
    { name: 'iPhone 16 (3x)', width: 393, height: 852, dpr: 3 },
    { name: 'iPhone 16 Pro Max (3x)', width: 440, height: 956, dpr: 3 },
    { name: 'Android flagship (3x)', width: 412, height: 915, dpr: 3 },
    { name: 'Pixel (2.625x)', width: 412, height: 915, dpr: 2.625 },
    { name: 'iPhone SE (2x)', width: 375, height: 667, dpr: 2 },
    { name: 'iPad (2x)', width: 820, height: 1180, dpr: 2 },
    { name: 'desktop (1x)', width: 1280, height: 800, dpr: 1 },
    { name: 'desktop hidpi (2x)', width: 1440, height: 900, dpr: 2 }
  ];

  test('the budget constants are pinned (changing them is a deliberate edit with a reason)', () => {
    expect(MAZER_TRAIL_BACKING_MAX_PIXELS).toBe(1_600_000);
    expect(MAZER_TRAIL_BACKING_MIN_RESOLUTION).toBe(2);
  });

  test.each(profiles)('$name: the trail canvas stays inside the pixel budget or the 2x floor, and never gets blurrier than 2x', (profile) => {
    // Worst case: a route that spans the whole viewport (the trail canvas is the route's bounding box plus padding).
    const area = profile.width * profile.height;
    const resolution = resolveCappedBackingResolution(profile.width, profile.height, profile.dpr);
    expect(resolution).toBeLessThanOrEqual(profile.dpr);
    expect(resolution).toBeGreaterThanOrEqual(Math.min(profile.dpr, MAZER_TRAIL_BACKING_MIN_RESOLUTION));
    const pixels = area * resolution * resolution;
    const floorPixels = area * Math.min(profile.dpr, MAZER_TRAIL_BACKING_MIN_RESOLUTION) ** 2;
    expect(pixels).toBeLessThanOrEqual(Math.max(MAZER_TRAIL_BACKING_MAX_PIXELS, floorPixels) * 1.0001);
  });

  test('1x and 2x devices are never reduced, whatever the canvas size', () => {
    for (const dpr of [1, 1.5, 2]) {
      for (const [w, h] of [[100, 100], [393, 852], [820, 1180], [1920, 1080]] as const) {
        expect(resolveCappedBackingResolution(w, h, dpr)).toBe(dpr);
      }
    }
  });

  test('small canvases (short routes) keep the full 3x', () => {
    expect(resolveCappedBackingResolution(120, 160, 3)).toBe(3);
    // 400 x 400 css at 3x is 1.44 M pixels: under the budget.
    expect(resolveCappedBackingResolution(400, 400, 3)).toBe(3);
  });

  test('a level-300 route on an iPhone 16 (306 x 809 css, 2.23 M px at 3x) drops to about 2.5x and fits the budget', () => {
    const resolution = resolveCappedBackingResolution(306, 809, 3);
    expect(resolution).toBeGreaterThanOrEqual(2.5);
    expect(resolution).toBeLessThan(3);
    expect(306 * 809 * resolution * resolution).toBeLessThanOrEqual(MAZER_TRAIL_BACKING_MAX_PIXELS);
  });

  test('the whole viewport at 3x floors at 2x instead of going softer', () => {
    // 393 x 852 css at 3x is 3.0 M px; the budget alone would give 2.18x, which is above the floor.
    const resolution = resolveCappedBackingResolution(393, 852, 3);
    expect(resolution).toBeGreaterThanOrEqual(2);
    expect(resolution).toBeLessThanOrEqual(2.2);
    // A pathological canvas cannot push below 2x.
    expect(resolveCappedBackingResolution(2000, 2000, 3)).toBe(2);
  });

  test('never exceeds the request and ignores bad input safely', () => {
    expect(resolveCappedBackingResolution(100, 100, 1.5)).toBe(1.5);
    expect(resolveCappedBackingResolution(100, 100, 0)).toBe(1);
    expect(resolveCappedBackingResolution(100, 100, Number.NaN)).toBe(1);
    expect(resolveCappedBackingResolution(0, 100, 3)).toBe(3);
    expect(resolveCappedBackingResolution(Number.NaN, 100, 3)).toBe(3);
    // Deterministic sweep: the result is always within [min(request, 2), request] and a pure function of its inputs.
    for (let w = 40; w <= 1000; w += 80) {
      for (let h = 40; h <= 2400; h += 160) {
        for (const request of [1, 2, 2.625, 3, 6]) {
          const r = resolveCappedBackingResolution(w, h, request);
          expect(r).toBeLessThanOrEqual(request);
          expect(r).toBeGreaterThanOrEqual(Math.min(request, 2));
          expect(resolveCappedBackingResolution(w, h, request)).toBe(r);
        }
      }
    }
  });

  test('the scene routes the trail canvas resolution through the cap, and only the trail canvas (source ratchet)', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    const uses = source.split('resolveCappedBackingResolution(').length - 1;
    expect(uses).toBe(1);
    const at = source.indexOf('resolveCappedBackingResolution(');
    const before = source.slice(Math.max(0, at - 600), at);
    expect(before).toMatch(/const resolution = $/m);
    // The cap hooks the trail canvas's own resolution; the board size, tile size and hit-testing never read it.
    expect(source).not.toMatch(/resolveCappedBackingResolution\([^)]*(tileSize|hitTest|pointer)/);
  });
});
