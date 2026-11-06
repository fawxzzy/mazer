import { deflateSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { composeContactSheet, decodePng, encodePng, resizeBox } from '../../scripts/visual/lib/png-codec.mjs';
import {
  DEFAULT_ANALYSIS_OPTIONS,
  analyzeFeatures,
  computeLitMask,
  computeTiming,
  detectFlicker,
  detectIslands,
  detectPartialBleed,
  detectResidual,
  detectStalls,
  dilateMask,
  extractFrameFeatures,
  formatReport,
  labelComponents,
  resolveDockFootprints,
  selectBaselineIndex
} from '../../scripts/visual/analyze-maze-lifecycle.mjs';
import {
  createProgressionState,
  directionForStep,
  expectedProgressionLabel,
  parseViewport,
  resolveOptions
} from '../../scripts/visual/capture-maze-lifecycle.mjs';

const W = 96;
const H = 96;
const TILE = 8;
const PATH = [220, 239, 236];
const BG = [2, 5, 9];

const makeImage = (width = W, height = H) => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = BG[0]; data[i * 4 + 1] = BG[1]; data[i * 4 + 2] = BG[2]; data[i * 4 + 3] = 255;
  }
  return { width, height, data };
};

const fillRect = (image, x0, y0, w, h, color = PATH) => {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const p = (y * image.width + x) * 4;
      image.data[p] = color[0]; image.data[p + 1] = color[1]; image.data[p + 2] = color[2];
    }
  }
  return image;
};

/** Build a synthetic frame list + features from drawing callbacks. */
const sequence = (entries, { docks = [] } = {}) => {
  const frames = [];
  const features = [];
  let previousMask = null;
  entries.forEach(({ phase, draw }, index) => {
    const image = makeImage();
    draw?.(image);
    const feature = extractFrameFeatures(image, { docks, previousMask });
    previousMask = feature.mask;
    const { mask, ...rest } = feature;
    frames.push({ index, phase, simMs: index * 32 });
    features.push(rest);
  });
  return { frames, features };
};

describe('png-codec', () => {
  test('round-trips RGBA through encode/decode', () => {
    const image = fillRect(makeImage(5, 3), 1, 1, 2, 1, [10, 200, 30]);
    const decoded = decodePng(encodePng(image));
    expect(decoded.width).toBe(5);
    expect(decoded.height).toBe(3);
    expect(Array.from(decoded.data)).toEqual(Array.from(image.data));
  });

  test('decodes Sub/Up/Average/Paeth filtered RGB rows', () => {
    const width = 3;
    const rows = [[10, 20, 30, 40, 50, 60, 70, 80, 90], [1, 2, 3, 4, 5, 6, 7, 8, 9], [5, 5, 5, 6, 6, 6, 7, 7, 7], [9, 8, 7, 6, 5, 4, 3, 2, 1]];
    const stride = width * 3;
    const raw = Buffer.alloc((stride + 1) * rows.length);
    // Build the filtered stream from the known pixel rows.
    const pixel = (y, x) => (x < 0 || y < 0 ? 0 : rows[y][x]);
    const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c); };
    rows.forEach((row, y) => {
      const filter = y + 1; // 1 Sub, 2 Up, 3 Average, 4 Paeth
      raw[y * (stride + 1)] = filter;
      for (let x = 0; x < stride; x += 1) {
        const left = pixel(y, x - 3); const up = pixel(y - 1, x); const upLeft = pixel(y - 1, x - 3);
        const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
        raw[y * (stride + 1) + 1 + x] = (row[x] - predictor) & 0xff;
      }
    });
    const encoded = encodePng({ width: 1, height: 1, data: new Uint8Array(4) });
    // Re-use the signature + IHDR from a valid PNG, swap in colour type 2 and our IDAT.
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); return c >>> 0; });
    const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(body)); return Buffer.concat([len, body, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(rows.length, 4); ihdr[8] = 8; ihdr[9] = 2;
    const png = Buffer.concat([encoded.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
    const decoded = decodePng(png);
    rows.forEach((row, y) => {
      for (let x = 0; x < width; x += 1) {
        const p = (y * width + x) * 4;
        expect([decoded.data[p], decoded.data[p + 1], decoded.data[p + 2], decoded.data[p + 3]]).toEqual([row[x * 3], row[x * 3 + 1], row[x * 3 + 2], 255]);
      }
    });
  });

  test('rejects non-PNG bytes and builds a contact sheet', () => {
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow(/not a PNG/);
    const a = resizeBox(fillRect(makeImage(), 0, 0, 96, 96), 24, 24);
    const sheet = composeContactSheet([a, a, a], { columns: 2, gutter: 2 });
    expect(sheet.width).toBe(2 * (24 + 2) + 2);
    expect(sheet.height).toBe(2 * (24 + 2) + 2);
  });
});

describe('lit mask and components', () => {
  test('lit mask keeps neutral/mint path pixels and drops saturated sparkles and dark rims', () => {
    const image = makeImage(8, 1);
    fillRect(image, 0, 0, 1, 1, PATH);
    fillRect(image, 1, 0, 1, 1, [40, 90, 255]); // blue star
    fillRect(image, 2, 0, 1, 1, [59, 102, 99]); // dark rim
    fillRect(image, 3, 0, 1, 1, [164, 190, 180]); // dock stub grey
    expect(Array.from(computeLitMask(image)).slice(0, 4)).toEqual([1, 0, 0, 1]);
  });

  test('labelComponents finds 4-connected blobs and bridging merges small gaps', () => {
    const image = makeImage();
    fillRect(image, 10, 10, 8, 8);
    fillRect(image, 20, 10, 8, 8); // 2px gap from the first
    fillRect(image, 60, 60, 8, 8);
    const mask = computeLitMask(image);
    expect(labelComponents(mask, W, H, 1)).toHaveLength(3);
    const bridged = labelComponents(dilateMask(mask, W, H, 2), W, H, 1, mask);
    expect(bridged).toHaveLength(2);
    expect(Math.max(...bridged.map((c) => c.area))).toBe(128);
    expect(bridged.find((c) => c.area === 64).bbox).toEqual({ x0: 60, y0: 60, x1: 67, y1: 67 });
  });
});

describe('dock footprints', () => {
  test('derives cell and outward strip per eligible border tile', () => {
    const footprints = resolveDockFootprints({
      dockEligible: ['0,3', '9,3', '4,0', '4,9'],
      maze: { width: 10, height: 10 },
      board: { renderBounds: { left: 8, top: 8, right: 88, bottom: 88 }, tileSize: 8 },
      screen: { width: 96, height: 96 }
    });
    expect(footprints.map((f) => f.direction)).toEqual(['left', 'right', 'top', 'bottom']);
    expect(footprints[0].strip).toEqual({ x0: 0, x1: 8, y0: 32, y1: 40 });
    expect(footprints[1].strip).toEqual({ x0: 88, x1: 96, y0: 32, y1: 40 });
    expect(resolveDockFootprints({ dockEligible: null, maze: null, board: null, screen: null })).toEqual([]);
  });
});

describe('residual and island detectors', () => {
  // A body of 3 tiles in the middle plus one tile+stub at the right screen edge.
  const body = (image) => { fillRect(image, 24, 40, 24, 8); };
  const edgeTile = (image) => { fillRect(image, 80, 40, 8, 8); fillRect(image, 88, 41, 8, 6, [164, 190, 180]); };

  test('flags a tile-sized remnant at the screen edge that outlives the body', () => {
    const entries = [
      { phase: 'build', draw: () => {} },
      { phase: 'build', draw: () => {} },
      ...Array.from({ length: 5 }, () => ({ phase: 'deconstruct', draw: (i) => { body(i); edgeTile(i); } })),
      ...Array.from({ length: 6 }, () => ({ phase: 'deconstruct', draw: edgeTile })),
      { phase: 'deconstruct', draw: () => {} }
    ];
    const { frames, features } = sequence(entries);
    const baseline = features[0].components;
    // The synthetic body is tiny, so widen the tail to what a full-size board would give.
    const options = { ...DEFAULT_ANALYSIS_OPTIONS, tailFraction: 0.5 };
    const residual = detectResidual({ frames, features, tileSize: TILE, options, baselineComponents: baseline });
    expect(residual.applicable).toBe(true);
    expect(residual.islands).toHaveLength(1);
    expect(residual.islands[0]).toMatchObject({ nearEdge: true, edge: 'right', tileSized: true, persistFrames: 6, survivesToEnd: false });
    expect(residual.edgeOrphans).toHaveLength(1);
    expect(residual.emptyFrame).toBe(frames.length - 1);
    expect(residual.residualAtEnd).toHaveLength(0);

    const islands = detectIslands({ frames, features, tileSize: TILE, baselineComponents: baseline });
    expect(islands.some((c) => c.phase === 'deconstruct' && c.nearEdge && c.frames >= 5)).toBe(true);
  });

  test('reports residual components still lit in the last frame and ignores baseline decoration', () => {
    const title = (image) => fillRect(image, 4, 4, 20, 6);
    const entries = [
      { phase: 'build', draw: title },
      { phase: 'deconstruct', draw: (i) => { title(i); body(i); } },
      { phase: 'deconstruct', draw: (i) => { title(i); edgeTile(i); } },
      { phase: 'deconstruct', draw: (i) => { title(i); edgeTile(i); } }
    ];
    const { frames, features } = sequence(entries);
    const residual = detectResidual({ frames, features, tileSize: TILE, baselineComponents: features[0].components });
    expect(residual.residualAtEnd).toHaveLength(1);
    expect(residual.residualAtEnd[0].bbox.x0).toBeGreaterThanOrEqual(80);
    expect(residual.residualAtEnd.every((c) => c.bbox.y0 > 20)).toBe(true);
  });

  test('is not applicable without deconstruct frames', () => {
    const { frames, features } = sequence([{ phase: 'build' }, { phase: 'build' }]);
    expect(detectResidual({ frames, features }).applicable).toBe(false);
  });
});

describe('partial-bleed detector', () => {
  const dockStats = (cellLit, stripLit, stripExtent) => [{ id: '9,3', direction: 'right', cellLit, cellArea: 64, stripLit, stripArea: 64, stripExtent }];
  const build = (series) => ({
    frames: series.map((_, index) => ({ index, phase: 'build', simMs: index * 32 })),
    features: series.map(([cell, strip, extent]) => ({ dockStats: dockStats(cell, strip, extent) }))
  });

  test('flags a strip that is drawn partially for more than a few frames', () => {
    // The dock sits at extent 8 for most of its life; it is drawn at 1..7 px for 7 frames first.
    const series = [[0, 0, 0], ...Array.from({ length: 7 }, (_, i) => [64, 8 * (i + 1), i + 1]), ...Array.from({ length: 5 }, () => [64, 64, 8])];
    const result = detectPartialBleed(build(series));
    expect(result.applicable).toBe(true);
    expect(result.findings.some((f) => f.kind === 'partial-strip' && f.frames > 3)).toBe(true);
    expect(result.findings.some((f) => f.kind === 'cell-without-strip')).toBe(false);
  });

  test('flags border cell lit without its dock strip, and a strip without its cell', () => {
    const cellOnly = detectPartialBleed(build([[64, 0, 0], [64, 0, 0], [64, 0, 0], [64, 0, 0], [64, 0, 0], [64, 64, 8]]));
    expect(cellOnly.findings.map((f) => f.kind)).toContain('cell-without-strip');
    const stripOnly = detectPartialBleed(build([[0, 64, 8], [0, 64, 8], [0, 64, 8], [0, 64, 8], [0, 64, 8], [64, 64, 8]]));
    expect(stripOnly.findings.map((f) => f.kind)).toContain('strip-without-cell');
  });

  test('is clean when strip and cell appear atomically', () => {
    const atomic = detectPartialBleed(build([[0, 0, 0], [0, 0, 0], [64, 64, 8], [64, 64, 8], [64, 64, 8], [64, 64, 8], [64, 64, 8]]));
    expect(atomic.findings).toEqual([]);
    expect(atomic.docks[0]).toMatchObject({ firstCellFrame: 2, firstStripFrame: 2, fullStripFrame: 2 });
  });

  test('reports not applicable when there are no docks', () => {
    expect(detectPartialBleed({ frames: [{ index: 0, phase: 'build', simMs: 0 }], features: [{ dockStats: [] }] }).applicable).toBe(false);
  });
});

describe('flicker, stall and timing', () => {
  test('flags a build region that disappears and reappears, and total-area reversals', () => {
    const grow = (n) => (image) => fillRect(image, 8, 8, n, 8);
    const entries = [
      { phase: 'build', draw: grow(8) },
      { phase: 'build', draw: grow(16) },
      { phase: 'build', draw: (i) => { fillRect(i, 8, 8, 8, 8); } }, // right half blinks off
      { phase: 'build', draw: grow(16) },
      { phase: 'build', draw: grow(24) }
    ];
    const { frames, features } = sequence(entries);
    const flicker = detectFlicker({ frames, features });
    expect(flicker.build.areaReversals).toHaveLength(1);
    expect(flicker.build.blinkingBlockCount).toBeGreaterThan(0);
    expect(flicker.deconstruct.applicable).toBe(false);
  });

  test('a clean monotone build has no flicker', () => {
    const entries = [8, 16, 24, 32].map((n) => ({ phase: 'build', draw: (i) => fillRect(i, 8, 8, n, 8) }));
    const { frames, features } = sequence(entries);
    const flicker = detectFlicker({ frames, features });
    expect(flicker.build.areaReversals).toEqual([]);
    expect(flicker.build.blinkingBlockCount).toBe(0);
  });

  test('detects mid-build runs of identical frames and the leading idle', () => {
    const grow = (n) => ({ phase: 'build', draw: (i) => fillRect(i, 8, 8, n, 8) });
    const entries = [{ phase: 'build' }, { phase: 'build' }, grow(8), grow(16), ...Array.from({ length: 12 }, () => grow(16)), grow(24), grow(32)];
    const { frames, features } = sequence(entries);
    const stalls = detectStalls({ frames, features });
    expect(stalls.applicable).toBe(true);
    expect(stalls.firstGrowthFrame).toBe(2);
    expect(stalls.leadingIdle.frames).toBe(2);
    expect(stalls.trailingIdleMs).toBe(0);
    expect(stalls.stalls).toHaveLength(1);
    expect(stalls.stalls[0].frames).toBe(12);
  });

  test('timing combines manifest milestones with image-derived frames', () => {
    const entries = [
      { phase: 'build' }, { phase: 'build', draw: (i) => fillRect(i, 8, 8, 8, 8) }, { phase: 'build', draw: (i) => fillRect(i, 8, 8, 16, 8) },
      { phase: 'deconstruct', draw: (i) => fillRect(i, 8, 8, 16, 8) }, { phase: 'deconstruct' }
    ];
    const { frames, features } = sequence(entries);
    const manifest = { milestones: { inputUnlockedSimMs: 64, deconstructStartSimMs: 96, goalReachedSimMs: 90, boardEmptyProbeSimMs: 128, lastFrameSimMs: 128 } };
    const report = analyzeFeatures({ manifest, frames, features, tileSize: TILE });
    expect(report.timing.startToInputUnlockedMs).toBe(64);
    expect(report.timing.boardEmptyImageSimMs).toBe(128);
    expect(report.timing.deconstructDurationMs).toBe(32);
    expect(report.timing.firstTileVisibleSimMs).toBe(32);
    expect(selectBaselineIndex(frames, features)).toBe(0);
    expect(computeTiming({ manifest: {}, frames, features, residual: { emptyFrame: null }, stalls: { firstGrowthFrame: null, lastGrowthFrame: null } }).boardEmptyImageSimMs).toBeNull();
    expect(formatReport('synthetic', report)).toContain('Maze lifecycle analysis: synthetic');
  });

  test('exposes stable default thresholds', () => {
    expect(DEFAULT_ANALYSIS_OPTIONS.partialMinFrames).toBeGreaterThanOrEqual(3);
    expect(Object.isFrozen(DEFAULT_ANALYSIS_OPTIONS)).toBe(true);
  });
});

describe('capture helpers', () => {
  test('parses viewports and resolves options', () => {
    expect(parseViewport('390x844')).toEqual({ width: 390, height: 844 });
    expect(() => parseViewport('wide')).toThrow(/Invalid viewport/);
    const options = resolveOptions({ viewport: '390x844,1280x720', level: '15', 'step-ms': '33', fps: '15' });
    expect(options.viewports).toHaveLength(2);
    expect(options.level).toBe(15);
    expect(options.stepMs).toBe(32);
    expect(options.fps).toBe(15);
    expect(resolveOptions({}).viewports).toHaveLength(2);
  });

  test('derives wrap-aware move commands and the expected progression label', () => {
    expect(directionForStep({ x: 1, y: 1 }, { x: 2, y: 1 })).toBe('move_right');
    expect(directionForStep({ x: 1, y: 1 }, { x: 1, y: 0 })).toBe('move_up');
    // A wrap step jumps across the board; the real move is the opposite direction.
    expect(directionForStep({ x: 0, y: 5 }, { x: 24, y: 5 })).toBe('move_left');
    expect(directionForStep({ x: 3, y: 56 }, { x: 3, y: 0 })).toBe('move_down');
    expect(expectedProgressionLabel(1)).toBe('Player Skill Lv 01');
    expect(createProgressionState(15).tracks.player).toMatchObject({ level: 15, completedCycles: '14', targetComplexity: 64 });
  });
});
