// Measures progression-level maze generation time in a real Chromium, optionally
// under CDP CPU throttling (a 4x throttle approximates a mid-range phone).
//
//   node scripts/analysis/progression-generation-timing.mjs [--levels=2,5,10,...] [--seeds=30] [--throttle=1,4] [--out=<dir>]
//
// It starts this checkout's Vite dev server (no deploy, no network beyond
// localhost), loads the legacy generation module in the page through Vite's
// module graph, runs the same call the game makes (createLegacyRuntimeMazeForMode
// with the progression profile) and reports per-level ms (mean / p95 / max).
// Dev-server modules are unminified; a production build is not slower.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const levels = arg('levels', '2,3,5,10,20,40,60,80,100,120,140,160,185,198,220,240,268,1000').split(',').map(Number);
const seeds = Number(arg('seeds', '30'));
const throttles = arg('throttle', '1,4').split(',').map(Number);
const outDir = arg('out', '');
// Dev servers of this repo use port 5531 only (a different one with --port, never a random one).
const fixedPort = Number(arg('port', '5531'));

const port = fixedPort;
const vite = spawn(process.execPath, [resolve(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
});
const stopVite = () => new Promise((done) => {
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(vite.pid), '/t', '/f'], { stdio: 'ignore' });
    killer.on('exit', () => done());
    killer.on('error', () => done());
  } else { vite.kill('SIGTERM'); done(); }
});
const baseUrl = `http://127.0.0.1:${port}`;
const started = Date.now();
for (;;) {
  try { if ((await fetch(baseUrl)).ok) break; } catch { /* starting */ }
  if (Date.now() - started > 60000) { await stopVite(); throw new Error('vite did not start'); }
  await new Promise((r) => setTimeout(r, 300));
}

const results = [];
try {
  const browser = await chromium.launch();
  for (const rate of throttles) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const data = await page.evaluate(async ({ levelList, seedCount }) => {
      const lifecycle = await import('/src/legacy-runtime/legacyGenerationLifecycle.ts');
      const progression = await import('/src/legacy-runtime/legacyProgression.ts');
      const base = progression.createEmptyLegacyProgressionState().tracks.player;
      const boards = [['phone', 23 / 51], ['desktop', 45 / 27]];
      const out = [];
      // Warm-up so JIT and module init are not charged to the first level.
      for (let i = 0; i < 6; i += 1) {
        lifecycle.createLegacyRuntimeMazeForMode('play', 35, 9000 + i, progression.resolveLegacyMazeGenerationProfileForProgression({ ...base, level: '50', targetComplexity: 204 }), {}, 23 / 51);
      }
      for (const level of levelList) {
        const track = { ...base, level: String(level), targetComplexity: Math.min(400, 8 + ((level - 1) * 4)) };
        const profile = progression.resolveLegacyMazeGenerationProfileForProgression(track);
        for (const [name, ratio] of boards) {
          const times = [];
          for (let i = 0; i < seedCount; i += 1) {
            const t0 = performance.now();
            lifecycle.createLegacyRuntimeMazeForMode('play', 35, 1337 + (i * 104729), profile, {}, ratio);
            times.push(performance.now() - t0);
          }
          out.push({ level, board: name, times });
        }
      }
      return out;
    }, { levelList: levels, seedCount: seeds });
    for (const row of data) {
      const sorted = [...row.times].sort((a, b) => a - b);
      results.push({
        throttle: rate, level: row.level, board: row.board,
        mean: row.times.reduce((a, b) => a + b, 0) / row.times.length,
        p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
        max: sorted[sorted.length - 1]
      });
    }
    await context.close();
  }
  await browser.close();
} finally {
  await stopVite();
}

for (const row of results) {
  console.log(`throttle ${row.throttle}x level ${row.level} ${row.board}: mean ${row.mean.toFixed(1)} p95 ${row.p95.toFixed(1)} max ${row.max.toFixed(1)} ms`);
}
for (const rate of throttles) {
  const rows = results.filter((r) => r.throttle === rate);
  const typical = rows.map((r) => r.mean);
  console.log(`throttle ${rate}x: per-level mean ms over ${rows.length} (level,board) cells: median ${typical.sort((a, b) => a - b)[Math.floor(typical.length / 2)].toFixed(0)}, worst mean ${Math.max(...rows.map((r) => r.mean)).toFixed(0)}, worst p95 ${Math.max(...rows.map((r) => r.p95)).toFixed(0)}, worst single ${Math.max(...rows.map((r) => r.max)).toFixed(0)}`);
}
if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/generation-timing.json`, JSON.stringify({ levels, seeds, throttles, results }, null, 2));
}
