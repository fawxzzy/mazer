#!/usr/bin/env node
/**
 * Corner-star visibility harness (MAZER-VIS-056, corner stars off screen on phones).
 *
 * Drives the REAL game (dev server or preview) in headless Chromium as a phone: DPR 3, touch, iPhone user agent, home-screen
 * (standalone) emulation (navigator.standalone + a display-mode matchMedia override), optional simulated
 * `env(safe-area-inset-bottom)` (the CSS variable the game reads). While the menu demo runs its full lifecycle (rest 50%, departure
 * beams growing the stars to 100%, the ring orbit, arrival beams, shrink back to rest) it measures, every rendered frame:
 *
 * - geometry: every star outline the game strokes into its edge-marker Graphics (recorded from the real draw calls), widened by the
 *   1 px stroke's miter join, tested against each visible-region model;
 * - real pixels (throttled, and on every new worst frame): the frame is re-rendered with the edge-marker layer hidden and diffed, so
 *   the lit pixels are exactly the stars' painted pixels; each lit device pixel is tested against each model.
 *
 * A visible-region model is the canvas minus a bottom strip the screen does not show (`inset`, css px: 0, a 34 px home-indicator band
 * reported to nobody, an 83 px toolbar) with the two bottom corners of what remains rounded by a display corner of radius `R`
 * (Apple's continuous corner, the same three-cubic curve as src/render/displayCornerMask.ts: it starts bending 1.53 R along each
 * edge and crosses the diagonal at 0.2915 R). The top corners are not modelled: in a home-screen app the status bar sits above the
 * canvas. The inset strip is a worst-case model only: on iOS the home-indicator area IS shown, so inset 0 is the real case.
 *
 * Output (default tmp/edge-corner-visibility/<label>/): results.json (worst depth per corner per model, frame counts, lifecycle
 * coverage) and PNG crops of the bottom corners at rest, at the largest size and at the worst frame, with the hidden region painted
 * magenta and the visible bottom drawn cyan. Usage:
 *   node scripts/analysis/measure-edge-corner-visibility.mjs --url http://127.0.0.1:5671/ --label before --seconds 45 \
 *     [--viewports 402x874,440x956] [--safe-area-bottom 34] [--insets 0,34,83] [--radii 48,55,62,66]
 * One Chromium, one context at a time. Exit code 0 always; read results.json.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};

const url = option('url', 'http://127.0.0.1:5671/');
const label = option('label', 'run');
const seconds = Number(option('seconds', '45'));
const outRoot = path.resolve(option('out', path.join('tmp', 'edge-corner-visibility')), label);
const viewports = option('viewports', '390x844,393x852,402x874,430x932,440x956,412x915')
  .split(',').map((entry) => entry.trim()).filter(Boolean)
  .map((entry) => { const [w, h] = entry.split('x').map(Number); return { width: w, height: h, name: entry }; });
const safeAreaBottom = Number(option('safe-area-bottom', '0'));
const safeAreaTop = Number(option('safe-area-top', '0'));
const insets = option('insets', '0,34,83').split(',').map(Number);
const radii = option('radii', '0,48,55,62,66').split(',').map(Number);
const dpr = Number(option('dpr', '3'));
const crop = 96;

// Apple's continuous display corner, R = 1 (mirror of src/render/displayCornerMask.ts CONTINUOUS_CORNER_SEGMENTS; keep in sync).
const CONTINUOUS_SEGMENTS = [
  [[1.52866483, 0], [1.08849323, 0], [0.86840689, 0], [0.63149399, 0.074911]],
  [[0.63149399, 0.074911], [0.37282392, 0.16905899], [0.16905899, 0.37282392], [0.074911, 0.63149399]],
  [[0.074911, 0.63149399], [0, 0.86840689], [0, 1.08849323], [0, 1.52866483]]
];
const continuousOutline = (radius, steps = 48) => {
  const cubic = (a, b, c, d, t) => ((1 - t) ** 3 * a) + (3 * (1 - t) ** 2 * t * b) + (3 * (1 - t) * t * t * c) + (t ** 3 * d);
  const points = [];
  CONTINUOUS_SEGMENTS.forEach(([p0, p1, p2, p3], index) => {
    for (let step = index === 0 ? 0 : 1; step <= steps; step += 1) {
      const t = step / steps;
      points.push([cubic(p0[0], p1[0], p2[0], p3[0], t) * radius, cubic(p0[1], p1[1], p2[1], p3[1], t) * radius]);
    }
  });
  return points;
};

const IPHONE_UA ='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const initScript = ({ safeAreaBottom: bottom, safeAreaTop: top }) => {
  try {
    Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true });
  } catch { /* ignore */ }
  const nativeMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    if (/display-mode:\s*standalone/.test(query)) {
      return { matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } };
    }
    return nativeMatchMedia(query);
  };
  // Simulated env(safe-area-inset-*): the game reads these two custom properties (viewportGeometry.ts readSafeArea).
  const inject = () => {
    const root = document.head || document.documentElement;
    if (!root) return false;
    const style = document.createElement('style');
    style.textContent = `:root{--mazer-environment-safe-area-bottom:${bottom}px !important;--mazer-environment-safe-area-top:${top}px !important;}`;
    root.appendChild(style);
    return true;
  };
  if (!inject()) {
    const observer = new MutationObserver(() => { if (inject()) observer.disconnect(); });
    observer.observe(document, { childList: true, subtree: true });
  }
};

/** Runs in the page: installs the per-frame recorder. */
const installRecorder = ({ insets: modelInsets, radii: modelRadii, crop: cropCss, outlines }) => {
  const game = window.__MAZER_GAME__;
  const scene = game.scene.scenes.find((candidate) => candidate.boardTileLayer && candidate.edgeMarkerGraphics);
  const graphics = scene.edgeMarkerGraphics;
  const canvas = game.canvas;
  const cssWidth = game.scale.width;
  const cssHeight = game.scale.height;
  const resolution = canvas.width / cssWidth;
  const record = {
    cssWidth, cssHeight, resolution, canvasWidth: canvas.width, canvasHeight: canvas.height,
    frames: 0, pixelFrames: 0, orbitFrames: 0, maxScale: 0, minScale: 1,
    geometry: {}, pixels: {}, captures: {}, cornerTips: [], errors: []
  };
  const models = [];
  modelInsets.forEach((inset) => modelRadii.forEach((radius) => models.push({ key: `inset${inset}-R${radius}`, inset, radius })));
  models.forEach((model) => {
    record.geometry[model.key] = { 'bottom-left': -Infinity, 'bottom-right': -Infinity, worstFrame: null };
    record.pixels[model.key] = { 'bottom-left': -Infinity, 'bottom-right': -Infinity, hiddenLit: 0, worstFrame: null };
  });

  /** > 0: how deep (css px) the point is inside the part of the screen this model cannot show; -Infinity when clear. */
  const hiddenDepth = (x, y, model) => {
    const bottom = cssHeight - model.inset;
    if (y > bottom) {
      return y - bottom;
    }
    if (x < 0 || x > cssWidth) {
      return Math.max(-x, x - cssWidth);
    }
    if (model.radius <= 0) {
      return -Infinity;
    }
    // Continuous (iOS) corner: hidden iff the point is between the corner and the curve; depth = distance to the curve.
    const along = Math.min(x, cssWidth - x);
    const across = bottom - y;
    const extent = 1.52866483 * model.radius;
    if (along >= extent || across >= extent) {
      return -Infinity;
    }
    const outline = outlines[model.radius];
    let nearest = Infinity;
    let curveAcross = along <= 0 ? extent : 0;
    for (let index = 0; index < outline.length - 1; index += 1) {
      const [a0, c0] = outline[index];
      const [a1, c1] = outline[index + 1];
      const da = a1 - a0;
      const dc = c1 - c0;
      const lengthSq = (da * da) + (dc * dc);
      const t = lengthSq > 0 ? Math.max(0, Math.min(1, (((along - a0) * da) + ((across - c0) * dc)) / lengthSq)) : 0;
      nearest = Math.min(nearest, Math.hypot(along - (a0 + (da * t)), across - (c0 + (dc * t))));
      if (along <= a0 && along >= a1 && da !== 0) curveAcross = c0 + (dc * ((along - a0) / da));
    }
    return across < curveAcross ? nearest : -nearest;
  };

  // Record the outlines stroked into the edge-marker Graphics this frame.
  let current = null;
  let strokes = [];
  let lineWidth = 1;
  const wrap = (name, fn) => {
    const original = graphics[name].bind(graphics);
    graphics[name] = (...callArgs) => { fn(...callArgs); return original(...callArgs); };
  };
  wrap('clear', () => { strokes = []; current = null; });
  wrap('beginPath', () => { current = []; });
  wrap('moveTo', (x, y) => { current?.push({ x, y }); });
  wrap('lineTo', (x, y) => { current?.push({ x, y }); });
  wrap('lineStyle', (width) => { lineWidth = width; });
  wrap('strokePath', () => { if (current && current.length >= 8) strokes.push({ points: current.slice(), lineWidth }); });

  const miterPolygon = (points, width) => {
    const half = width / 2;
    const area = points.reduce((sum, a, index) => { const b = points[(index + 1) % points.length]; return sum + ((a.x * b.y) - (b.x * a.y)); }, 0);
    const sign = area >= 0 ? 1 : -1;
    const normal = (from, to) => { const dx = to.x - from.x; const dy = to.y - from.y; const length = Math.hypot(dx, dy) || 1; return { x: (sign * dy) / length, y: (-sign * dx) / length }; };
    return points.map((vertex, index) => {
      const previous = points[(index + points.length - 1) % points.length];
      const next = points[(index + 1) % points.length];
      const n1 = normal(previous, vertex);
      const n2 = normal(vertex, next);
      const denominator = 1 + (n1.x * n2.x) + (n1.y * n2.y);
      if (denominator < 0.02) return { x: vertex.x + (n1.x * half), y: vertex.y + (n1.y * half) };
      return { x: vertex.x + (((n1.x + n2.x) * half) / denominator), y: vertex.y + (((n1.y + n2.y) * half) / denominator) };
    });
  };
  const cornerOf = (points) => {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    if (cy < cssHeight - 140) return null;
    if (cx < 140) return 'bottom-left';
    if (cx > cssWidth - 140) return 'bottom-right';
    return null;
  };

  const sampleWindow = (corner) => {
    const size = Math.round(cropCss * resolution);
    const x0 = corner === 'bottom-left' ? 0 : canvas.width - size;
    const y0 = canvas.height - size;
    return { x0, y0, size };
  };
  const readWindow = (corner) => {
    const { x0, y0, size } = sampleWindow(corner);
    return canvas.getContext('2d').getImageData(x0, y0, size, size).data;
  };
  const rerender = () => {
    const renderer = game.renderer;
    renderer.preRender();
    game.scene.render(renderer);
    renderer.postRender();
  };
  const cropDataUrl = (corner) => {
    const { x0, y0, size } = sampleWindow(corner);
    const out = document.createElement('canvas');
    out.width = size; out.height = size;
    out.getContext('2d').drawImage(canvas, x0, y0, size, size, 0, 0, size, size);
    return out.toDataURL('image/png');
  };

  let lastPixelAt = -Infinity;
  let worstPixelDepth = -Infinity;
  let restCaptured = false;
  let fullCaptured = false;
  let worstGeometryDepth = -Infinity;
  const worstModel = models[models.length - 1];

  game.events.on('postrender', () => {
    try {
      if (strokes.length === 0) return;
      const now = performance.now();
      record.frames += 1;
      const ring = scene.edgeRing ?? { spinRad: 0, lifecycle: null };
      if (ring.spinRad !== 0) record.orbitFrames += 1;
      let frameWorst = -Infinity;
      let frameMaxScale = 0;
      const cornerStars = [];
      strokes.forEach((stroke) => {
        const corner = cornerOf(stroke.points);
        if (!corner) return;
        const inner = stroke.points[0];
        const outer = stroke.points[Math.floor(stroke.points.length / 2)];
        const scale = Math.hypot(inner.x - outer.x, inner.y - outer.y) / 17.6;
        frameMaxScale = Math.max(frameMaxScale, scale);
        const painted = miterPolygon(stroke.points, stroke.lineWidth);
        cornerStars.push({ corner, painted, scale, outer });
        models.forEach((model) => {
          const depth = Math.max(...painted.map((p) => hiddenDepth(p.x, p.y, model)));
          const slot = record.geometry[model.key];
          if (depth > slot[corner]) {
            slot[corner] = depth;
            slot.worstFrame = { t: Math.round(now), corner, scale: +scale.toFixed(3), spinRad: +ring.spinRad.toFixed(3), tip: { x: +outer.x.toFixed(2), y: +outer.y.toFixed(2) } };
          }
          if (model === worstModel) frameWorst = Math.max(frameWorst, depth);
        });
      });
      record.maxScale = Math.max(record.maxScale, frameMaxScale);
      if (frameMaxScale > 0) record.minScale = Math.min(record.minScale, frameMaxScale);
      if (record.cornerTips.length < 4 && ring.spinRad === 0 && cornerStars.length >= 2 && !ring.lifecycle) {
        record.cornerTips.push(cornerStars.map((star) => ({ corner: star.corner, scale: +star.scale.toFixed(3), tip: { x: +star.outer.x.toFixed(3), y: +star.outer.y.toFixed(3) } })));
      }

      const newWorstGeometry = frameWorst > worstGeometryDepth + 0.05;
      if (newWorstGeometry) worstGeometryDepth = frameWorst;
      const wantRest = !restCaptured && ring.spinRad === 0 && !ring.lifecycle && frameMaxScale > 0 && frameMaxScale < 0.55 && now > 4000;
      const wantFull = !fullCaptured && frameMaxScale > 0.985;
      if (!(now - lastPixelAt > 120 || newWorstGeometry || wantRest || wantFull)) return;
      lastPixelAt = now;
      // Pixel truth: this frame with and without the edge-marker layer.
      const withMarkers = { 'bottom-left': readWindow('bottom-left'), 'bottom-right': readWindow('bottom-right') };
      const captures = {};
      if (wantRest || wantFull || newWorstGeometry) {
        captures['bottom-left'] = cropDataUrl('bottom-left');
        captures['bottom-right'] = cropDataUrl('bottom-right');
      }
      const visible = graphics.visible;
      graphics.visible = false;
      rerender();
      const withoutMarkers = { 'bottom-left': readWindow('bottom-left'), 'bottom-right': readWindow('bottom-right') };
      graphics.visible = visible;
      rerender();
      record.pixelFrames += 1;
      let framePixelWorst = -Infinity;
      ['bottom-left', 'bottom-right'].forEach((corner) => {
        const { x0, y0, size } = sampleWindow(corner);
        const a = withMarkers[corner];
        const b = withoutMarkers[corner];
        for (let py = 0; py < size; py += 1) {
          for (let px = 0; px < size; px += 1) {
            const i = ((py * size) + px) * 4;
            const diff = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
            if (diff < 12) continue;
            const x = (x0 + px + 0.5) / resolution;
            const y = (y0 + py + 0.5) / resolution;
            models.forEach((model) => {
              const depth = hiddenDepth(x, y, model);
              const slot = record.pixels[model.key];
              if (depth > 0) slot.hiddenLit += 1;
              if (depth > slot[corner]) {
                slot[corner] = depth;
                slot.worstFrame = { t: Math.round(now), corner, scale: +frameMaxScale.toFixed(3), spinRad: +ring.spinRad.toFixed(3) };
              }
              if (model === worstModel) framePixelWorst = Math.max(framePixelWorst, depth);
            });
          }
        }
      });
      if (wantRest) { restCaptured = true; record.captures.rest = { ...captures, scale: frameMaxScale, t: Math.round(now) }; }
      if (wantFull) { fullCaptured = true; record.captures.full = { ...captures, scale: frameMaxScale, spinRad: ring.spinRad, t: Math.round(now) }; }
      if (captures['bottom-left'] && (newWorstGeometry || framePixelWorst > worstPixelDepth)) {
        record.captures.worst = { ...captures, scale: frameMaxScale, spinRad: ring.spinRad, depth: frameWorst, t: Math.round(now) };
      }
      worstPixelDepth = Math.max(worstPixelDepth, framePixelWorst);
    } catch (error) {
      if (record.errors.length < 5) record.errors.push(String(error?.stack ?? error));
    }
  });
  window.__EDGE_CORNER_RECORD__ = record;
  return { cssWidth, cssHeight, resolution };
};

const overlay = async (dataUrl, corner, meta, file, models) => {
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  const { resolution, cssHeight, cssWidth } = meta;
  const size = Math.round(crop * resolution);
  const x0 = corner === 'bottom-left' ? 0 : Math.round(cssWidth * resolution) - size;
  const y0 = Math.round(cssHeight * resolution) - size;
  // Hidden region of each model as translucent magenta (darker = more models hide it), visible bottom lines in cyan.
  const shapes = models.map((model) => {
    const bottom = (cssHeight - model.inset) * resolution - y0;
    const r = model.radius * resolution;
    const cornerX = corner === 'bottom-left' ? -x0 : (cssWidth * resolution) - x0;
    const sx = corner === 'bottom-left' ? 1 : -1;
    const arc = r > 0
      ? `M ${cornerX} ${bottom} ${continuousOutline(model.radius).map(([along, across]) => `L ${cornerX + (sx * along * resolution)} ${bottom - (across * resolution)}`).join(' ')} Z`
      : '';
    return `<path d="${arc}" fill="rgba(255,0,255,0.28)"/><rect x="0" y="${bottom}" width="${size}" height="${Math.max(0, size - bottom)}" fill="rgba(255,0,255,0.22)"/><line x1="0" x2="${size}" y1="${bottom}" y2="${bottom}" stroke="cyan" stroke-width="1"/>`;
  }).join('');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${shapes}</svg>`);
  const mask = await sharp(svg, { density: 72 }).resize(size, size).png().toBuffer();
  const composed = await sharp(png).composite([{ input: mask, top: 0, left: 0 }]).png().toBuffer();
  await sharp(composed).resize(size * 2, size * 2, { kernel: 'nearest' }).png().toFile(file);
};

const main = async () => {
  await mkdir(outRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const summary = { url, label, seconds, safeAreaBottom, safeAreaTop, dpr, insets, radii, viewports: {} };
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: dpr,
        isMobile: true,
        hasTouch: true,
        userAgent: IPHONE_UA
      });
      await context.addInitScript(initScript, { safeAreaBottom, safeAreaTop });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(String(error)));
      await page.goto(`${url}?runtimeDiagnostics=1&authFixture=authenticated`, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const game = window.__MAZER_GAME__;
        return Boolean(game?.scene?.scenes?.find((scene) => scene.boardTileLayer && scene.edgeMarkerGraphics && scene.layout));
      }, null, { timeout: 60000 });
      const outlines = Object.fromEntries(radii.filter((radius) => radius > 0).map((radius) => [radius, continuousOutline(radius)]));
      const meta = await page.evaluate(installRecorder, { insets, radii, crop, outlines });
      const geometry = await page.evaluate(() => ({
        inner: { width: window.innerWidth, height: window.innerHeight },
        client: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
        visualViewport: window.visualViewport ? { width: window.visualViewport.width, height: window.visualViewport.height } : null,
        screen: { width: screen.width, height: screen.height },
        mazer: window.__MAZER_VIEWPORT_GEOMETRY__ ? { fullBleed: window.__MAZER_VIEWPORT_GEOMETRY__.fullBleed, safeArea: window.__MAZER_VIEWPORT_GEOMETRY__.safeArea } : null
      }));
      await page.waitForTimeout(seconds * 1000);
      const record = await page.evaluate(() => window.__EDGE_CORNER_RECORD__);
      const models = [];
      insets.forEach((inset) => radii.forEach((radius) => models.push({ inset, radius })));
      const dir = path.join(outRoot, viewport.name);
      await mkdir(dir, { recursive: true });
      for (const [kind, capture] of Object.entries(record.captures)) {
        for (const corner of ['bottom-left', 'bottom-right']) {
          if (capture[corner]) {
            await overlay(capture[corner], corner, meta, path.join(dir, `${kind}-${corner}.png`), models.filter((m) => m.inset === 0 || m.radius === 0));
            delete capture[corner];
          }
        }
      }
      const round = (value) => (Number.isFinite(value) ? +value.toFixed(2) : null);
      const table = (source) => Object.fromEntries(Object.entries(source).map(([key, slot]) => [key, {
        'bottom-left': round(slot['bottom-left']), 'bottom-right': round(slot['bottom-right']), ...(slot.hiddenLit !== undefined ? { hiddenLit: slot.hiddenLit } : {}), worstFrame: slot.worstFrame
      }]));
      summary.viewports[viewport.name] = {
        geometry, meta,
        frames: record.frames, pixelFrames: record.pixelFrames, orbitFrames: record.orbitFrames,
        scaleRange: [round(record.minScale), round(record.maxScale)],
        restCornerTips: record.cornerTips[0] ?? null,
        captures: record.captures,
        geometryDepth: table(record.geometry),
        pixelDepth: table(record.pixels),
        errors: record.errors, pageErrors: pageErrors.slice(0, 5)
      };
      await writeFile(path.join(outRoot, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
      process.stdout.write(`${viewport.name}: frames ${record.frames} pixel ${record.pixelFrames} orbit ${record.orbitFrames} scale ${round(record.minScale)}..${round(record.maxScale)}\n`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(`results: ${path.join(outRoot, 'results.json')}\n`);
};

main().catch((error) => { process.stderr.write(`${error?.stack ?? error}\n`); process.exitCode = 1; });
