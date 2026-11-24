#!/usr/bin/env node
// Light-parity check for option A (trail-perf-options.html, dev only). Paints the same long trail with today's bloom +
// thread only (no keyline, no sparkles), then with coarse pieces (one per --tiles of route), and prints the summed alpha
// coverage of the real trail canvas for each; --shots=<dir> also saves a crop per row to compare by eye.
// --layer=bloom|thread|both; --gain=1,1.3 tries coarse bloom alpha gains (coarseBloomGain). Usage:
//   node scripts/analysis/trail-perf-options-calibrate.mjs --base-url=http://127.0.0.1:5192 --channel=chrome --tiles=1 --gain=1,1.3
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const baseUrl = arg('base-url', 'http://127.0.0.1:5192');
const level = Number(arg('level', '300'));
const layer = arg('layer', 'both');
const grid = arg('tiles', '1').split(',').map(Number);
const gains = arg('gain', '1').split(',').map(Number);

const browser = await chromium.launch(arg('channel', '') ? { channel: arg('channel', '') } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/trail-perf-options.html?previewLevel=${level}&runtimeDiagnostics=1&autoTrail=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MAZER_TRAIL_PERF__ && window.__MAZER_QA__ && window.__MAZER_GAME__?.scene?.scenes?.some((s) => s.boardTileLayer), null, { timeout: 180000 });
  await page.waitForFunction(() => {
    const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
    return Boolean(scene && scene.maze && scene.mode === 'play' && !scene.isLegacyPlayLifecycleInputLocked());
  }, null, { timeout: 240000, polling: 500 });
  await page.evaluate(() => window.__MAZER_TRAIL_PERF__.fillLongTrail(2));
  await page.waitForTimeout(1500);

  const light = async (changes) => {
    await page.evaluate((c) => window.__MAZER_TRAIL_PERF__.usePlan(c), changes);
    await page.waitForTimeout(1500);
    return page.evaluate(() => {
      const scene = window.__MAZER_GAME__.scene.scenes.find((s) => s.boardTileLayer);
      const canvas = scene.trailCanvasTexture.getSourceImage();
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;
        // Coverage only (alpha), not RGB: the colours drift round the rainbow between rows and hues differ in RGB sum.
        lit += 1;
        sum += a;
      }
      return { sum: Math.round(sum / 1000), lit };
    });
  };
  const shotDir = arg('shots', '');
  const shot = async (name) => {
    if (shotDir) await page.screenshot({ path: `${shotDir}/calib-${name}.png`, clip: { x: 140, y: 0, width: 250, height: 330 } });
  };

  const base = { keyline: false, fills: false, still: true };
  const only = (mode) => (layer === 'bloom' ? { thread: 'off', bloom: mode } : layer === 'thread' ? { bloom: 'off', thread: mode } : { bloom: mode, thread: mode });
  for (const tiles of grid) {
    for (const gain of gains) {
      // Today is re-measured next to every coarse row, so slow drift in the trail's colours/alpha cancels in the ratio.
      const today = await light({ ...base, ...only('shipped') });
      console.log(JSON.stringify({ row: 'today', layer, ...today }));
      await shot(`${layer}-today`);
      const r = await light({ ...base, ...only('coarse'), coarseTiles: tiles, coarseBloomGain: gain });
      console.log(JSON.stringify({ row: 'coarse', layer, coarseTiles: tiles, gain, ...r, ratio: Number((r.sum / today.sum).toFixed(3)) }));
      await shot(`${layer}-coarse-${tiles}-${gain}`);
    }
  }
} finally {
  await browser.close();
}
