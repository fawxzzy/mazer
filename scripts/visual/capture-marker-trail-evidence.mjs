/**
 * Goal-star salience and trail-legibility evidence on the real Chip board (headless Chromium, fake clock).
 *
 *   node scripts/visual/capture-marker-trail-evidence.mjs --base-url http://127.0.0.1:5301 --out DIR [--label after]
 *        [--levels 5,20,40,99] [--viewports 390x844@2,1280x720@1] [--tile-style chip|trace] [--assert]
 *
 * For each (level, viewport) it loads the app at that progression level, presses Start, waits for the settled
 * board, then puts the player on the real shortest route at two points (early, late) with the matching trail,
 * and for each state takes a full screenshot plus a crop around the goal. Measured from the pixels (css px, so
 * independent of DPR):
 *   goalCorePx        strict goal-red pixels (the star) within 28 css px of the goal centre, in css px^2
 *   goalHueAnnulus    goal-hue-ish pixels (pad / halo / ring, loose red test) in the same window, css px^2
 *   goalContrast      WCAG contrast between the mean colour of the strict goal pixels and the mean colour of the
 *                     annulus 1.1..1.7 x badge radius around them
 *   trailRidgeWidthCss  per trail cell, the css-px cross-section of the trail that reads as distinct (contrast >= 3)
 *                     from the darkest pixel within 3.5 css px (its own underlay outline); p10 and median over the cells
 *   trailCoreVsOutline  contrast of the cell-centre pixel against that darkest outline pixel
 * `--assert` exits non-zero when the floors in FLOORS are not met (used for the "after" run).
 * Run the same command against a baseline checkout (another --base-url) to produce the "before" numbers.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { parseCliArgs } from './common.mjs';
import { PROGRESSION_STORAGE_KEY, createProgressionState } from './capture-maze-lifecycle.mjs';
import { decodePng, encodePng } from './lib/png-codec.mjs';

const START_BUTTON_SELECTOR = 'button[data-mazer-accessibility-command="start"]';
export const FLOORS = Object.freeze({
  goalCorePx: 70,
  goalContrast: 1.8
});

const lum = (r, g, b) => {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const buildInit = (progression, seed) => `(() => {
  try { if (!sessionStorage.getItem('__ev')) { sessionStorage.setItem('__ev','1'); localStorage.clear();
    ${progression ? `localStorage.setItem(${JSON.stringify(PROGRESSION_STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(progression))});` : ''} } } catch (e) {}
  let a = ${seed >>> 0};
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})();`;

const nearest = (image, x0, y0, w, h, zoom) => {
  const out = new Uint8Array(w * zoom * h * zoom * 4);
  for (let y = 0; y < h * zoom; y += 1) {
    for (let x = 0; x < w * zoom; x += 1) {
      const sx = Math.min(image.width - 1, Math.max(0, x0 + Math.floor(x / zoom)));
      const sy = Math.min(image.height - 1, Math.max(0, y0 + Math.floor(y / zoom)));
      const s = (sy * image.width + sx) * 4;
      const d = (y * w * zoom + x) * 4;
      out[d] = image.data[s]; out[d + 1] = image.data[s + 1]; out[d + 2] = image.data[s + 2]; out[d + 3] = 255;
    }
  }
  return { width: w * zoom, height: h * zoom, data: out };
};

const measure = (image, dpr, geo, trailCells) => {
  const px = (cssX, cssY) => {
    const x = Math.round(cssX * dpr);
    const y = Math.round(cssY * dpr);
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
    const i = (y * image.width + x) * 4;
    return [image.data[i], image.data[i + 1], image.data[i + 2]];
  };
  const reach = 28;
  let core = 0; let hue = 0;
  const coreSum = [0, 0, 0];
  const winX0 = Math.floor((geo.goalX - reach) * dpr);
  const winY0 = Math.floor((geo.goalY - reach) * dpr);
  const winX1 = Math.ceil((geo.goalX + reach) * dpr);
  const winY1 = Math.ceil((geo.goalY + reach) * dpr);
  const coreMask = new Set();
  for (let y = Math.max(0, winY0); y < Math.min(image.height, winY1); y += 1) {
    for (let x = Math.max(0, winX0); x < Math.min(image.width, winX1); x += 1) {
      const i = (y * image.width + x) * 4;
      const r = image.data[i]; const g = image.data[i + 1]; const b = image.data[i + 2];
      if (Math.abs(r - 255) <= 30 && Math.abs(g - 64) <= 45 && Math.abs(b - 93) <= 45) {
        core += 1; coreSum[0] += r; coreSum[1] += g; coreSum[2] += b; coreMask.add(`${x},${y}`);
      } else if (r - Math.max(g, b) >= 40 && r >= 90) {
        hue += 1;
      }
    }
  }
  const coreMean = core > 0 ? coreSum.map((v) => v / core) : null;
  // annulus colour around the badge: sample ring 1.1..1.7 x badgeR (badge radius from the effective geometry)
  let annN = 0; const annSum = [0, 0, 0];
  const r0 = geo.badgeR * 1.1; const r1 = geo.badgeR * 1.7;
  for (let a = 0; a < 360; a += 6) {
    for (let r = r0; r <= r1; r += 1) {
      const p = px(geo.goalX + Math.cos((a * Math.PI) / 180) * r, geo.goalY + Math.sin((a * Math.PI) / 180) * r);
      if (p) { annN += 1; annSum[0] += p[0]; annSum[1] += p[1]; annSum[2] += p[2]; }
    }
  }
  const annMean = annN > 0 ? annSum.map((v) => v / annN) : null;
  const goalContrast = coreMean && annMean
    ? contrast(lum(...coreMean), lum(...annMean)) : null;

  // Ridge width: across the trail at each cell centre, how many css px read as distinct from the darkest pixel
  // within 3.5 css px (the trail's own underlay outline), contrast >= 3. Straight cells and corners: the smaller of
  // the horizontal and vertical extents is the cross-section. Also the centre pixel's contrast against that outline.
  const ws = [];
  const cc = [];
  for (const cell of trailCells) {
    if (Math.hypot(cell.cx - geo.goalX, cell.cy - geo.goalY) < Math.max(geo.badgeR * 1.4, geo.tile)) continue;
    const c = px(cell.cx, cell.cy);
    if (!c) continue;
    let darkest = Infinity;
    for (let dy = -3.5; dy <= 3.5; dy += 0.5) {
      for (let dx = -3.5; dx <= 3.5; dx += 0.5) {
        const q = px(cell.cx + dx, cell.cy + dy);
        if (q) darkest = Math.min(darkest, lum(...q));
      }
    }
    const run = (dx, dy) => {
      let n = 0;
      for (let t = 0.25; t <= 6; t += 0.25) {
        const q = px(cell.cx + dx * t, cell.cy + dy * t);
        if (!q || contrast(lum(...q), darkest) < 3) break;
        n = t;
      }
      return n;
    };
    const horizontal = run(1, 0) + run(-1, 0);
    const vertical = run(0, 1) + run(0, -1);
    ws.push(Math.min(horizontal, vertical));
    cc.push(contrast(lum(...c), darkest));
  }
  const cs = ws;
  const ccs = cc.sort((x, y) => x - y);
  cs.sort((a, b) => a - b);
  const at = (q) => (cs.length ? cs[Math.min(cs.length - 1, Math.floor(q * cs.length))] : null);
  return {
    goalCorePx: +(core / (dpr * dpr)).toFixed(1),
    goalHueAnnulusPx: +(hue / (dpr * dpr)).toFixed(1),
    goalContrast: goalContrast === null ? null : +goalContrast.toFixed(2),
    trailRidgeWidthCss: { n: cs.length, p10: at(0.1), median: at(0.5) },
    trailCoreVsOutline: ccs.length ? { p10: +ccs[Math.floor(ccs.length * 0.1)].toFixed(2), median: +ccs[Math.floor(ccs.length * 0.5)].toFixed(2) } : null
  };
};

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = String(args['base-url'] || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('--base-url required');
  const out = resolve(String(args.out || 'tmp-evidence'));
  const label = String(args.label || 'run');
  const levels = String(args.levels || '5,20,40,99').split(',').map(Number);
  const viewports = String(args.viewports || '390x844@2,1280x720@1').split(',').map((v) => {
    const [size, dpr] = v.split('@');
    const [w, h] = size.split('x').map(Number);
    return { width: w, height: h, dpr: Number(dpr || 1) };
  });
  const tileStyle = String(args['tile-style'] || 'chip');
  const states = String(args.states || 'early:0.35,late:0.9').split(',').map((s) => {
    const [name, frac] = s.split(':'); return { name, frac: Number(frac) };
  });
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of viewports) {
      for (const level of levels) {
        const mobile = viewport.width <= 430;
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: viewport.dpr,
          hasTouch: mobile,
          isMobile: mobile,
          reducedMotion: args['reduced-motion'] ? 'reduce' : 'no-preference'
        });
        await context.addInitScript(buildInit(level > 1 ? createProgressionState(level) : null, 1337));
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await page.clock.install({ time: 0 });
        await page.clock.pauseAt(16);
        await page.goto(`${baseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=1337&tileStyle=${tileStyle}`, { waitUntil: 'commit', timeout: 120000 });
        for (let t = 0; t < 20000; t += 1) {
          const ready = await page.evaluate(() => Boolean(window.__MAZER_QA__ && window.__MAZER_GAME__)).catch(() => false);
          if (ready) break;
          await page.clock.runFor(16);
          await new Promise((r) => setTimeout(r, 10));
        }
        const probe = () => page.evaluate(() => {
          const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
          return { now: performance.now(), mode: s.mode, phase: s.menuStaticDrawLifecyclePhase, locked: s.isLegacyPlayLifecycleInputLocked() };
        });
        let p = await probe();
        for (let i = 0; i < 400 && !(p.mode === 'menu' && p.phase === 'settled'); i += 1) { await page.clock.runFor(500); p = await probe(); }
        await page.evaluate((sel) => document.querySelector(sel).click(), START_BUTTON_SELECTOR);
        for (let i = 0; i < 600; i += 1) {
          await page.clock.runFor(160);
          p = await probe();
          if (p.mode === 'play' && p.phase === 'settled' && !p.locked) break;
        }
        await page.clock.runFor(800);
        const solved = await page.evaluate(() => window.__MAZER_QA__.resolveShortestPathToGoal());
        const route = solved?.found ? solved.path : null;
        if (!route || route.length < 3) throw new Error(`no route at level ${level}`);
        for (const state of states) {
          const k = Math.max(1, Math.min(route.length - 2, Math.floor(route.length * state.frac)));
          await page.evaluate(({ route: r, k: kk }) => {
            const scene = window.__MAZER_GAME__.scene.getScene('MenuScene');
            scene.player = { x: r[kk].x, y: r[kk].y };
            scene.syncLegacyPlayerVisualMotionTo(scene.player);
            scene.trail = r.slice(0, kk + 1).map((q) => ({ x: q.x, y: q.y }));
            scene.hasPlayerEverLeftStart = true;
            scene.boardDynamicDirty = true;
          }, { route, k });
          await page.clock.runFor(700);
          const geo = await page.evaluate(() => {
            const s = window.__MAZER_GAME__.scene.getScene('MenuScene');
            const off = s.resolveBoardOffset();
            const f = s.resolveLegacyMazeRenderFrame(s.layout.boardLeft + off.x, s.layout.boardTop + off.y, s.layout.boardWidth, s.layout.boardHeight);
            const o = s.boardTileLayer.snappedOrigin ?? { x: f.boardLeft, y: f.boardTop };
            return { ox: o.x, oy: o.y, tile: f.tileSize, goal: { x: s.maze.goal.x, y: s.maze.goal.y }, size: { w: s.maze.width, h: s.maze.height } };
          });
          const goalX = geo.ox + (geo.goal.x + 0.5) * geo.tile;
          const goalY = geo.oy + (geo.goal.y + 0.5) * geo.tile;
          const badgeR = Math.max(geo.tile * 0.47, Number(args['badge-floor'] ?? 22) / 2);
          const tag = `L${String(level).padStart(2, '0')}-${viewport.width}x${viewport.height}-${state.name}`;
          const png = await page.screenshot({ path: join(out, `${label}-${tag}.png`) });
          const image = decodePng(png);
          const trailCells = route.slice(0, k + 1).map((q) => ({ cx: geo.ox + (q.x + 0.5) * geo.tile, cy: geo.oy + (q.y + 0.5) * geo.tile }));
          const m = measure(image, viewport.dpr, { goalX, goalY, badgeR, tile: geo.tile }, trailCells);
          // crop 110x110 css px around the goal, 3x
          const half = 55 * viewport.dpr;
          const cropped = nearest(image, Math.round(goalX * viewport.dpr - half), Math.round(goalY * viewport.dpr - half), Math.round(half * 2), Math.round(half * 2), 3);
          await writeFile(join(out, `${label}-${tag}-goalcrop.png`), encodePng(cropped));
          const row = { label, tag, level, viewport, tile: +geo.tile.toFixed(2), board: geo.size, state: state.name, ...m, errors };
          results.push(row);
          console.log(JSON.stringify(row));
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  await writeFile(join(out, `${label}-metrics.json`), JSON.stringify(results, null, 2));
  if (args.assert) {
    const failures = results.filter((r) => r.goalCorePx < FLOORS.goalCorePx || (r.goalContrast ?? 0) < FLOORS.goalContrast);
    if (failures.length) { console.error('FLOOR FAILURES', failures.map((f) => f.tag)); process.exitCode = 1; }
  }
};

main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
